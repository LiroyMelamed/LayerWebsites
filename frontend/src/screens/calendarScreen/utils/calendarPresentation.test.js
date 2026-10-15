import {
    calendarAddDays, calendarConflictOwners, calendarDateKey, calendarEventConflict, calendarEventSearchText,
    calendarEventsForDay, calendarFormatDate, calendarOwnerIds, calendarOwners,
    calendarRsvp, calendarWeekDates,
} from './calendarPresentation';

const event = (id, start, end, extra = {}) => ({ id: String(id), title: `Event ${id}`, start, end, extendedProps: { eventType: 'appointment', managers: [{ userId: 1, name: 'First manager' }], ...extra } });

test('Jerusalem dates and civil-day arithmetic stay stable over DST and UTC midnight', () => {
    expect(calendarDateKey('2026-10-24T22:30:00Z')).toBe('2026-10-25');
    expect(calendarAddDays('2026-10-25', -1)).toBe('2026-10-24');
    expect(calendarAddDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(calendarWeekDates('2026-10-25')).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
    expect(calendarFormatDate('2026-10-25', 'en', { day: 'numeric' })).toBe('25');
});

test('timed midnight end excludes the following day but an event crossing midnight appears on both days', () => {
    const exact = event(1, '2026-10-12T23:00', '2026-10-13T00:00');
    const crossing = event(2, '2026-10-12T23:30', '2026-10-13T00:30');
    expect(calendarEventsForDay([exact, crossing], '2026-10-12')).toEqual([exact, crossing]);
    expect(calendarEventsForDay([exact, crossing], '2026-10-13')).toEqual([crossing]);
});

test('exclusive all-day end is not normalized twice and all-day events sort before appointments', () => {
    const holiday = { ...event(1, '2026-10-12', '2026-10-15'), allDay: true };
    const appointment = event(2, '2026-10-14T08:00', '2026-10-14T09:00');
    expect(calendarEventsForDay([appointment, holiday], '2026-10-14')).toEqual([holiday, appointment]);
    expect(calendarEventsForDay([holiday], '2026-10-15')).toEqual([]);
});

test('both offset ISO instants and offset-free Jerusalem wall times select the same day', () => {
    const instant = event(1, '2026-10-12T21:30:00Z', '2026-10-12T22:00:00Z');
    const wall = event(2, '2026-10-13T00:30', '2026-10-13T01:00');
    expect(calendarEventsForDay([instant, wall], '2026-10-13')).toEqual([instant, wall]);
    expect(calendarEventsForDay([instant, wall], '2026-10-12')).toEqual([]);
});

test('different managers in parallel do not conflict; any shared manager does, including a non-first participant', () => {
    const first = event(1, '2026-10-12T09:00', '2026-10-12T10:00', { managers: [{ userId: 1 }, { userId: 2 }] });
    const different = event(2, '2026-10-12T09:00', '2026-10-12T10:00', { managers: [{ userId: 3 }] });
    const shared = event(3, '2026-10-12T09:30', '2026-10-12T10:30', { managers: [{ userId: 2 }] });
    expect(calendarEventConflict(first, [first, different])).toBe(false);
    expect(calendarEventConflict(first, [first, shared])).toBe(true);
    expect(calendarConflictOwners(first, [shared], [{ UserId: 2, Name: 'Second manager' }])).toEqual([{ id: '2', name: 'Second manager', photo: '' }]);
    expect(calendarEventConflict(first, [first, { ...shared, id: '4', start: '2026-10-12T10:00' }])).toBe(false);
});

test('cancelled events, reminders and display-only holidays never produce conflict alerts', () => {
    const first = event(1, '2026-10-12T09:00', '2026-10-12T10:00');
    const variants = [
        event(2, first.start, first.end, { eventStatus: 'cancelled' }),
        event(3, first.start, first.end, { eventType: 'reminder' }),
        event(4, first.start, first.end, { hint: true }),
    ];
    expect(calendarEventConflict(first, variants)).toBe(false);
    expect(calendarEventConflict(variants[0], [first])).toBe(false);
});

test('participant list retains all managers, deduplicates identity and uses profile names/photos', () => {
    const meeting = event(1, '2026-10-12T09:00', '2026-10-12T10:00', { ownerId: 99, managers: [{ userId: 2 }, { userId: 1, name: 'First manager' }, { userId: 2 }] });
    expect(calendarOwnerIds(meeting)).toEqual(['2', '1']);
    expect(calendarOwners(meeting, [{ UserId: 2, Name: 'Second manager', PhotoUrl: '/avatar.png' }])[0]).toEqual({ id: '2', name: 'Second manager', photo: '/avatar.png' });
});

test('RSVP totals include all invited clients while uninvited clients are not counted', () => {
    const meeting = event(1, '2026-10-12T09:00', '2026-10-12T10:00', { clients: [{ inviteStatus: 'accepted' }, { invite_status: 'pending' }, { inviteStatus: 'none' }] });
    expect(calendarRsvp(meeting)).toEqual({ status: 'partial', accepted: 1, count: 2 });
    expect(calendarRsvp(event(2, meeting.start, meeting.end, { eventType: 'leave' }))).toBeNull();
});

test('search indexes the second manager, all clients, leads, case and long mixed-language title without mutating the event', () => {
    const meeting = event(1, '2026-10-12T09:00', '2026-10-12T10:00', {
        managers: [{ userId: 1, name: 'First' }, { userId: 2, name: 'Second' }],
        clients: [{ name: 'לקוח ראשון' }, { name: 'לקוחה שנייה', phone: '0501234567' }],
        leadParticipants: [{ name: 'Potential client', email: 'example@example.invalid' }], caseName: 'Case X', description: 'A'.repeat(300),
    });
    const original = JSON.stringify(meeting);
    const text = calendarEventSearchText(meeting);
    ['second', 'לקוחה שנייה', '0501234567', 'potential client', 'case x', 'a'.repeat(300)].forEach((value) => expect(text).toContain(value));
    expect(JSON.stringify(meeting)).toBe(original);
});

test('events spanning the fall DST change remain visible on the complete selected civil day', () => {
    const meeting = event(1, '2026-10-24T21:30:00Z', '2026-10-25T22:30:00Z');
    expect(calendarEventsForDay([meeting], '2026-10-25')).toEqual([meeting]);
    expect(calendarEventsForDay([meeting], '2026-10-26')).toEqual([meeting]);
    expect(calendarEventsForDay([meeting], '2026-10-27')).toEqual([]);
});

test('DB all-day inclusive and midnight-exclusive ends give the same civil coverage, including offset midnight', () => {
    const { calendarAllDayRange } = require('./calendarPresentation');
    expect(calendarAllDayRange('2026-10-11T21:00:00Z','2026-10-14T20:59:00Z')).toEqual({start:'2026-10-12',end:'2026-10-15'});
    expect(calendarAllDayRange('2026-10-12T00:00:00+03:00','2026-10-15T00:00:00+03:00')).toEqual({start:'2026-10-12',end:'2026-10-15'});
    expect(calendarAllDayRange('2026-10-12','2026-10-12')).toEqual({start:'2026-10-12',end:'2026-10-13'});
});
test('FullCalendar all-day civil strings take priority over browser-zone Date objects', () => {
    const holiday = {id:'1',allDay:true,startStr:'2026-10-12',endStr:'2026-10-13',start:new Date('2026-10-12T07:00Z'),end:new Date('2026-10-13T07:00Z')};
    expect(calendarEventsForDay([holiday],'2026-10-12')).toEqual([holiday]);
    expect(calendarEventsForDay([holiday],'2026-10-13')).toEqual([]);
});
