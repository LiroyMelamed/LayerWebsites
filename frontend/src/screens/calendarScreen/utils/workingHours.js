/** Per-day firm working hours — shared by calendar view and platform settings. */

export const WEEKDAY_LABELS = [
    "ראשון",
    "שני",
    "שלישי",
    "רביעי",
    "חמישי",
    "שישי",
    "שבת",
];

const DEFAULT_START = "08:00";
const DEFAULT_END = "18:00";
const DEFAULT_VISIBLE_START = "05:00";
const DEFAULT_VISIBLE_END = "21:00";

function normalizeTime(str, fallback) {
    const m = /^(\d{2}):(\d{2})/.exec(String(str || ""));
    return m ? `${m[1]}:${m[2]}` : fallback;
}

/** HH:MM → FullCalendar slot time (HH:MM:SS). */
function toSlotTime(hhmm) {
    return `${normalizeTime(hhmm, "00:00")}:00`;
}

function hhmmToMinutes(hhmm) {
    const n = normalizeTime(hhmm, null);
    if (!n) return null;
    const [h, m] = n.split(":").map((x) => parseInt(x, 10));
    if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
    return h * 60 + m;
}

function parseWorkingDays(daysRaw) {
    return String(daysRaw || "")
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function defaultDayEntry(open = false) {
    return { open, start: DEFAULT_START, end: DEFAULT_END };
}

export function defaultSchedule() {
    const schedule = {};
    for (let d = 0; d <= 6; d++) {
        schedule[d] = defaultDayEntry(d <= 4);
    }
    return schedule;
}

export function parseScheduleJson(raw) {
    if (!raw) return null;
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== "object") return null;

        const schedule = {};
        for (let d = 0; d <= 6; d++) {
            const entry = parsed[String(d)] ?? parsed[d];
            if (!entry || typeof entry !== "object") {
                schedule[d] = defaultDayEntry(false);
                continue;
            }
            schedule[d] = {
                open: entry.open === true || entry.open === "true" || entry.open === 1 || entry.open === "1",
                start: normalizeTime(entry.start, DEFAULT_START),
                end: normalizeTime(entry.end, DEFAULT_END),
            };
        }
        return schedule;
    } catch {
        return null;
    }
}

export function buildScheduleFromLegacy(daysRaw, startRaw, endRaw) {
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

export function parseScheduleFromCalendarSettings(calSettings = {}) {
    const byDayRaw = calSettings?.WORKING_HOURS_BY_DAY?.effectiveValue;
    const parsed = parseScheduleJson(byDayRaw);
    if (parsed) return parsed;

    const daysRaw = calSettings?.WORKING_DAYS?.effectiveValue ?? "0,1,2,3,4";
    const startRaw = calSettings?.WORKING_HOURS_START?.effectiveValue ?? DEFAULT_START;
    const endRaw = calSettings?.WORKING_HOURS_END?.effectiveValue ?? DEFAULT_END;
    return buildScheduleFromLegacy(daysRaw, startRaw, endRaw);
}

export function serializeSchedule(schedule) {
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

function minutesToHhmm(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function deriveLegacySettings(schedule) {
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

    return {
        WORKING_DAYS: openDays.join(","),
        WORKING_HOURS_START: minStart != null ? minutesToHhmm(minStart) : DEFAULT_START,
        WORKING_HOURS_END: maxEnd != null ? minutesToHhmm(maxEnd) : DEFAULT_END,
    };
}

export function getHiddenDays(schedule) {
    return [0, 1, 2, 3, 4, 5, 6].filter((d) => !schedule[d]?.open);
}

export function getBusinessHours(schedule) {
    return [0, 1, 2, 3, 4, 5, 6]
        .filter((d) => schedule[d]?.open)
        .map((d) => ({
            daysOfWeek: [d],
            startTime: schedule[d].start,
            endTime: schedule[d].end,
        }));
}

/**
 * Visible clock range for FullCalendar (slotMinTime / slotMaxTime).
 * Platform admin sets CALENDAR_VISIBLE_HOURS_START / _END.
 */
export function parseVisibleSlotRangeFromSettings(calSettings = {}) {
    let start = normalizeTime(
        calSettings?.CALENDAR_VISIBLE_HOURS_START?.effectiveValue
            ?? calSettings?.CALENDAR_VISIBLE_HOURS_START,
        DEFAULT_VISIBLE_START,
    );
    let end = normalizeTime(
        calSettings?.CALENDAR_VISIBLE_HOURS_END?.effectiveValue
            ?? calSettings?.CALENDAR_VISIBLE_HOURS_END,
        DEFAULT_VISIBLE_END,
    );
    const startMin = hhmmToMinutes(start);
    const endMin = hhmmToMinutes(end);
    if (startMin == null || endMin == null || endMin <= startMin) {
        start = DEFAULT_VISIBLE_START;
        end = DEFAULT_VISIBLE_END;
    }
    return { min: toSlotTime(start), max: toSlotTime(end), start, end };
}

export function getSlotRange(scheduleOrRange) {
    if (scheduleOrRange && typeof scheduleOrRange === "object"
        && (scheduleOrRange.min || scheduleOrRange.start)) {
        if (scheduleOrRange.min && scheduleOrRange.max) {
            return { min: scheduleOrRange.min, max: scheduleOrRange.max };
        }
        return parseVisibleSlotRangeFromSettings({
            CALENDAR_VISIBLE_HOURS_START: scheduleOrRange.start,
            CALENDAR_VISIBLE_HOURS_END: scheduleOrRange.end,
        });
    }
    return {
        min: toSlotTime(DEFAULT_VISIBLE_START),
        max: toSlotTime(DEFAULT_VISIBLE_END),
    };
}

export function getDayHours(schedule, dayOfWeek) {
    const day = schedule[dayOfWeek];
    if (!day?.open) {
        return { open: false, start: DEFAULT_START, end: DEFAULT_END };
    }
    return {
        open: true,
        start: normalizeTime(day.start, DEFAULT_START),
        end: normalizeTime(day.end, DEFAULT_END),
    };
}

export function getDayOfWeekFromDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.getDay();
}
