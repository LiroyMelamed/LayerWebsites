/** ISO local datetime for `<input type="datetime-local">`. */
export function toDatetimeLocal(val) {
    if (!val) return "";
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d)) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseTimeHM(hm) {
    const [h, m] = String(hm || "08:00").split(":").map((x) => parseInt(x, 10));
    return { h: Number.isFinite(h) ? h : 8, m: Number.isFinite(m) ? m : 0 };
}

function applyTimeToDate(baseDate, hm) {
    const { h, m } = parseTimeHM(hm);
    const d = new Date(baseDate);
    d.setHours(h, m, 0, 0);
    return d;
}

/**
 * Default start/end for a new calendar event:
 * - Button click → today, within firm working hours, 1 hour long
 * - Day click → that day, same rules
 * - Timed drag in week/day view → use selection (minimum 1 hour, capped at work end)
 */
export function buildNewEventPrefill(selectInfo, { workingHoursStart = "08:00", workingHoursEnd = "18:00" } = {}) {
    if (selectInfo?.start && selectInfo?.end && !selectInfo.allDay) {
        const start = new Date(selectInfo.start);
        let end = new Date(selectInfo.end);
        if (end <= start) {
            end = new Date(start);
            end.setHours(end.getHours() + 1);
        }
        const dayCap = applyTimeToDate(start, workingHoursEnd);
        if (end > dayCap) end = dayCap;
        return {
            startTime: toDatetimeLocal(start),
            endTime: toDatetimeLocal(end),
            allDay: false,
        };
    }

    const base = selectInfo?.start ? new Date(selectInfo.start) : new Date();
    base.setHours(0, 0, 0, 0);

    let start = applyTimeToDate(base, workingHoursStart);
    const endCap = applyTimeToDate(base, workingHoursEnd);

    const now = new Date();
    const isToday = base.toDateString() === now.toDateString();
    if (isToday && now > start && now < endCap) {
        const bumped = new Date(now);
        if (bumped.getMinutes() > 0 || bumped.getSeconds() > 0 || bumped.getMilliseconds() > 0) {
            bumped.setHours(bumped.getHours() + 1, 0, 0, 0);
        } else {
            bumped.setMinutes(0, 0, 0);
        }
        if (bumped < endCap) start = bumped;
    }

    let end = new Date(start);
    end.setHours(end.getHours() + 1);
    if (end > endCap) {
        end = endCap;
        if (end <= start) {
            start = applyTimeToDate(base, workingHoursStart);
            end = new Date(start);
            end.setHours(end.getHours() + 1);
            if (end > endCap) end = endCap;
        }
    }

    return {
        startTime: toDatetimeLocal(start),
        endTime: toDatetimeLocal(end),
        allDay: false,
    };
}
