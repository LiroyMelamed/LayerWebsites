import {
    toDatetimeLocal,
    jerusalemParts,
    zonedJerusalemInstant,
} from "../../../functions/date/datetimeLocal";

function parseTimeHM(hm) {
    const [h, m] = String(hm || "08:00").split(":").map((x) => parseInt(x, 10));
    return { h: Number.isFinite(h) ? h : 8, m: Number.isFinite(m) ? m : 0 };
}

/** Apply HH:MM as Asia/Jerusalem wall time on the Jerusalem calendar day of baseDate. */
function applyTimeToDate(baseDate, hm) {
    const { h, m } = parseTimeHM(hm);
    const p = jerusalemParts(baseDate) || jerusalemParts(new Date());
    if (!p) return new Date(baseDate);
    return zonedJerusalemInstant(p.year, p.month, p.day, h, m, 0);
}

function addJerusalemHours(date, hours) {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function isSameJerusalemDay(a, b) {
    const pa = jerusalemParts(a);
    const pb = jerusalemParts(b);
    if (!pa || !pb) return false;
    return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/**
 * Default start/end for a new calendar event:
 * - Button click → today, within firm working hours, 1 hour long
 * - Day click → that day, same rules
 * - Timed drag in week/day view → use selection (minimum 1 hour, capped at work end)
 */
export function buildNewEventPrefill(selectInfo, { workingSchedule, workingHoursStart, workingHoursEnd } = {}) {
    const base = selectInfo?.start ? new Date(selectInfo.start) : new Date();
    const baseParts = jerusalemParts(base) || jerusalemParts(new Date());
    const dayOfWeek = (() => {
        // Weekday in Asia/Jerusalem (0=Sun)
        const noon = zonedJerusalemInstant(baseParts.year, baseParts.month, baseParts.day, 12, 0, 0);
        // getUTCDay is wrong here; use Intl weekday
        const wd = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Jerusalem",
            weekday: "short",
        }).format(noon);
        const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        return map[wd] ?? noon.getDay();
    })();
    const dayEntry = workingSchedule?.[dayOfWeek];
    const hoursStart = dayEntry?.open ? dayEntry.start : (workingHoursStart || "08:00");
    const hoursEnd = dayEntry?.open ? dayEntry.end : (workingHoursEnd || "18:00");

    // Month / all-day selection: FullCalendar end is exclusive → convert to inclusive local day.
    if (selectInfo?.allDay && selectInfo?.start) {
        const startParts = jerusalemParts(selectInfo.start) || baseParts;
        const start = zonedJerusalemInstant(startParts.year, startParts.month, startParts.day, 0, 0, 0);
        let endInclusiveParts = startParts;
        if (selectInfo.end) {
            const endParts = jerusalemParts(selectInfo.end);
            if (endParts) {
                // Exclusive end → previous Jerusalem day
                const endNoon = zonedJerusalemInstant(endParts.year, endParts.month, endParts.day, 12, 0, 0);
                const prev = new Date(endNoon.getTime() - 24 * 60 * 60 * 1000);
                endInclusiveParts = jerusalemParts(prev) || startParts;
            }
        }
        let endInclusive = zonedJerusalemInstant(
            endInclusiveParts.year,
            endInclusiveParts.month,
            endInclusiveParts.day,
            23,
            59,
            0
        );
        if (endInclusive < start) {
            endInclusive = zonedJerusalemInstant(startParts.year, startParts.month, startParts.day, 23, 59, 0);
        }
        return {
            startTime: toDatetimeLocal(start),
            endTime: toDatetimeLocal(endInclusive),
            allDay: true,
        };
    }

    if (selectInfo?.start && selectInfo?.end && !selectInfo.allDay) {
        const start = new Date(selectInfo.start);
        let end = new Date(selectInfo.end);
        if (end <= start) {
            end = addJerusalemHours(start, 1);
        }
        const dayCap = applyTimeToDate(start, hoursEnd);
        if (end > dayCap) end = dayCap;
        return {
            startTime: toDatetimeLocal(start),
            endTime: toDatetimeLocal(end),
            allDay: false,
        };
    }

    let start = applyTimeToDate(base, hoursStart);
    const endCap = applyTimeToDate(base, hoursEnd);

    const now = new Date();
    if (isSameJerusalemDay(base, now) && now > start && now < endCap) {
        const nowParts = jerusalemParts(now);
        let bumpedHour = nowParts.hour;
        let bumpedMin = 0;
        if (nowParts.minute > 0 || nowParts.second > 0) {
            bumpedHour += 1;
        }
        let bumped = zonedJerusalemInstant(
            nowParts.year,
            nowParts.month,
            nowParts.day,
            bumpedHour,
            bumpedMin,
            0
        );
        if (bumped < endCap) start = bumped;
    }

    let end = addJerusalemHours(start, 1);
    if (end > endCap) {
        end = endCap;
        if (end <= start) {
            start = applyTimeToDate(base, hoursStart);
            end = addJerusalemHours(start, 1);
            if (end > endCap) end = endCap;
        }
    }

    return {
        startTime: toDatetimeLocal(start),
        endTime: toDatetimeLocal(end),
        allDay: false,
    };
}
