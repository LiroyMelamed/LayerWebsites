'use strict';

const ICAL = require('ical.js');

const emailPattern = /^[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+$/;
const officeDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
});
function civilDate(value) {
    const p = Object.fromEntries(officeDate.formatToParts(new Date(value)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
}
function invitationUid(event, domain) {
    const host = new URL(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`).hostname;
    if (!event.id || !host) throw new Error('Invalid calendar invitation identity');
    return `melamedia-event-${event.id}@${host}`;
}

/** One standard REQUEST per recipient. Never include other clients' contact details. */
function buildCalendarInvitation({ event, recipientEmail, organizerEmail, organizerName, domain }) {
    if (![recipientEmail, organizerEmail].every(value => emailPattern.test(String(value || '')))) {
        throw new Error('Invalid calendar invitation address');
    }
    const start = new Date(event.start_time), end = new Date(event.end_time);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
        throw new Error('Invalid calendar invitation time');
    }
    const calendar = new ICAL.Component(['vcalendar', [], []]);
    calendar.addPropertyWithValue('prodid', '-//Melamedia//Calendar//HE');
    calendar.addPropertyWithValue('version', '2.0');
    calendar.addPropertyWithValue('method', 'REQUEST');
    const component = new ICAL.Component('vevent');
    calendar.addSubcomponent(component);
    const invitation = new ICAL.Event(component);
    invitation.uid = invitationUid(event, domain);
    invitation.summary = String(event.title || 'פגישה');
    invitation.location = String(event.location || '');
    // The public invitation already contains the meeting details; internal case notes stay private.
    if (event.all_day) {
        const from = civilDate(start);
        // DB all-day events use an inclusive last instant, while iCalendar uses an exclusive end.
        const endClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(end);
        const endDay = civilDate(endClock === '00:00:00' && end > start ? new Date(end.getTime() - 1) : end);
        const next = new Date(`${endDay}T12:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        invitation.startDate = ICAL.Time.fromDateString(from);
        invitation.endDate = ICAL.Time.fromDateString(next.toISOString().slice(0, 10));
    } else {
        invitation.startDate = ICAL.Time.fromJSDate(start, true);
        invitation.endDate = ICAL.Time.fromJSDate(end, true);
    }
    const revision = new Date(event.updated_at || event.created_at || event.start_time);
    const sequence = Math.max(0, Math.floor((revision.getTime() - Date.UTC(2020, 0, 1)) / 1000));
    component.addPropertyWithValue('sequence', sequence);
    component.addPropertyWithValue('dtstamp', ICAL.Time.fromJSDate(revision, true));
    const organizer = component.addPropertyWithValue('organizer', `mailto:${organizerEmail}`);
    organizer.setParameter('cn', String(organizerName || 'המשרד'));
    const attendee = component.addPropertyWithValue('attendee', `mailto:${recipientEmail}`);
    attendee.setParameter('rsvp', 'TRUE');
    attendee.setParameter('partstat', 'NEEDS-ACTION');
    attendee.setParameter('role', 'REQ-PARTICIPANT');
    component.addPropertyWithValue('status', 'CONFIRMED');
    return { method: 'REQUEST', filename: 'invitation.ics', content: calendar.toString() };
}

module.exports = { buildCalendarInvitation, invitationUid, civilDate };
