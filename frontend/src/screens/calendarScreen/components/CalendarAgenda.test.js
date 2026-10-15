import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CalendarAgenda, CalendarDayRibbon, CalendarOwners, CalendarWeekOverview } from './CalendarAgenda';

const messages = {
    'calendar.openEventAria': 'Open {{title}} at {{time}}', 'calendar.allDay': 'All day',
    'calendar.moreEventsOpenDay': 'More {{count}} · open day', 'calendar.eventsCount': '{{count}} events',
    'calendar.inviteStatusPartial': '{{accepted}} of {{count}} accepted', 'calendar.overlapNotice': 'Overlap',
};
const t = (key, args = {}) => Object.entries(args).reduce((text, [name, value]) => text.replace(`{{${name}}}`, value), messages[key] || key);
const events = Array.from({ length: 4 }, (_, index) => ({
    id: String(index), title: `Meeting ${index}`, start: '2026-10-12T09:00', end: '2026-10-12T10:00',
    extendedProps: { eventType: 'appointment', managers: [{ userId: index + 1, name: `Manager ${index}` }], clients: [{ name: 'Client', inviteStatus: 'accepted' }, { name: 'Another client', inviteStatus: 'pending' }] },
}));

test('every parallel appointment opens its exact incumbent event callback, including long mixed text', () => {
    const onOpenEvent = jest.fn();
    const title = `שכירות PDF ${'Long text '.repeat(30)}`;
    const list = [...events, { ...events[0], id: 'long', title }];
    render(<CalendarAgenda events={list} date="2026-10-12" t={t} language="he" onOpenEvent={onOpenEvent} />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: `Open ${title} at 09:00–10:00`.replace(/\s+/g, ' ').trim() }));
    expect(onOpenEvent).toHaveBeenCalledWith(list[4]);
    expect(screen.getByText(title.trim())).toHaveAttribute('title', title);
    expect(screen.getAllByText('1 of 2 accepted')).toHaveLength(5);
});

test('mobile week covers seven distinct day groups, first two meetings and a more button that opens the correct day', () => {
    const onOpenDay = jest.fn();
    const onOpenEvent = jest.fn();
    render(<CalendarWeekOverview events={events} date="2026-10-12" t={t} language="en" onOpenDay={onOpenDay} onOpenEvent={onOpenEvent} />);
    expect(screen.getByRole('button', { name: /Monday.*12 October/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sunday.*11 October/ })).toBeInTheDocument();
    expect(screen.queryByText('Meeting 2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More 2 · open day' }));
    expect(onOpenDay).toHaveBeenCalledWith('2026-10-12');
    fireEvent.click(screen.getByRole('button', { name: 'Open Meeting 1 at 09:00–10:00' }));
    expect(onOpenEvent).toHaveBeenCalledWith(events[1]);
});

test('computed holiday is readable but cannot call the editor', () => {
    const onOpenEvent = jest.fn();
    const holiday = { ...events[0], id: 'holiday', title: 'Display holiday', allDay: true, start: '2026-10-12', end: '2026-10-13', extendedProps: { hint: true, eventType: 'holiday' } };
    render(<CalendarAgenda events={[holiday]} date="2026-10-12" t={t} language="en" onOpenEvent={onOpenEvent} />);
    expect(screen.getByText('Display holiday')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Display holiday'));
    expect(onOpenEvent).not.toHaveBeenCalled();
});

test('day ribbon selects the displayed civil day and labels the selected day accessibly in Arabic', () => {
    const onSelectDate = jest.fn();
    render(<CalendarDayRibbon events={events} date="2026-10-12" t={t} language="ar" onSelectDate={onSelectDate} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(7);
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(buttons[2]);
    expect(onSelectDate).toHaveBeenCalledWith('2026-10-13');
});

test('failed manager photo falls back to initials and every manager remains accessible', () => {
    const meeting = { ...events[0], extendedProps: { managers: [{ userId: 1, name: 'Dana Levy', photoUrl: '/broken.png' }, { userId: 2, name: 'Avi Cohen' }] } };
    render(<CalendarOwners event={meeting} names />);
    // Decorative photo lives inside the manager's labelled avatar.
    const photo = screen.getByAltText('');
    fireEvent.error(photo);
    expect(screen.getByText('DL')).toBeInTheDocument();
    expect(screen.getByText('AC')).toBeInTheDocument();
    expect(screen.getByText('Dana Levy · Avi Cohen')).toBeInTheDocument();
});
