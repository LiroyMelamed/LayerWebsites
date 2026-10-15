/** Concrete occurrences use the office's civil time, independently of the server TZ. */
const MAX_OCCURRENCES = 52;
const TIME_ZONE = 'Asia/Jerusalem';
const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function localStamp(date) {
    const p = Object.fromEntries(formatter.formatToParts(date).map(x => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second), date.getUTCMilliseconds());
}
function zonedInstant(stamp) {
    let guess = stamp;
    const seen = new Set();
    for (let i = 0; i < 6; i += 1) {
        const next = guess + stamp - localStamp(new Date(guess));
        if (next === guess) return new Date(guess);
        // A nonexistent spring-forward time is shifted forward by the gap.
        if (seen.has(next)) return new Date(Math.max(guess, next));
        seen.add(guess);
        guess = next;
    }
    return new Date(guess);
}
function occurrenceStamp(anchor, frequency, index) {
    const date = new Date(anchor);
    if (frequency === 'monthly') {
        const day = date.getUTCDate();
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() + index);
        const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(day, last));
    } else date.setUTCDate(date.getUTCDate() + index * (frequency === 'daily' ? 1 : 7));
    return date.getTime();
}
function expandRecurrenceOccurrences({ startTime, endTime, frequency, until }) {
    const start = new Date(startTime), end = new Date(endTime);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
    const untilDate = new Date(until);
    if (!Number.isFinite(untilDate.getTime())) return [];
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(until).trim());
    const untilStamp = dateOnly ? untilDate.getTime() + 86400000 - 1 : localStamp(untilDate);
    const anchor = localStamp(start), wallDuration = localStamp(end) - anchor;
    const freq = ['daily', 'weekly', 'monthly'].includes(frequency) ? frequency : 'weekly';
    const out = [];
    // Include one overflow occurrence so the caller can reject an oversized series.
    for (let index = 0; index <= MAX_OCCURRENCES; index += 1) {
        const stamp = occurrenceStamp(anchor, freq, index);
        if (stamp > untilStamp) break;
        out.push({ start: index === 0 ? start : zonedInstant(stamp), end: index === 0 ? end : zonedInstant(stamp + wallDuration) });
    }
    return out;
}
function buildRruleString(frequency, until, seriesId) {
    const freq = String(frequency || 'weekly').toUpperCase();
    const untilDate = new Date(until);
    let untilPart = '';
    if (Number.isFinite(untilDate.getTime())) {
        const y = untilDate.getUTCFullYear(), m = String(untilDate.getUTCMonth() + 1).padStart(2, '0'), d = String(untilDate.getUTCDate()).padStart(2, '0');
        untilPart = `;UNTIL=${y}${m}${d}`;
    }
    return `FREQ=${freq}${untilPart}${seriesId ? `;X-SERIES=${seriesId}` : ''}`;
}
module.exports = { MAX_OCCURRENCES, expandRecurrenceOccurrences, buildRruleString };
