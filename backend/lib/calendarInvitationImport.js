'use strict';

const ICAL = require('ical.js');
const { googleCalendarEventTimes } = require('./googleCalendarEventTimes');

const MAX_FILE_BYTES = 512 * 1024;
const MAX_EVENTS = 500;
const DAY = 86400000;

function bad(message) { const error = new Error(message); error.status = 400; return error; }
function instant(time, property) {
    if (!time) throw bad('חסר תאריך בזימון');
    const tzid = property?.getParameter('tzid');
    if (time.zone?.tzid !== 'floating' && time.zone?.tzid !== 'local') return time.toJSDate().toISOString();
    const zone = tzid || 'Asia/Jerusalem';
    let clock;
    try { clock = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
    catch { throw bad(`אזור הזמן בזימון אינו נתמך: ${zone}`); }
    const wall = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
    let guess = wall;
    for (let i = 0; i < 6; i++) {
        const p = Object.fromEntries(clock.formatToParts(new Date(guess)).map(x => [x.type, Number(x.value)]));
        const next = guess + wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
        if (next === guess) return new Date(guess).toISOString();
        guess = next;
    }
    throw bad('שעה לא תקינה במעבר שעון בזימון');
}
function eventTimes(start, end, component) {
    if (start?.isDate) {
        const times = googleCalendarEventTimes({ start: { date: start.toString() }, end: { date: end.toString() } });
        if (!times) throw bad('טווח התאריכים בזימון אינו תקין');
        return times;
    }
    const startTime = instant(start, component.getFirstProperty('dtstart'));
    const endTime = instant(end, component.getFirstProperty('dtend') || component.getFirstProperty('dtstart'));
    if (Date.parse(endTime) < Date.parse(startTime)) throw bad('שעת הסיום בזימון קודמת להתחלה');
    return { startTime, endTime, allDay: false };
}
function recurrenceKey(time, component) {
    if (!time) return '';
    return time.isDate ? time.toString() : instant(time, component.getFirstProperty('recurrence-id') || component.getFirstProperty('dtstart'));
}
function rowFor(event, component, method, start, end, recurrenceId) {
    const organizer = String(component.getFirstPropertyValue('organizer') || '').replace(/^mailto:/i, '').trim().toLowerCase();
    const uid = String(event.uid || '').trim();
    if (!uid || uid.length > 1000) throw bad('חסר מזהה זימון תקין');
    if (!organizer || organizer.length > 320 || /[\s<>\r\n]/.test(organizer) || !organizer.includes('@')) throw bad('חסרה כתובת מארגן תקינה בזימון');
    const cancelled = method === 'CANCEL' || component.getFirstPropertyValue('status') === 'CANCELLED';
    const stamp = component.getFirstPropertyValue('dtstamp');
    const sequence = Number(component.getFirstPropertyValue('sequence') || 0);
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 2147483647) throw bad('מספר גרסת הזימון אינו תקין');
    return {
        uid, organizer, recurrenceKey: recurrenceKey(recurrenceId, component),
        sequence, stamp: stamp ? instant(stamp, component.getFirstProperty('dtstamp')) : null,
        title: String(event.summary || 'זימון ללא כותרת').slice(0, 1000),
        description: String(event.description || '').slice(0, 20000), location: String(event.location || '').slice(0, 2000),
        cancelled, ...((start && end) ? eventTimes(start, end, component) : {}),
    };
}

/** Parse locally only: never follow ATTACH/URL, execute VALARM, or send a response. */
function parseInvitationFile(content, now = Date.now()) {
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) throw bad('יש לבחור קובץ זימון עד 512KB');
    let root;
    try { root = new ICAL.Component(ICAL.parse(content)); } catch { throw bad('קובץ הזימון אינו תקין'); }
    if (root.name !== 'vcalendar') throw bad('יש לבחור קובץ זימון מסוג ICS');
    const method = String(root.getFirstPropertyValue('method') || 'PUBLISH').toUpperCase();
    if (!['REQUEST', 'PUBLISH', 'CANCEL'].includes(method)) throw bad('הקובץ מכיל תגובה לזימון ולא זימון להוספה ליומן');
    const components = root.getAllSubcomponents('vevent');
    if (!components.length || components.length > MAX_EVENTS) throw bad('הקובץ חייב להכיל בין 1 ל־500 אירועים');
    const rows = [], consumed = new Set();
    const from = now - 30 * DAY, to = now + 365 * DAY;
    let outsideWindow = 0;
    for (const component of components) {
        const event = new ICAL.Event(component);
        if (event.isRecurrenceException()) continue;
        if (component.hasProperty('rrule') || component.hasProperty('rdate')) {
            const exceptions = components.filter(c => c !== component && c.getFirstPropertyValue('uid') === event.uid && c.hasProperty('recurrence-id'));
            for (const exception of exceptions) { event.relateException(new ICAL.Event(exception)); consumed.add(exception); }
            const iterator = event.iterator();
            let iterations = 0, next;
            while ((next = iterator.next())) {
                if (++iterations > 20000) throw bad('הסדרה ארוכה מדי לייבוא מקובץ. יש לייבא אותה דרך היומן המחובר');
                const occurrence = event.getOccurrenceDetails(next);
                const item = rowFor(occurrence.item, occurrence.item.component, method, occurrence.startDate, occurrence.endDate, next);
                if (Date.parse(item.startTime) > to) break;
                if (Date.parse(item.endTime) < from) { outsideWindow++; continue; }
                rows.push(item);
                if (rows.length > MAX_EVENTS) throw bad('נמצאו מעל 500 מופעים בטווח הייבוא. יש לייבא דרך היומן המחובר');
            }
        } else rows.push(rowFor(event, component, method, event.startDate, event.startDate ? event.endDate : null, null));
    }
    for (const component of components) {
        const event = new ICAL.Event(component);
        if (event.isRecurrenceException() && !consumed.has(component)) rows.push(rowFor(event, component, method, event.startDate, event.startDate ? event.endDate : null, event.recurrenceId));
    }
    if (rows.length > MAX_EVENTS) throw bad('הקובץ מכיל יותר מדי אירועים');
    if (rows.some(row => !row.cancelled && !row.startTime)) throw bad('חסר מועד בזימון');
    const inWindow = rows.filter(row => {
        if (row.cancelled || (Date.parse(row.endTime) >= from && Date.parse(row.startTime) <= to)) return true;
        outsideWindow++; return false;
    });
    return { events: inWindow, outsideWindow, method };
}

module.exports = { parseInvitationFile, recurrenceKey, MAX_FILE_BYTES };
