'use strict';

/**
 * Israel Shabbat quiet window for calendar reminders / invite SMS.
 * Quiet: Friday 17:00 → Saturday 20:30 (Asia/Jerusalem).
 * Deferred sends fire at Motzaei Shabbat = Saturday 20:30.
 */

const TENANT_TZ = 'Asia/Jerusalem';
const FRIDAY = 5; // JS getDay(): Sun=0 … Sat=6
const SATURDAY = 6;
const QUIET_START_MIN = 17 * 60; // Fri 17:00
const MOTZEI_MIN = 20 * 60 + 30; // Sat 20:30

function _partsInTz(date, timeZone = TENANT_TZ) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const map = {};
    for (const { type, value } of dtf.formatToParts(date)) {
        if (type !== 'literal') map[type] = value;
    }
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const hour = map.hour === '24' ? 0 : parseInt(map.hour, 10);
    return {
        year: parseInt(map.year, 10),
        month: parseInt(map.month, 10),
        day: parseInt(map.day, 10),
        weekday: weekdayMap[map.weekday] ?? 0,
        hour,
        minute: parseInt(map.minute, 10),
        minutesOfDay: hour * 60 + parseInt(map.minute, 10),
    };
}

/** Instant in TENANT_TZ for y-m-d at hh:mm. */
function _zonedInstant(year, month, day, hour, minute) {
    const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    // Correct for TZ offset by measuring formatted parts vs intended local time.
    for (let i = 0; i < 3; i++) {
        const p = _partsInTz(guess);
        const desiredAsUtcMin = Date.UTC(year, month - 1, day, hour, minute) / 60000;
        const actualAsUtcMin = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) / 60000;
        const deltaMin = desiredAsUtcMin - actualAsUtcMin;
        if (deltaMin === 0) break;
        guess.setTime(guess.getTime() + deltaMin * 60000);
    }
    return guess;
}

function isInShabbatQuietWindow(date = new Date(), timeZone = TENANT_TZ) {
    const p = _partsInTz(date, timeZone);
    if (p.weekday === FRIDAY && p.minutesOfDay >= QUIET_START_MIN) return true;
    if (p.weekday === SATURDAY && p.minutesOfDay < MOTZEI_MIN) return true;
    return false;
}

/**
 * If `when` is inside the quiet window, return Motzaei Shabbat (Sat 20:30) Date.
 * Otherwise return null (no deferral).
 */
function deferToMotzeiShabbat(when = new Date(), timeZone = TENANT_TZ) {
    if (!isInShabbatQuietWindow(when, timeZone)) return null;
    const p = _partsInTz(when, timeZone);
    let y = p.year;
    let m = p.month;
    let d = p.day;
    if (p.weekday === FRIDAY) {
        // Motzaei is the following Saturday
        const fri = _zonedInstant(y, m, d, 12, 0);
        const sat = new Date(fri.getTime() + 24 * 60 * 60 * 1000);
        const sp = _partsInTz(sat, timeZone);
        y = sp.year;
        m = sp.month;
        d = sp.day;
    }
    return _zonedInstant(y, m, d, 20, 30);
}

/**
 * Effective fire time for a reminder that would otherwise fire at `naturalFireAt`.
 */
function effectiveFireAt(naturalFireAt, timeZone = TENANT_TZ) {
    const deferred = deferToMotzeiShabbat(naturalFireAt, timeZone);
    return deferred || naturalFireAt;
}

module.exports = {
    TENANT_TZ,
    isInShabbatQuietWindow,
    deferToMotzeiShabbat,
    effectiveFireAt,
};
