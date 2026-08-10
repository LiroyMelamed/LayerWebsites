/**
 * Expand a simple recurrence into concrete { start, end } occurrence pairs.
 * Used when creating repeating calendar events as individual rows.
 */

const MAX_OCCURRENCES = 52;

function addByFrequency(date, frequency) {
    const next = new Date(date.getTime());
    if (frequency === 'daily') {
        next.setDate(next.getDate() + 1);
    } else if (frequency === 'weekly') {
        next.setDate(next.getDate() + 7);
    } else if (frequency === 'monthly') {
        next.setMonth(next.getMonth() + 1);
    } else {
        next.setDate(next.getDate() + 7);
    }
    return next;
}

/**
 * @param {{ startTime: string|Date, endTime: string|Date, frequency: 'daily'|'weekly'|'monthly', until: string|Date }} opts
 * @returns {{ start: Date, end: Date }[]}
 */
function expandRecurrenceOccurrences({ startTime, endTime, frequency, until }) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
        return [];
    }

    const untilDate = new Date(until);
    if (Number.isNaN(untilDate.getTime())) return [{ start, end }];

    // Inclusive end-of-day for date-only until values.
    const untilEnd = new Date(untilDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(until).trim())) {
        untilEnd.setHours(23, 59, 59, 999);
    }

    const durationMs = end.getTime() - start.getTime();
    const freq = ['daily', 'weekly', 'monthly'].includes(frequency) ? frequency : 'weekly';
    const out = [];
    let cursor = new Date(start.getTime());

    while (cursor.getTime() <= untilEnd.getTime() && out.length < MAX_OCCURRENCES) {
        out.push({
            start: new Date(cursor.getTime()),
            end: new Date(cursor.getTime() + durationMs),
        });
        cursor = addByFrequency(cursor, freq);
    }

    return out.length ? out : [{ start, end }];
}

function buildRruleString(frequency, until, seriesId) {
    const freq = String(frequency || 'weekly').toUpperCase();
    const untilDate = new Date(until);
    let untilPart = '';
    if (!Number.isNaN(untilDate.getTime())) {
        const y = untilDate.getUTCFullYear();
        const m = String(untilDate.getUTCMonth() + 1).padStart(2, '0');
        const d = String(untilDate.getUTCDate()).padStart(2, '0');
        untilPart = `;UNTIL=${y}${m}${d}`;
    }
    const series = seriesId ? `;X-SERIES=${seriesId}` : '';
    return `FREQ=${freq}${untilPart}${series}`;
}

module.exports = {
    MAX_OCCURRENCES,
    expandRecurrenceOccurrences,
    buildRruleString,
};
