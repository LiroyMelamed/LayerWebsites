import { jerusalemParts, parseDatetimeLocal, TENANT_TZ, zonedJerusalemInstant } from '../../../functions/date/datetimeLocal';

const pad = (value) => String(value).padStart(2, '0');
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const offsetPattern = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function calendarRawEvent(event) {
    return event?.extendedProps || event || {};
}

export function calendarInstant(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (!value) return null;
    const raw = String(value);
    const instant = offsetPattern.test(raw) ? new Date(raw) : parseDatetimeLocal(raw);
    return instant && !Number.isNaN(instant.getTime()) ? instant : null;
}

export function calendarDateKey(value) {
    if (typeof value === 'string' && datePattern.test(value)) return value;
    const date = calendarInstant(value);
    const parts = date && jerusalemParts(date);
    return parts ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` : '';
}

/** Calendar arithmetic uses date-only UTC noon, independent of the browser and DST. */
export function calendarAddDays(value, amount) {
    const key = calendarDateKey(value);
    if (!key) return '';
    const date = new Date(`${key}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
}

/** DB all-day ends may be inclusive 23:59 or exclusive midnight. */
export function calendarAllDayRange(startValue, endValue) {
    const start = calendarDateKey(startValue);
    let inclusive = calendarDateKey(endValue) || start;
    const end = calendarInstant(endValue);
    const parts = end && jerusalemParts(end);
    if (parts && parts.hour === 0 && parts.minute === 0 && inclusive > start) inclusive = calendarAddDays(inclusive, -1);
    if (inclusive < start) inclusive = start;
    return { start, end: calendarAddDays(inclusive, 1) };
}

export function calendarWeekDates(value, firstDay = 0) {
    const key = calendarDateKey(value);
    if (!key) return [];
    const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
    const start = calendarAddDays(key, -((weekday - firstDay + 7) % 7));
    return Array.from({ length: 7 }, (_, index) => calendarAddDays(start, index));
}

export function calendarLocale(language) {
    const base = String(language || 'he').split('-')[0];
    return base === 'ar' ? 'ar' : base === 'he' ? 'he-IL' : 'en-GB';
}

export function calendarFormatDate(value, language, options = {}) {
    const key = calendarDateKey(value);
    if (!key) return '';
    // Date-only captions describe the chosen civil day, not an instant in the OS zone.
    return new Intl.DateTimeFormat(calendarLocale(language), { timeZone: 'UTC', ...options })
        .format(new Date(`${key}T12:00:00Z`));
}

export function calendarEventInterval(event) {
    const raw = calendarRawEvent(event);
    const start = calendarInstant(event?.allDay && event?.startStr ? event.startStr : event?.start ?? raw.startTime);
    let end = calendarInstant(event?.allDay && event?.endStr ? event.endStr : event?.end ?? raw.endTime);
    if (!start) return null;
    if (!end || end < start) end = start;
    return { start, end };
}

export function calendarEventsForDay(events, value) {
    const key = calendarDateKey(value);
    if (!key) return [];
    const [year, month, day] = key.split('-').map(Number);
    const next = calendarAddDays(key, 1).split('-').map(Number);
    const from = zonedJerusalemInstant(year, month, day);
    const to = zonedJerusalemInstant(...next);
    return (events || []).filter((event) => {
        const raw = calendarRawEvent(event);
        if (event.allDay ?? raw.allDay) {
            const start = calendarDateKey(event.startStr || event.start || raw.startTime);
            // FullCalendar EventInput has an exclusive end. Do not normalize it twice.
            const end = calendarDateKey(event.endStr || event.end || raw.endTime) || calendarAddDays(start, 1);
            return start <= key && key < end;
        }
        const interval = calendarEventInterval(event);
        if (!interval) return false;
        return interval.start < to && (interval.end > from
            || (interval.start.getTime() === interval.end.getTime() && interval.start >= from));
    }).sort((a, b) => {
        const allDayA = Boolean(a.allDay ?? calendarRawEvent(a).allDay);
        const allDayB = Boolean(b.allDay ?? calendarRawEvent(b).allDay);
        if (allDayA !== allDayB) return allDayA ? -1 : 1;
        const startA = calendarEventInterval(a)?.start.getTime() || 0;
        const startB = calendarEventInterval(b)?.start.getTime() || 0;
        return startA - startB || String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true });
    });
}

function personId(person) { return person?.userId ?? person?.UserId ?? person?.userid ?? person?.id; }
function personName(person) { return person?.name ?? person?.Name ?? ''; }
function personPhoto(person) {
    return person?.photoUrl ?? person?.PhotoUrl ?? person?.profileImageUrl ?? person?.ProfileImageUrl
        ?? person?.imageUrl ?? person?.ImageUrl ?? person?.photo ?? person?.Photo ?? '';
}

/** Explicit participants take priority over the creator, with every participant retained. */
export function calendarOwners(event, lawyers = []) {
    const raw = calendarRawEvent(event);
    const people = Array.isArray(raw.managers) && raw.managers.length ? raw.managers
        : raw.managerUserId != null ? [{ userId: raw.managerUserId, name: raw.managerName }]
            : raw.ownerId != null || raw.ownerName ? [{ userId: raw.ownerId, name: raw.ownerName }] : [];
    const seen = new Set();
    return people.map((person) => {
        const id = personId(person);
        const matching = id != null ? lawyers.find((lawyer) => String(personId(lawyer)) === String(id)) : null;
        const name = personName(person) || personName(matching);
        return { id: id == null ? `name:${name}` : String(id), name, photo: personPhoto(person) || personPhoto(matching) };
    }).filter((person) => {
        if ((!person.name && person.id === 'name:') || seen.has(person.id)) return false;
        seen.add(person.id);
        return true;
    });
}

export function calendarOwnerIds(event) { return calendarOwners(event).map((person) => person.id); }

export function calendarInitials(name) {
    const words = String(name || '').trim().split(/\s+/u).filter(Boolean);
    return words.slice(0, 2).map((word) => Array.from(word)[0]).join('');
}

export function calendarIsCancelled(event) {
    const raw = calendarRawEvent(event);
    return ['cancelled', 'canceled'].includes(String(raw.eventStatus || raw.event_status || '').toLowerCase());
}

export function calendarIsDisplayOnly(event) {
    return Boolean(calendarRawEvent(event).hint);
}

export function calendarConflictOwners(event, events, lawyers = []) {
    if (calendarIsCancelled(event) || calendarIsDisplayOnly(event)) return [];
    const raw = calendarRawEvent(event);
    if (['holiday', 'reminder'].includes(raw.eventType || raw.event_type)) return [];
    const interval = calendarEventInterval(event);
    const owners = calendarOwnerIds(event);
    if (!interval || !owners.length || interval.end <= interval.start) return [];
    const shared = new Set();
    (events || []).forEach((other) => {
        if (other === event || (event.id != null && String(other.id) === String(event.id))
            || calendarIsCancelled(other) || calendarIsDisplayOnly(other)) return;
        if (['holiday', 'reminder'].includes(calendarRawEvent(other).eventType || calendarRawEvent(other).event_type)) return;
        const otherInterval = calendarEventInterval(other);
        if (otherInterval && interval.start < otherInterval.end && interval.end > otherInterval.start) {
            calendarOwnerIds(other).filter((id) => owners.includes(id)).forEach((id) => shared.add(id));
        }
    });
    return calendarOwners(event, lawyers).filter((person) => shared.has(person.id));
}

export function calendarEventConflict(event, events) { return calendarConflictOwners(event, events).length > 0; }

export function calendarRsvp(event) {
    const raw = calendarRawEvent(event);
    const type = raw.eventType || raw.event_type || 'appointment';
    if (!['appointment', 'hearing'].includes(type)) return null;
    const clients = Array.isArray(raw.clients) ? raw.clients : [];
    const statuses = clients.map((client) => client.inviteStatus || client.invite_status)
        .filter((status) => status && status !== 'none');
    const accepted = statuses.filter((status) => status === 'accepted').length;
    const count = statuses.length;
    if (count) {
        const status = accepted > 0 && accepted < count ? 'partial'
            : accepted === count ? 'accepted' : statuses.includes('pending') ? 'pending'
                : statuses.includes('declined') ? 'declined' : 'none';
        return { status, accepted, count };
    }
    return { status: raw.inviteStatus || 'none', accepted: 0, count: 0 };
}

export function calendarRsvpLabel(event, t) {
    const state = calendarRsvp(event);
    if (!state) return '';
    const keys = { accepted: 'inviteStatusAccepted', declined: 'inviteStatusDeclined', pending: 'inviteStatusPending', none: 'inviteStatusNone', partial: 'inviteStatusPartial' };
    return t(`calendar.${keys[state.status] || keys.none}`, { accepted: state.accepted, count: state.count });
}

export function calendarEventTime(event, language, t) {
    if (event?.allDay ?? calendarRawEvent(event).allDay) return t('calendar.allDay');
    const interval = calendarEventInterval(event);
    if (!interval) return '';
    const formatter = new Intl.DateTimeFormat(calendarLocale(language), { timeZone: TENANT_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return `${formatter.format(interval.start)}–${formatter.format(interval.end)}`;
}

export function calendarEventStartTime(event, language, t, displayDay) {
    if (event?.allDay ?? calendarRawEvent(event).allDay) return t('calendar.allDay');
    const interval = calendarEventInterval(event);
    if (!interval) return '';
    if (displayDay && calendarDateKey(interval.start) < calendarDateKey(displayDay)) return '00:00';
    return new Intl.DateTimeFormat(calendarLocale(language), { timeZone: TENANT_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(interval.start);
}

export function calendarEventPeopleText(event) {
    const raw = calendarRawEvent(event);
    return [...(raw.clients || []).map(personName), ...(raw.leadParticipants || []).map(personName), raw.leadName || '']
        .filter(Boolean).join(' · ');
}

export function calendarEventSearchText(event, lawyers = []) {
    const raw = calendarRawEvent(event);
    return [event?.title, raw.title, raw.description, raw.location, raw.caseName, raw.caseNumber,
        raw.zoomLink, raw.clientName, raw.clientPhone, raw.leadName, raw.leadPhone, raw.leadEmail,
        ...calendarOwners(event, lawyers).map((person) => person.name),
        ...[...(raw.clients || []), ...(raw.leadParticipants || [])].flatMap((person) => [personName(person), person.phone, person.email])]
        .filter(Boolean).join(' ').toLocaleLowerCase();
}

export function calendarEventTypeKey(event) {
    const type = calendarRawEvent(event).eventType || calendarRawEvent(event).event_type || 'appointment';
    return { appointment: 'eventTypeAppointmentSingular', leave: 'eventTypeLeaveSingular', hearing: 'eventTypeHearing', reminder: 'eventTypeReminder', holiday: 'eventTypeHolidaySingular' }[type] || 'eventTypeAppointmentSingular';
}
