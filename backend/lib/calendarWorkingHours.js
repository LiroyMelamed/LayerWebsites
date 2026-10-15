/**
 * Firm calendar working-hours schedule (per weekday).
 * Stored in platform_settings as WORKING_HOURS_BY_DAY (JSON).
 * Legacy WORKING_DAYS + WORKING_HOURS_START/END are kept in sync for compatibility.
 */

const HEBREW_DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const TENANT_TIME_ZONE = 'Asia/Jerusalem';
const DEFAULT_START = '08:00';
const DEFAULT_END = '18:00';

function hhmmToMinutes(str) {
    const m = /^(\d{2}):(\d{2})/.exec(String(str || ''));
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function normalizeTime(str, fallback) {
    const m = /^(\d{2}):(\d{2})/.exec(String(str || ''));
    return m ? `${m[1]}:${m[2]}` : fallback;
}

function parseWorkingDays(daysRaw) {
    return String(daysRaw || '')
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function defaultDayEntry(open = false) {
    return { open, start: DEFAULT_START, end: DEFAULT_END };
}

function defaultSchedule() {
    const schedule = {};
    for (let d = 0; d <= 6; d++) {
        schedule[d] = defaultDayEntry(d <= 4);
    }
    return schedule;
}

function parseScheduleJson(raw) {
    if (!raw) return null;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== 'object') return null;

        const schedule = {};
        for (let d = 0; d <= 6; d++) {
            const entry = parsed[String(d)] || parsed[d];
            if (!entry || typeof entry !== 'object') {
                schedule[d] = defaultDayEntry(false);
                continue;
            }
            const start = normalizeTime(entry.start, DEFAULT_START);
            const end = normalizeTime(entry.end, DEFAULT_END);
            schedule[d] = {
                open: entry.open === true || entry.open === 'true' || entry.open === 1 || entry.open === '1',
                start,
                end,
            };
        }
        return schedule;
    } catch {
        return null;
    }
}

function buildScheduleFromLegacy(daysRaw, startRaw, endRaw) {
    const openDays = new Set(parseWorkingDays(daysRaw));
    const start = normalizeTime(startRaw, DEFAULT_START);
    const end = normalizeTime(endRaw, DEFAULT_END);
    const schedule = {};
    for (let d = 0; d <= 6; d++) {
        schedule[d] = {
            open: openDays.has(d),
            start,
            end,
        };
    }
    return schedule;
}

function serializeSchedule(schedule) {
    const out = {};
    for (let d = 0; d <= 6; d++) {
        const day = schedule[d] || defaultDayEntry(false);
        out[String(d)] = {
            open: !!day.open,
            start: normalizeTime(day.start, DEFAULT_START),
            end: normalizeTime(day.end, DEFAULT_END),
        };
    }
    return JSON.stringify(out);
}

function deriveLegacySettings(schedule) {
    const openDays = [];
    let minStart = null;
    let maxEnd = null;

    for (let d = 0; d <= 6; d++) {
        const day = schedule[d];
        if (!day?.open) continue;
        openDays.push(d);
        const startMin = hhmmToMinutes(day.start);
        const endMin = hhmmToMinutes(day.end);
        if (startMin != null && (minStart == null || startMin < minStart)) minStart = startMin;
        if (endMin != null && (maxEnd == null || endMin > maxEnd)) maxEnd = endMin;
    }

    const minutesToHhmm = (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    return {
        WORKING_DAYS: openDays.join(','),
        WORKING_HOURS_START: minStart != null ? minutesToHhmm(minStart) : DEFAULT_START,
        WORKING_HOURS_END: maxEnd != null ? minutesToHhmm(maxEnd) : DEFAULT_END,
    };
}

function localDayAndMinutes(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TENANT_TIME_ZONE,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const wd = parts.find((p) => p.type === 'weekday')?.value;
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10) % 24;
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    return { day: weekdayMap[wd], minutes: hour * 60 + minute };
}

function getOpenDays(schedule) {
    const days = [];
    for (let d = 0; d <= 6; d++) {
        if (schedule[d]?.open) days.push(d);
    }
    return days;
}

/**
 * Load schedule from settings service (per-day JSON or legacy keys).
 */
async function loadWorkingSchedule(settingsService) {
    const byDayRaw = await settingsService.getSetting('calendar', 'WORKING_HOURS_BY_DAY', null);
    const parsed = parseScheduleJson(byDayRaw);
    if (parsed) return parsed;

    const daysRaw = await settingsService.getSetting('calendar', 'WORKING_DAYS', '0,1,2,3,4');
    const startRaw = await settingsService.getSetting('calendar', 'WORKING_HOURS_START', DEFAULT_START);
    const endRaw = await settingsService.getSetting('calendar', 'WORKING_HOURS_END', DEFAULT_END);
    return buildScheduleFromLegacy(daysRaw, startRaw, endRaw);
}

/**
 * Validate that an event falls within the firm's per-day working schedule.
 * Returns { ok: true } or { ok: false, message }.
 */
function validateEventAgainstSchedule(startTime, endTime, allDay, schedule) {
    const openDays = getOpenDays(schedule);
    if (!openDays.length) return { ok: true };

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start) || isNaN(end)) return { ok: true };

    const startInfo = localDayAndMinutes(start);
    const startDay = schedule[startInfo.day];

    if (!startDay?.open) {
        const openDayNames = openDays.map((d) => HEBREW_DAY_NAMES[d]).join(', ');
        return {
            ok: false,
            message: `המשרד פעיל בימים: ${openDayNames}. לא ניתן לקבוע אירוע ביום ${HEBREW_DAY_NAMES[startInfo.day]}.`,
        };
    }

    if (allDay) return { ok: true };

    const endInfo = localDayAndMinutes(end);
    const endDay = schedule[endInfo.day];

    if (!endDay?.open) {
        return {
            ok: false,
            message: `המשרד סגור ביום ${HEBREW_DAY_NAMES[endInfo.day]}. שעת הסיום מחוץ לימי הפעילות.`,
        };
    }

    const startOpenMin = hhmmToMinutes(startDay.start);
    const startCloseMin = hhmmToMinutes(startDay.end);
    const endOpenMin = hhmmToMinutes(endDay.start);
    const endCloseMin = hhmmToMinutes(endDay.end);

    if (startOpenMin == null || startCloseMin == null || endOpenMin == null || endCloseMin == null) {
        return { ok: true };
    }

    if (startInfo.minutes < startOpenMin || startInfo.minutes > startCloseMin) {
        return {
            ok: false,
            message: `ביום ${HEBREW_DAY_NAMES[startInfo.day]} שעות הפעילות הן ${startDay.start}–${startDay.end}. שעת ההתחלה מחוץ לטווח.`,
        };
    }

    if (endInfo.minutes > endCloseMin || endInfo.minutes < endOpenMin) {
        return {
            ok: false,
            message: `ביום ${HEBREW_DAY_NAMES[endInfo.day]} שעות הפעילות הן ${endDay.start}–${endDay.end}. שעת הסיום מחוץ לטווח.`,
        };
    }

    return { ok: true };
}

module.exports = {
    HEBREW_DAY_NAMES,
    DEFAULT_START,
    DEFAULT_END,
    defaultSchedule,
    parseScheduleJson,
    buildScheduleFromLegacy,
    serializeSchedule,
    deriveLegacySettings,
    loadWorkingSchedule,
    validateEventAgainstSchedule,
    hhmmToMinutes,
    localDayAndMinutes,
    getOpenDays,
};
