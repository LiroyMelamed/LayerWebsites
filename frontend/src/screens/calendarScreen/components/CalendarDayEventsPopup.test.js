import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { openCalendarDayEvents } from './CalendarDayEventsPopup';
const t = (key, args = {}) => key === 'calendar.openEventAria' ? `Open ${args.title}` : key;
const make = (id, title, start) => ({ id, title, start, end: start.replace('10:00', '11:00'), extendedProps: { eventType: 'appointment' } });
test('More uses shared popup, includes visible and hidden events once, and opens exact meeting', () => {
    const visible = make('1', 'Visible meeting', '2026-11-17T10:00:00+02:00');
    const hidden = make('2', 'Hidden meeting', '2026-11-17T10:00:00+02:00');
    const anotherDay = make('3', 'Other day', '2026-11-18T10:00:00+02:00');
    const openPopup = jest.fn(), onOpenEvent = jest.fn();
    const handled = openCalendarDayEvents({ date: new Date('2026-11-17T00:00:00Z'), allSegs: [visible,hidden,hidden,anotherDay].map(event => ({event})) }, openPopup, { t, language: 'he', onOpenEvent });
    expect(handled).toBe(true);
    render(openPopup.mock.calls[0][0]);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText('Other day')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:'Open Hidden meeting'}));
    expect(onOpenEvent).toHaveBeenCalledWith(hidden);
    expect(document.querySelector('.fc-popover')).toBeNull();
});
