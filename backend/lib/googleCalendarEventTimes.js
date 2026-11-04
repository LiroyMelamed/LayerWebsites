'use strict';

const officeClock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function midnight(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
    const stamp = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date) return null;
    let guess = stamp;
    for (let i = 0; i < 6; i++) {
        const p = Object.fromEntries(officeClock.formatToParts(new Date(guess)).map(x => [x.type, Number(x.value)]));
        const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
        const next = guess + stamp - actual;
        if (next === guess) return guess;
        guess = next;
    }
    return null;
}

/** Google date-only ends are exclusive; our DB stores the last included instant.
 * Keep date-only events on their civil dates in the office's Jerusalem calendar.
 * https://developers.google.com/workspace/calendar/api/v3/reference/events
 */
function googleCalendarEventTimes(event) {
    if (event.start?.dateTime && event.end?.dateTime) {
        const start = Date.parse(event.start.dateTime), end = Date.parse(event.end.dateTime);
        return Number.isFinite(start) && Number.isFinite(end) && end >= start
            ? { startTime: event.start.dateTime, endTime: event.end.dateTime, allDay: false } : null;
    }
    if (event.start?.dateTime || event.end?.dateTime) return null;
    const start = midnight(event.start?.date), end = midnight(event.end?.date);
    if (start === null || end === null || end <= start) return null;
    return { startTime: new Date(start).toISOString(), endTime: new Date(end - 1).toISOString(), allDay: true };
}

module.exports = { googleCalendarEventTimes };
