import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PersonalSyncModal from './PersonalSyncModal';
import calendarApi from '../../../api/calendarApi';

const mockT = key => key;
const mockGoogleRefetch = jest.fn();
const mockOutlookRefetch = jest.fn();
let mockGoogleStatus = { connected: false };
let mockOutlookStatus = { connected: false };
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('../../../api/calendarApi', () => ({ __esModule: true, default: {
    getIcalToken: jest.fn(), rotateIcalToken: jest.fn(), getDailyAgendaSettings: jest.fn(), updateDailyAgendaSettings: jest.fn(),
    getGoogleStatus: jest.fn(), getOutlookStatus: jest.fn(), getGoogleAuthUrl: jest.fn(), getOutlookAuthUrl: jest.fn(),
    syncGoogleEvents: jest.fn(), syncOutlookEvents: jest.fn(), disconnectGoogle: jest.fn(), disconnectOutlook: jest.fn(),
} }));
jest.mock('../../../hooks/useAutoHttpRequest', () => ({ __esModule: true, default: fn => {
    const api = require('../../../api/calendarApi').default;
    return fn === api.getGoogleStatus ? { result: mockGoogleStatus, performRequest: mockGoogleRefetch } : { result: mockOutlookStatus, performRequest: mockOutlookRefetch };
} }));
const settings = { enabled: true, channels: 'push', sendTime: '08:45', deliveryWarning: null };
const ok = data => ({ success: true, status: 200, data });
const failure = message => ({ success: false, status: 500, data: { message } });
beforeEach(() => {
    jest.clearAllMocks();
    mockGoogleStatus = { connected: false }; mockOutlookStatus = { connected: false };
    calendarApi.getIcalToken.mockResolvedValue(ok({ token: 'synthetic-only', subscriptionUrl: 'webcal://calendar.example.invalid/feed/test', httpsSubscriptionUrl: 'https://calendar.example.invalid/feed/test' }));
    calendarApi.getDailyAgendaSettings.mockResolvedValue(ok({ settings }));
    calendarApi.updateDailyAgendaSettings.mockResolvedValue(ok({ settings }));
});
function saveButton() { return screen.getByRole('button', { name: 'calendar.dailyAgendaSave' }); }

test('save is disabled while settings are pending and cannot overwrite unloaded defaults', async () => {
    let resolveSettings;
    calendarApi.getDailyAgendaSettings.mockImplementationOnce(() => new Promise(resolve => { resolveSettings = resolve; }));
    render(<PersonalSyncModal />);
    await waitFor(() => expect(calendarApi.getDailyAgendaSettings).toHaveBeenCalledTimes(1));
    const disabled = screen.getAllByRole('button').find(button => button.disabled);
    expect(disabled).toBeDefined(); fireEvent.click(disabled);
    expect(calendarApi.updateDailyAgendaSettings).not.toHaveBeenCalled();
    await act(async () => resolveSettings(ok({ settings })));
    expect(saveButton()).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'calendar.reminderChannelPush' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'calendar.reminderChannelEmail' })).toHaveAttribute('aria-pressed', 'false');
});

test('resolved load failure shows a retry and keeps save disabled until successful reload', async () => {
    calendarApi.getDailyAgendaSettings.mockResolvedValueOnce(failure('Synthetic unavailable')).mockResolvedValueOnce(ok({ settings }));
    render(<PersonalSyncModal />);
    expect(await screen.findByText('calendar.dailyAgendaLoadError')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled(); fireEvent.click(saveButton());
    expect(calendarApi.updateDailyAgendaSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'calendar.retry' }));
    await waitFor(() => expect(saveButton()).not.toBeDisabled());
    expect(screen.queryByText('calendar.dailyAgendaLoadError')).not.toBeInTheDocument();
    expect(calendarApi.getDailyAgendaSettings).toHaveBeenCalledTimes(2);
});

test('resolved save failure never displays saved success; retry preserves push/time and self recipient contract', async () => {
    calendarApi.updateDailyAgendaSettings.mockResolvedValueOnce(failure('Synthetic save denied')).mockResolvedValueOnce(ok({ settings }));
    render(<PersonalSyncModal />); await waitFor(() => expect(saveButton()).not.toBeDisabled());
    fireEvent.click(saveButton()); expect(await screen.findByText('Synthetic save denied')).toBeInTheDocument();
    expect(screen.queryByText('calendar.dailyAgendaSaved')).not.toBeInTheDocument();
    fireEvent.click(saveButton()); expect(await screen.findByText('calendar.dailyAgendaSaved')).toBeInTheDocument();
    expect(calendarApi.updateDailyAgendaSettings).toHaveBeenLastCalledWith({ enabled: true, channels: 'push', recipients: '', sendTime: '08:45' });
});

test('uncertain delivery is shown as a localized warning without exposing backend receipt details', async () => {
    calendarApi.getDailyAgendaSettings.mockResolvedValue(ok({ settings: { ...settings, deliveryWarning: 'Synthetic receipt/internal details' } }));
    render(<PersonalSyncModal />);
    expect(await screen.findByRole('alert')).toHaveTextContent('calendar.dailyAgendaDeliveryUncertain');
    expect(screen.queryByText('Synthetic receipt/internal details')).not.toBeInTheDocument();
});

test('ical resolved load failure stays visible when subscribe retries fail without opening a link', async () => {
    calendarApi.getIcalToken.mockResolvedValue(failure('Synthetic ical failure'));
    render(<PersonalSyncModal />); expect(await screen.findByText('calendar.icalLoadError')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'calendar.icalSubscribeDevice' }));
    expect(await screen.findByText('calendar.icalLoadError')).toBeInTheDocument();
    expect(calendarApi.getIcalToken).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('webcal://calendar.example.invalid/feed/test')).not.toBeInTheDocument();
});

test('ical rotation failure retains the previously valid subscription and exposes failure', async () => {
    calendarApi.rotateIcalToken.mockResolvedValue(failure('Synthetic rotate failure'));
    render(<PersonalSyncModal />);
    expect(await screen.findByText('https://calendar.example.invalid/feed/test')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'calendar.icalRotate' }));
    expect(await screen.findByText('calendar.icalLoadError')).toBeInTheDocument();
    expect(screen.getByText('https://calendar.example.invalid/feed/test')).toBeInTheDocument();
});

test('a successful HTTP wrapper with absent settings cannot authorize saving defaults', async () => {
    calendarApi.getDailyAgendaSettings.mockResolvedValue(ok({})); render(<PersonalSyncModal />);
    expect(await screen.findByText('calendar.dailyAgendaLoadError')).toBeInTheDocument(); expect(saveButton()).toBeDisabled();
    fireEvent.click(saveButton()); expect(calendarApi.updateDailyAgendaSettings).not.toHaveBeenCalled();
});

test('saving reflects fresh uncertainty status instead of silently hiding a new delivery warning', async () => {
    calendarApi.updateDailyAgendaSettings.mockResolvedValueOnce(ok({ settings: { ...settings, deliveryWarning: 'Synthetic receipt details' } })).mockResolvedValueOnce(ok({ settings }));
    render(<PersonalSyncModal />); await waitFor(() => expect(saveButton()).not.toBeDisabled()); fireEvent.click(saveButton());
    expect(await screen.findByText('calendar.dailyAgendaSaved')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('calendar.dailyAgendaDeliveryUncertain');
    fireEvent.click(saveButton()); await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

test.each(['Google', 'Outlook'])('%s resolved sync failure never refreshes calendar as if successful', async provider => {
    if (provider === 'Google') mockGoogleStatus = { connected: true }; else mockOutlookStatus = { connected: true };
    const key = provider.toLowerCase(); const onEventsChanged = jest.fn();
    calendarApi[`sync${provider}Events`].mockResolvedValue(failure('Synthetic '+key+' failure'));
    render(<PersonalSyncModal onEventsChanged={onEventsChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'calendar.sync'+provider }));
    expect(await screen.findByText('Synthetic '+key+' failure')).toBeInTheDocument(); expect(onEventsChanged).not.toHaveBeenCalled();
});

test.each(['Google', 'Outlook'])('%s resolved disconnect failure is actionable and does not pretend to disconnect', async provider => {
    if (provider === 'Google') mockGoogleStatus = { connected: true }; else mockOutlookStatus = { connected: true };
    calendarApi[`disconnect${provider}`].mockResolvedValue(failure('Synthetic disconnect failure'));
    render(<PersonalSyncModal />); fireEvent.click(screen.getByRole('button', { name: 'calendar.disconnect'+provider }));
    expect(await screen.findByText('Synthetic disconnect failure')).toBeInTheDocument();
    expect(provider === 'Google' ? mockGoogleRefetch : mockOutlookRefetch).not.toHaveBeenCalled();
});
