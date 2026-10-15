'use strict';

// The caller supplies the office-scoped pool. Calendar boundaries are calculated
// in Israel's local time, including DST; the week starts on Sunday.
const TEAM_ACTIVITY_SQL = `
WITH clock AS (
    SELECT $1::timestamptz AS as_of, ($1::timestamptz AT TIME ZONE 'Asia/Jerusalem')::date AS today
), periods AS (
    SELECT 'today' AS period, today AS start_date, as_of FROM clock
    UNION ALL SELECT 'week', today - EXTRACT(DOW FROM today)::int, as_of FROM clock
    UNION ALL SELECT 'month', date_trunc('month', today)::date, as_of FROM clock
), bounds AS (
    SELECT *, start_date::timestamp AT TIME ZONE 'Asia/Jerusalem' AS start_at FROM periods
), activity AS (
    SELECT a.actor_id, a.caseid, a.occurred_at, a.kind
    FROM manager_case_activity a JOIN cases c ON c.caseid = a.caseid
    WHERE a.occurred_at >= (SELECT MIN(start_at) FROM bounds)
      AND a.occurred_at <= $1::timestamptz
), credited AS (
    SELECT DISTINCT b.period, a.actor_id, a.caseid, a.kind,
        (a.occurred_at AT TIME ZONE 'Asia/Jerusalem')::date AS activity_date
    FROM bounds b JOIN activity a ON a.occurred_at >= b.start_at
), totals AS (
    SELECT c.period, u.userid AS manager_id, u.name AS manager_name,
        COUNT(*)::int AS points,
        COUNT(*) FILTER (WHERE c.kind = 'update')::int AS case_updates,
        COUNT(*) FILTER (WHERE c.kind = 'close')::int AS cases_closed,
        COUNT(DISTINCT c.caseid)::int AS cases_touched
    FROM credited c JOIN users u ON u.userid = c.actor_id
    WHERE u.role IN ('Admin', 'Lawyer')
    GROUP BY c.period, u.userid, u.name
), ranked AS (
    SELECT *, DENSE_RANK() OVER (PARTITION BY period ORDER BY points DESC)::int AS rank FROM totals
)
SELECT b.period, b.start_date::text, b.as_of,
    (SELECT COUNT(*)::int FROM cases c WHERE c.createdat >= b.start_at AND c.createdat <= b.as_of) AS opened,
    (SELECT COUNT(*)::int FROM cases c WHERE c.isclosed = true AND c.closed_at >= b.start_at AND c.closed_at <= b.as_of) AS closed,
    COALESCE((SELECT json_agg(json_build_object(
        'managerId', r.manager_id, 'managerName', r.manager_name, 'points', r.points,
        'caseUpdates', r.case_updates, 'casesClosed', r.cases_closed,
        'casesTouched', r.cases_touched, 'rank', r.rank
    ) ORDER BY r.points DESC, r.manager_id) FROM ranked r WHERE r.period = b.period AND r.rank <= 5), '[]') AS leaders
FROM bounds b`;

async function fetchTeamActivity(db, { now = new Date() } = {}) {
    const { rows } = await db.query(TEAM_ACTIVITY_SQL, [now.toISOString()]);
    return {
        timeZone: 'Asia/Jerusalem',
        scoringVersion: 'recorded-case-day-v1',
        periods: Object.fromEntries(rows.map(row => [row.period, {
            startsOn: row.start_date, asOf: row.as_of,
            casesOpened: row.opened, casesClosed: row.closed, leaders: row.leaders,
        }])),
    };
}

module.exports = { fetchTeamActivity, TEAM_ACTIVITY_SQL };
