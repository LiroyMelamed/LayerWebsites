'use strict';

/**
 * Quiet-window deferral for calendar reminders / invite SMS (Asia/Jerusalem).
 *
 * 1) Shabbat — dynamic Jerusalem candle lighting / Motzaei via @hebcal/core:
 *    - Start: Friday, 40 minutes before sunset (candle lighting)
 *    - End:   Saturday, at least 40 minutes after sunset (max of sunset+40, tzeit 8.5°)
 * 2) Nighttime UX — no sends 23:00–07:00 Israel time any day; defer to 07:00 next morning.
 *
 * Fail-closed: if dynamic calc fails, use a conservative Fri 15:00 → Sat 21:00 window.
 * NEVER fail open over the weekend.
 */

const TENANT_TZ = 'Asia/Jerusalem';
const FRIDAY = 5;
const SATURDAY = 6;

/** Minutes before Friday sunset (Jerusalem custom). */
const CANDLE_LIGHTING_OFFSET_MIN = 40;
/** Minimum minutes after Saturday sunset for Motzaei / Havdalah. */
const MIN_HAVDALAH_AFTER_SUNSET_MIN = 40;
/** Hebcal tzeit degrees (3 small stars); Motzaei uses later of this vs sunset+40. */
const TZEIT_DEGREES = 8.5;

const NIGHT_QUIET_START_MIN = 23 * 60; // 23:00
const NIGHT_QUIET_END_MIN = 7 * 60; // 07:00

/** Conservative fallback if Hebcal/Zmanim fails (fail closed — wider than real Shabbat). */
const FALLBACK_FRI_START_MIN = 15 * 60; // Fri 15:00
const FALLBACK_SAT_END_MIN = 21 * 60; // Sat 21:00

let _hebcalPromise = null;
let _jerusalemLocation = null;
const _windowCache = new Map(); // key: `yyyy-mm-dd` of Friday (IL) → { start, end }

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

/** Instant for y-m-d hh:mm in TENANT_TZ (server may be UTC). */
function _zonedInstant(year, month, day, hour, minute, timeZone = TENANT_TZ) {
    const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    for (let i = 0; i < 4; i++) {
        const p = _partsInTz(guess, timeZone);
        const desiredAsUtcMin = Date.UTC(year, month - 1, day, hour, minute) / 60000;
        const actualAsUtcMin = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) / 60000;
        const deltaMin = desiredAsUtcMin - actualAsUtcMin;
        if (deltaMin === 0) break;
        guess.setTime(guess.getTime() + deltaMin * 60000);
    }
    return guess;
}

function _addLocalDays(parts, days, timeZone = TENANT_TZ) {
    const noon = _zonedInstant(parts.year, parts.month, parts.day, 12, 0, timeZone);
    const shifted = new Date(noon.getTime() + days * 24 * 60 * 60 * 1000);
    return _partsInTz(shifted, timeZone);
}

function _fridayKey(parts) {
    // Normalize to the Friday that opens this Shabbat window.
    let fri = parts;
    if (parts.weekday === SATURDAY) fri = _addLocalDays(parts, -1);
    else if (parts.weekday !== FRIDAY) {
        // Mid-week: nearest upcoming Friday (for cache priming) or previous if after Motzaei.
        const delta = (FRIDAY - parts.weekday + 7) % 7;
        fri = _addLocalDays(parts, delta === 0 ? 0 : delta);
    }
    return `${fri.year}-${String(fri.month).padStart(2, '0')}-${String(fri.day).padStart(2, '0')}`;
}

function _localDateForZmanim(parts) {
    // Zmanim interprets Date in the location's tzid via civil date fields.
    return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

async function _loadHebcal() {
    if (!_hebcalPromise) {
        _hebcalPromise = import('@hebcal/core').catch((err) => {
            _hebcalPromise = null;
            throw err;
        });
    }
    return _hebcalPromise;
}

async function _getJerusalemLocation() {
    if (_jerusalemLocation) return _jerusalemLocation;
    const { Location } = await _loadHebcal();
    const loc = Location.lookup('Jerusalem');
    if (!loc) throw new Error('Location.lookup(Jerusalem) returned null');
    _jerusalemLocation = loc;
    return loc;
}

function _fallbackWindowForFriday(friParts, timeZone = TENANT_TZ) {
    const start = _zonedInstant(
        friParts.year, friParts.month, friParts.day,
        Math.floor(FALLBACK_FRI_START_MIN / 60), FALLBACK_FRI_START_MIN % 60,
        timeZone
    );
    const sat = _addLocalDays(friParts, 1, timeZone);
    const end = _zonedInstant(
        sat.year, sat.month, sat.day,
        Math.floor(FALLBACK_SAT_END_MIN / 60), FALLBACK_SAT_END_MIN % 60,
        timeZone
    );
    return { start, end, source: 'fallback' };
}

/**
 * Candle lighting (Fri) → Motzaei (Sat) for the Shabbat of the given instant.
 * Cached per Friday civil date in Asia/Jerusalem.
 */
async function getShabbatWindowAsync(when = new Date(), timeZone = TENANT_TZ) {
    const parts = _partsInTz(when, timeZone);
    let friParts = parts;
    if (parts.weekday === SATURDAY) friParts = _addLocalDays(parts, -1, timeZone);
    else if (parts.weekday !== FRIDAY) {
        // Use the Friday of the week containing `when` (back to Friday).
        const back = (parts.weekday - FRIDAY + 7) % 7;
        friParts = _addLocalDays(parts, -back, timeZone);
    }

    const key = `${friParts.year}-${String(friParts.month).padStart(2, '0')}-${String(friParts.day).padStart(2, '0')}`;
    if (_windowCache.has(key)) return _windowCache.get(key);

    try {
        const { Zmanim } = await _loadHebcal();
        const loc = await _getJerusalemLocation();

        const friDate = _localDateForZmanim(friParts);
        const satParts = _addLocalDays(friParts, 1, timeZone);
        const satDate = _localDateForZmanim(satParts);

        const zFri = new Zmanim(loc, friDate, false);
        const zSat = new Zmanim(loc, satDate, false);

        const candle = zFri.sunsetOffset(-CANDLE_LIGHTING_OFFSET_MIN, true);
        if (!(candle instanceof Date) || Number.isNaN(candle.getTime())) {
            throw new Error('Invalid candle-lighting Date from Zmanim');
        }

        const after40 = zSat.sunsetOffset(MIN_HAVDALAH_AFTER_SUNSET_MIN, true);
        let tzeit = null;
        try {
            tzeit = zSat.tzeit(TZEIT_DEGREES);
        } catch (_) {
            tzeit = null;
        }
        if (!(after40 instanceof Date) || Number.isNaN(after40.getTime())) {
            throw new Error('Invalid Motzaei Date from Zmanim');
        }
        const endMs = Math.max(
            after40.getTime(),
            (tzeit instanceof Date && !Number.isNaN(tzeit.getTime())) ? tzeit.getTime() : 0
        );
        const end = new Date(endMs);

        const win = { start: candle, end, source: 'hebcal' };
        _windowCache.set(key, win);
        return win;
    } catch (err) {
        console.error(
            '[shabbatDeferral] SEVERE: dynamic Jerusalem Shabbat calc failed; using conservative fallback Fri 15:00–Sat 21:00.',
            err?.message || err
        );
        const win = _fallbackWindowForFriday(friParts, timeZone);
        _windowCache.set(key, win);
        return win;
    }
}

/** Sync path used by scheduler hot path — uses cache or conservative fallback (never fail open). */
function getShabbatWindow(when = new Date(), timeZone = TENANT_TZ) {
    const parts = _partsInTz(when, timeZone);
    let friParts = parts;
    if (parts.weekday === SATURDAY) friParts = _addLocalDays(parts, -1, timeZone);
    else if (parts.weekday !== FRIDAY) {
        const back = (parts.weekday - FRIDAY + 7) % 7;
        friParts = _addLocalDays(parts, -back, timeZone);
    }
    const key = `${friParts.year}-${String(friParts.month).padStart(2, '0')}-${String(friParts.day).padStart(2, '0')}`;
    if (_windowCache.has(key)) return _windowCache.get(key);

    // Kick off async fill; for this call use fail-closed fallback so we never send on Shabbat.
    getShabbatWindowAsync(when, timeZone).catch(() => { /* logged inside */ });
    const win = _fallbackWindowForFriday(friParts, timeZone);
    // Do not cache fallback permanently if async may succeed — cache under a soft key only for this tick.
    return win;
}

function isInShabbatQuietWindow(date = new Date(), timeZone = TENANT_TZ) {
    const t = date instanceof Date ? date.getTime() : new Date(date).getTime();
    if (!Number.isFinite(t)) return true; // fail closed
    const win = getShabbatWindow(new Date(t), timeZone);
    return t >= win.start.getTime() && t < win.end.getTime();
}

function isInNightQuietWindow(date = new Date(), timeZone = TENANT_TZ) {
    const p = _partsInTz(date, timeZone);
    return p.minutesOfDay >= NIGHT_QUIET_START_MIN || p.minutesOfDay < NIGHT_QUIET_END_MIN;
}

/** True if Shabbat quiet OR nighttime quiet. */
function isInQuietWindow(date = new Date(), timeZone = TENANT_TZ) {
    return isInShabbatQuietWindow(date, timeZone) || isInNightQuietWindow(date, timeZone);
}

function _nextLocal0700(when, timeZone = TENANT_TZ) {
    const p = _partsInTz(when, timeZone);
    if (p.minutesOfDay < NIGHT_QUIET_END_MIN) {
        // Still before 07:00 today → today 07:00
        return _zonedInstant(p.year, p.month, p.day, 7, 0, timeZone);
    }
    // 23:00+ → tomorrow 07:00
    const next = _addLocalDays(p, 1, timeZone);
    return _zonedInstant(next.year, next.month, next.day, 7, 0, timeZone);
}

/**
 * If inside Shabbat quiet window, return Motzaei (window end). Else null.
 * Kept for callers that only care about Shabbat.
 */
function deferToMotzeiShabbat(when = new Date(), timeZone = TENANT_TZ) {
    if (!isInShabbatQuietWindow(when, timeZone)) return null;
    const win = getShabbatWindow(when, timeZone);
    return new Date(win.end.getTime());
}

/**
 * If `when` is in any quiet window, return the soonest allowed send instant.
 * Otherwise return null (send immediately).
 *
 * Order (iterated until stable):
 *   Shabbat → Motzaei; night → next 07:00; if 07:00 still Shabbat → Motzaei again.
 */
function deferQuietSendUntil(when = new Date(), timeZone = TENANT_TZ) {
    let cursor = when instanceof Date ? new Date(when.getTime()) : new Date(when);
    if (Number.isNaN(cursor.getTime())) {
        // Invalid input — fail closed to next Motzaei-ish fallback from "now"
        cursor = new Date();
    }
    const original = cursor.getTime();
    for (let i = 0; i < 6; i++) {
        if (isInShabbatQuietWindow(cursor, timeZone)) {
            const win = getShabbatWindow(cursor, timeZone);
            cursor = new Date(win.end.getTime());
            continue;
        }
        if (isInNightQuietWindow(cursor, timeZone)) {
            cursor = _nextLocal0700(cursor, timeZone);
            continue;
        }
        break;
    }
    return cursor.getTime() === original ? null : cursor;
}

/**
 * Effective fire time for a reminder that would otherwise fire at `naturalFireAt`.
 * Always returns a Date (never null).
 */
function effectiveFireAt(naturalFireAt, timeZone = TENANT_TZ) {
    const base = naturalFireAt instanceof Date ? naturalFireAt : new Date(naturalFireAt);
    const deferred = deferQuietSendUntil(base, timeZone);
    return deferred || base;
}

/**
 * Warm the Hebcal cache for the Shabbat containing `when` (and optionally next week).
 * Call from scheduler tick so sync paths get accurate windows.
 */
async function warmShabbatCache(when = new Date(), timeZone = TENANT_TZ) {
    await getShabbatWindowAsync(when, timeZone);
    const parts = _partsInTz(when, timeZone);
    const nextWeek = _addLocalDays(parts, 7, timeZone);
    const noon = _zonedInstant(nextWeek.year, nextWeek.month, nextWeek.day, 12, 0, timeZone);
    await getShabbatWindowAsync(noon, timeZone);
}

/** Test helper — clear window cache. */
function _clearCacheForTests() {
    _windowCache.clear();
}

module.exports = {
    TENANT_TZ,
    CANDLE_LIGHTING_OFFSET_MIN,
    MIN_HAVDALAH_AFTER_SUNSET_MIN,
    isInShabbatQuietWindow,
    isInNightQuietWindow,
    isInQuietWindow,
    deferToMotzeiShabbat,
    deferQuietSendUntil,
    effectiveFireAt,
    getShabbatWindow,
    getShabbatWindowAsync,
    warmShabbatCache,
    _clearCacheForTests,
};
