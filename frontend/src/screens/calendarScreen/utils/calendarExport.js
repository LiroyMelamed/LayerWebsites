/**
 * Client-side helpers to add a meeting to Google Calendar or Apple/Outlook (.ics).
 */

function pad2(n) {
    return String(n).padStart(2, '0');
}

/** Format a Date as UTC ICS timestamp: 20260811T070000Z */
export function toIcsUtcStamp(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return (
        `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`
        + `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
    );
}

function escapeIcsText(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

/**
 * @param {{ title?: string, description?: string, location?: string, startTime: string|Date, endTime?: string|Date, allDay?: boolean }} invite
 */
export function buildGoogleCalendarUrl(invite) {
    const start = new Date(invite.startTime);
    if (Number.isNaN(start.getTime())) return '';
    let end = invite.endTime ? new Date(invite.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(end.getTime()) || end <= start) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
    }

    const params = new URLSearchParams();
    params.set('action', 'TEMPLATE');
    params.set('text', String(invite.title || 'פגישה'));
    if (invite.description) params.set('details', String(invite.description));
    if (invite.location) params.set('location', String(invite.location));

    if (invite.allDay) {
        const y = start.getFullYear();
        const m = pad2(start.getMonth() + 1);
        const day = pad2(start.getDate());
        const endDay = new Date(end);
        // Google all-day end is exclusive.
        if (endDay.getTime() <= start.getTime()) endDay.setDate(endDay.getDate() + 1);
        const ey = endDay.getFullYear();
        const em = pad2(endDay.getMonth() + 1);
        const ed = pad2(endDay.getDate());
        params.set('dates', `${y}${m}${day}/${ey}${em}${ed}`);
    } else {
        params.set('dates', `${toIcsUtcStamp(start)}/${toIcsUtcStamp(end)}`);
    }

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * @param {{ title?: string, description?: string, location?: string, startTime: string|Date, endTime?: string|Date, allDay?: boolean, uid?: string }} invite
 */
export function buildIcsContent(invite) {
    const start = new Date(invite.startTime);
    if (Number.isNaN(start.getTime())) return '';
    let end = invite.endTime ? new Date(invite.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(end.getTime()) || end <= start) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
    }

    const uid = String(invite.uid || `invite-${Date.now()}@melamedia`).replace(/[^\w.@-]/g, '');
    const stamp = toIcsUtcStamp(new Date());
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Melamedia//Calendar Invite//HE',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${toIcsUtcStamp(start)}`,
        `DTEND:${toIcsUtcStamp(end)}`,
        `SUMMARY:${escapeIcsText(invite.title || 'פגישה')}`,
    ];
    if (invite.description) lines.push(`DESCRIPTION:${escapeIcsText(invite.description)}`);
    if (invite.location) lines.push(`LOCATION:${escapeIcsText(invite.location)}`);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
}

export function downloadIcsFile(invite, filename = 'meeting.ics') {
    const content = buildIcsContent(invite);
    if (!content) return false;
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
}
