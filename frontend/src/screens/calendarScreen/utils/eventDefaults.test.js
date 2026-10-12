import { buildNewEventPrefill } from './eventDefaults';
import { zonedJerusalemInstant } from '../../../functions/date/datetimeLocal';

test('explicit evening slot stays valid after office closing hours', () => {
    const result = buildNewEventPrefill({ start: zonedJerusalemInstant(2026, 10, 12, 22), end: zonedJerusalemInstant(2026, 10, 12, 23), allDay: false });
    expect(result.startTime).toBe('2026-10-12T22:00');
    expect(result.endTime).toBe('2026-10-12T23:00');
});
test('an explicit range across midnight retains both selected dates', () => {
    const result = buildNewEventPrefill({ start: zonedJerusalemInstant(2026, 10, 12, 23, 30), end: zonedJerusalemInstant(2026, 10, 13, 0, 30), allDay: false });
    expect(result.endTime).toBe('2026-10-13T00:30');
});
test('inclusive editor end from an all-day exclusive range is correct across winter-clock switch', () => {
    const result = buildNewEventPrefill({ start: zonedJerusalemInstant(2026, 10, 24), end: zonedJerusalemInstant(2026, 10, 27), allDay: true });
    expect(result).toEqual({ startTime: '2026-10-24T00:00', endTime: '2026-10-26T23:59', allDay: true });
});
test('a ribbon/floating-add date uses that date and office defaults', () => {
    const result = buildNewEventPrefill({ start: zonedJerusalemInstant(2027, 2, 14, 12), allDay: false }, { workingSchedule: { 0: { open: true, start: '09:30', end: '17:00' } } });
    expect(result).toEqual({ startTime: '2027-02-14T09:30', endTime: '2027-02-14T10:30', allDay: false });
});
