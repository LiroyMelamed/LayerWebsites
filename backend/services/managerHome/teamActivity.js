'use strict';

// The caller supplies the office-scoped pool. Calendar boundaries are calculated
// in Israel's local time, including DST; the week starts on Sunday.
// October is a one-time transition, not a recurring fallback. Historical stage
// updaters and case owners are mutable, so neither can establish past authorship.
const HISTORICAL_ACTIVITY_SQL = `
    SELECT closed_by_userid AS actor_id, caseid, closed_at AS occurred_at, 'close'::text AS kind, NULL::integer AS signingfileid
    FROM cases WHERE isclosed = true AND closed_by_userid IS NOT NULL AND closed_at IS NOT NULL
    UNION ALL
    SELECT uploaded_by, caseid, created_at, 'upload', NULL::integer FROM stage_files
    UNION ALL
    SELECT lawyerid, caseid, createdat, 'signing_action', signingfileid FROM signingfiles
    UNION ALL
    SELECT a.actor_userid, s.caseid, a.occurred_at_utc, 'signing_action', s.signingfileid
    FROM audit_events a JOIN signingfiles s ON s.signingfileid = a.signingfileid
    WHERE a.success = true AND lower(a.actor_type) IN ('admin', 'lawyer')
      AND a.event_type IN ('PUBLIC_LINK_ISSUED', 'SIGNING_INVITE_RESENT', 'SIGNER_CONTACT_UPDATED')`;

function teamActivitySql(includeHistory = false) {
    return `
WITH clock AS (
    SELECT $1::timestamptz AS as_of, ($1::timestamptz AT TIME ZONE 'Asia/Jerusalem')::date AS today
), periods AS (
    SELECT 'today' AS period, today AS start_date, as_of FROM clock
    UNION ALL SELECT 'week', today - EXTRACT(DOW FROM today)::int, as_of FROM clock
    UNION ALL SELECT 'month', date_trunc('month', today)::date, as_of FROM clock
), bounds AS (
    SELECT *, start_date::timestamp AT TIME ZONE 'Asia/Jerusalem' AS start_at FROM periods
), recorded AS (
    SELECT a.actor_id, a.caseid, a.occurred_at, a.kind, 'case:' || a.caseid AS activity_key
    FROM manager_case_activity a JOIN cases c ON c.caseid = a.caseid
    WHERE a.occurred_at >= (SELECT MIN(start_at) FROM bounds)
      AND a.occurred_at <= $1::timestamptz
), ${includeHistory ? `historical AS (${HISTORICAL_ACTIVITY_SQL}),` : ''} activity AS (
    SELECT * FROM recorded
    ${includeHistory ? `UNION ALL
    SELECT h.actor_id, h.caseid, h.occurred_at, h.kind,
        CASE WHEN h.caseid IS NOT NULL THEN 'case:' || h.caseid ELSE 'signing:' || h.signingfileid END AS activity_key
    FROM historical h JOIN users u ON u.userid = h.actor_id
    LEFT JOIN cases c ON c.caseid = h.caseid
    LEFT JOIN signingfiles s ON s.signingfileid = h.signingfileid
    LEFT JOIN users owner ON owner.userid = s.lawyerid
    WHERE ($1::timestamptz AT TIME ZONE 'Asia/Jerusalem')::date >= DATE '2026-10-01'
      AND ($1::timestamptz AT TIME ZONE 'Asia/Jerusalem')::date < DATE '2026-11-01'
      AND h.occurred_at >= (TIMESTAMP '2026-10-01 00:00:00' AT TIME ZONE 'Asia/Jerusalem')
      AND h.occurred_at >= (SELECT MIN(start_at) FROM bounds)
      AND h.occurred_at <= $1::timestamptz
      AND ((h.caseid IS NOT NULL AND c.caseid IS NOT NULL
            AND (to_jsonb(c)->>'law_firm_tenant_id') IS NOT DISTINCT FROM (to_jsonb(u)->>'law_firm_tenant_id'))
        OR (h.caseid IS NULL AND s.signingfileid IS NOT NULL AND owner.userid IS NOT NULL
            AND (to_jsonb(owner)->>'law_firm_tenant_id') IS NOT DISTINCT FROM (to_jsonb(u)->>'law_firm_tenant_id')))` : ''}
), credited AS (
    SELECT DISTINCT b.period, a.actor_id, a.caseid, a.kind, a.activity_key,
        (a.occurred_at AT TIME ZONE 'Asia/Jerusalem')::date AS activity_date
    FROM bounds b JOIN activity a ON a.occurred_at >= b.start_at
), totals AS (
    SELECT c.period, u.userid AS manager_id, u.name AS manager_name,
        COUNT(*)::int AS points,
        COUNT(*) FILTER (WHERE c.kind = 'update')::int AS case_updates,
        COUNT(*) FILTER (WHERE c.kind = 'close')::int AS cases_closed,
        COUNT(*) FILTER (WHERE c.kind = 'upload')::int AS document_uploads,
        COUNT(*) FILTER (WHERE c.kind = 'signing_action')::int AS signing_actions,
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
        'documentUploads', r.document_uploads, 'signingActions', r.signing_actions,
        'casesTouched', r.cases_touched, 'rank', r.rank
    ) ORDER BY r.points DESC, r.manager_id) FROM ranked r WHERE r.period = b.period AND r.rank <= 5), '[]') AS leaders
FROM bounds b`;
}

const TEAM_ACTIVITY_SQL = teamActivitySql();
const OCTOBER_ACTIVITY_SQL = teamActivitySql(true);

async function fetchTeamActivity(db, { now = new Date() } = {}) {
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
    const includeHistory = localDate >= '2026-10-01' && localDate < '2026-11-01';
    const { rows } = await db.query(includeHistory ? OCTOBER_ACTIVITY_SQL : TEAM_ACTIVITY_SQL, [now.toISOString()]);
    return {
        timeZone: 'Asia/Jerusalem',
        scoringVersion: includeHistory ? 'october-2026-history-v1' : 'recorded-case-day-v1',
        historyMode: includeHistory ? 'october-2026' : null,
        periods: Object.fromEntries(rows.map(row => [row.period, {
            startsOn: row.start_date, asOf: row.as_of,
            casesOpened: row.opened, casesClosed: row.closed, leaders: row.leaders,
        }])),
    };
}

module.exports = { fetchTeamActivity, TEAM_ACTIVITY_SQL };
