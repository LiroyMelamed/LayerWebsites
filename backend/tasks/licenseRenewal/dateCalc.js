function toDateOnlyString(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseDateOnly(dateStr) {
    const s = String(dateStr || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map((n) => Number(n));
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    // Validate round-trip
    if (toDateOnlyString(dt) !== s) return null;
    return dt;
}

function daysInMonthUtc(year, month1to12) {
    // day 0 of next month is last day of current month
    return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function subtractMonthsClamp(dateUtc, months) {
    const monthsInt = Number(months);
    if (!Number.isFinite(monthsInt) || monthsInt < 0) throw new Error('months must be >= 0');

    const y = dateUtc.getUTCFullYear();
    const m = dateUtc.getUTCMonth() + 1;
    const d = dateUtc.getUTCDate();

    const total = (y * 12 + (m - 1)) - monthsInt;
    const ny = Math.floor(total / 12);
    const nm0 = total % 12;
    const nm = nm0 + 1;

    const maxDay = daysInMonthUtc(ny, nm);
    const nd = Math.min(d, maxDay);

    return new Date(Date.UTC(ny, nm - 1, nd));
}

function subtractDays(dateUtc, days) {
    const n = Number(days);
    if (!Number.isFinite(n) || n < 0) throw new Error('days must be >= 0');
    return new Date(dateUtc.getTime() - n * 24 * 60 * 60 * 1000);
}

function computeDueDate({ expiryDateUtc, reminderKey }) {
    const key = String(reminderKey || '').trim().toUpperCase();
    if (!(expiryDateUtc instanceof Date) || Number.isNaN(expiryDateUtc.getTime())) {
        throw new Error('expiryDateUtc must be a valid Date');
    }

    if (key === 'M4') return subtractMonthsClamp(expiryDateUtc, 4);
    if (key === 'M2') return subtractMonthsClamp(expiryDateUtc, 2);
    if (key === 'M1') return subtractMonthsClamp(expiryDateUtc, 1);
    if (key === 'D14') return subtractDays(expiryDateUtc, 14);

    throw new Error(`Unknown reminderKey: ${key}`);
}

function timeLeftLabel(reminderKey) {
    const key = String(reminderKey || '').trim().toUpperCase();
    if (key === 'M4') return '4 חודשים';
    if (key === 'M2') return 'חודשיים';
    if (key === 'M1') return 'חודש';
    if (key === 'D14') return 'שבועיים';
    return '';
}

module.exports = {
    parseDateOnly,
    toDateOnlyString,
    computeDueDate,
    timeLeftLabel,
    subtractMonthsClamp,
};
