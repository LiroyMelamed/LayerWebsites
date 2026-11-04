'use strict';
const crypto = require('crypto');
const { googleCalendarEventTimes } = require('./googleCalendarEventTimes');
const iso = value => new Date(value).toISOString();
const civil = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const canonical = value => value && typeof value === 'object'
    ? (Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function localState(row) {
    if (!row || row.event_status === 'cancelled') return { cancelled: true };
    return { cancelled: false, title: row.title || '', description: row.description || '', location: row.location || '',
        time: { start: iso(row.start_time), end: iso(row.end_time), allDay: !!row.all_day } };
}
function remoteState(event) {
    if (event.status === 'cancelled') return { cancelled: true };
    const times = googleCalendarEventTimes(event);
    if (!times) throw new Error('GOOGLE_INVALID_EVENT_TIME');
    return { cancelled: false, title: (event.summary || '(ללא כותרת)').trim(), description: event.description || '', location: event.location || '',
        time: { start: iso(times.startTime), end: iso(times.endTime), allDay: times.allDay } };
}
function requestBody(state) {
    if (state.cancelled) return { status: 'cancelled' };
    const { start, end, allDay } = state.time;
    return { summary: state.title, description: state.description, location: state.location,
        start: allDay ? { date: civil(start) } : { dateTime: start, timeZone: 'Asia/Jerusalem' },
        end: allDay ? { date: civil(new Date(Date.parse(end) + 1)) } : { dateTime: end, timeZone: 'Asia/Jerusalem' } };
}
/** IDs are stable across retries AND transaction rollback. Hex is valid base32hex. */
function eventId(namespace, ownerId, eventId) {
    if (!namespace) throw new Error('GOOGLE_SYNC_NAMESPACE_REQUIRED');
    return 'm' + crypto.createHash('sha256').update(JSON.stringify([namespace, ownerId, eventId])).digest('hex');
}
/** Merge independent fields; never silently discard competing changes or resurrect a deletion. */
function reconcile(baseLocal, baseRemote, local, remote, resolution) {
    if (same(local, remote)) return { value: local };
    if (resolution === 'local') return { value: local };
    if (resolution === 'google') return { value: remote };
    const localChanged = !same(baseLocal, local), remoteChanged = !same(baseRemote, remote);
    if (!localChanged) return { value: remote };
    if (!remoteChanged) return { value: local };
    if (local.cancelled || remote.cancelled) return { conflict: true };
    const value = { ...remote };
    for (const key of ['title', 'description', 'location', 'time']) {
        const l = !same(baseLocal?.[key], local[key]), r = !same(baseRemote?.[key], remote[key]);
        if (l && r && !same(local[key], remote[key])) return { conflict: true };
        if (l) value[key] = local[key];
    }
    return { value };
}
function recurrenceKey(event) {
    return event.originalStartTime?.date || (event.originalStartTime?.dateTime ? iso(event.originalStartTime.dateTime) : '');
}
module.exports = { localState, remoteState, requestBody, eventId, reconcile, recurrenceKey, same };
