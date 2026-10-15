import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CalendarInviteScreen from './CalendarInviteScreen';
import ApiUtils from '../../api/apiUtils';
import { toastError, toastSuccess } from '../../components/ui/toast';

jest.mock('../../api/apiUtils', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../../components/ui/toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock('react-router-dom', () => ({ useParams: () => ({ token: 'synthetic-token' }) }));
const mockT = (key) => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
const invite = { title: 'Synthetic appointment', startTime: '2026-10-12T09:00:00+03:00', endTime: '2026-10-12T10:00:00+03:00', status: 'pending' };

test('a cancelled invitation returned by the server is shown without RSVP controls', async () => {
    ApiUtils.get.mockResolvedValue({ status: 410, success: false, data: { code: 'EVENT_CANCELLED', message: 'Cancelled' } });
    render(<CalendarInviteScreen />);
    expect(await screen.findByText('calendar.meetingCancelled')).toBeInTheDocument();
    expect(screen.queryByText('calendar.inviteAccept')).not.toBeInTheDocument();
});
test('a resolved HTTP failure is never shown as RSVP success', async () => {
    ApiUtils.get.mockResolvedValue({ status: 200, success: true, data: { invite } });
    ApiUtils.post.mockResolvedValue({ status: 500, success: false, data: { message: 'Try again' } });
    render(<CalendarInviteScreen />);
    fireEvent.click(await screen.findByText('calendar.inviteAccept'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Try again'));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByText('calendar.inviteAccept')).toBeInTheDocument();
});
test('cancellation while RSVP is open closes the active invitation instead of recording acceptance', async () => {
    ApiUtils.get.mockResolvedValue({ status: 200, success: true, data: { invite } });
    ApiUtils.post.mockResolvedValue({ status: 410, success: false, data: { code: 'EVENT_CANCELLED', message: 'Cancelled' } });
    render(<CalendarInviteScreen />);
    fireEvent.click(await screen.findByText('calendar.inviteAccept'));
    expect(await screen.findByText('calendar.meetingCancelled')).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText('calendar.inviteAccept')).not.toBeInTheDocument();
});
