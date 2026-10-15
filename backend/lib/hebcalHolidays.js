/**
 * Hebcal → holidays_date sync.
 * GET https://www.hebcal.com/hebcal?v=1&start=&end=&cfg=json&maj=on&min=off&mod=on
 */
const axios = require('axios');
const pool = require('../config/db');

const HEBCAL_BASE = 'https://www.hebcal.com/hebcal';

function _isoDate(d) {
    if (!d) return null;
    if (typeof d === 'string') return d.slice(0, 10);
    try {
        return d.toISOString().slice(0, 10);
    } catch {
        return null;
    }
}

function _yearRange(year) {
    return {
        start: `${year}-01-01`,
        end: `${year}-12-31`,
    };
}

/**
 * Fetch Hebcal items for [start, end] (YYYY-MM-DD).
 */
async function fetchHebcalHolidays(start, end) {
    const { data } = await axios.get(HEBCAL_BASE, {
        timeout: 30_000,
        params: {
            v: 1,
            cfg: 'json',
            maj: 'on',
            min: 'off',
            mod: 'on',
            start,
            end,
        },
    });
    const items = Array.isArray(data?.items) ? data.items : [];
    return items
        .filter((it) => it && (it.category === 'holiday' || it.category === 'modern'))
        .map((it) => ({
            holiday_date: _isoDate(it.date),
            title: String(it.title || '').trim(),
            title_he: String(it.hebrew || it.title || '').trim() || null,
            category: String(it.category || 'holiday'),
            hebcal_uid: String(it.uid || `${it.date}|${it.title}`),
            // Major Jewish holidays / modern memorial days are typically non-business.
            is_business_day: false,
        }))
        .filter((row) => row.holiday_date && row.title);
}

/**
 * Upsert holidays into holidays_date for the given years (defaults: current + next).
 * @returns {{ upserted: number, years: number[] }}
 */
async function syncHolidaysFromHebcal({ years } = {}) {
    const nowY = new Date().getFullYear();
    const targetYears = Array.isArray(years) && years.length
        ? years.map((y) => Number(y)).filter((y) => Number.isFinite(y))
        : [nowY, nowY + 1];

    let upserted = 0;
    for (const year of targetYears) {
        const { start, end } = _yearRange(year);
        const rows = await fetchHebcalHolidays(start, end);
        for (const row of rows) {
            const result = await pool.query(
                `
                INSERT INTO holidays_date
                    (holiday_date, title, title_he, category, hebcal_uid, is_business_day, source, synced_at)
                VALUES ($1::date, $2, $3, $4, $5, $6, 'hebcal', NOW())
                ON CONFLICT (hebcal_uid) DO UPDATE SET
                    holiday_date = EXCLUDED.holiday_date,
                    title = EXCLUDED.title,
                    title_he = EXCLUDED.title_he,
                    category = EXCLUDED.category,
                    is_business_day = EXCLUDED.is_business_day,
                    synced_at = NOW()
                RETURNING id
                `,
                [
                    row.holiday_date,
                    row.title,
                    row.title_he,
                    row.category,
                    row.hebcal_uid,
                    row.is_business_day,
                ]
            );
            if (result.rowCount) upserted += 1;
        }
    }
    return { upserted, years: targetYears };
}

/**
 * List holidays in [from, to] for calendar hints.
 */
async function listHolidaysInRange(from, to) {
    const fromDate = _isoDate(from);
    const toDate = _isoDate(to);
    if (!fromDate || !toDate) return [];
    const { rows } = await pool.query(
        `
        SELECT id, holiday_date, title, title_he, category, is_business_day
        FROM holidays_date
        WHERE holiday_date >= $1::date AND holiday_date <= $2::date
        ORDER BY holiday_date ASC, title ASC
        `,
        [fromDate, toDate]
    );
    return rows.map((r) => ({
        id: r.id,
        date: _isoDate(r.holiday_date),
        title: r.title_he || r.title,
        titleEn: r.title,
        category: r.category,
        isBusinessDay: r.is_business_day === true,
        hint: true,
    }));
}

module.exports = {
    fetchHebcalHolidays,
    syncHolidaysFromHebcal,
    listHolidaysInRange,
};
