-- Read-only EXPLAIN for dashboard/calendar hot paths (Melamedia / any tenant).
\timing on

\echo '=== calendar_events list (30-day firm window) ==='
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ce.*,
       u_owner.name AS owner_name,
       c.casename AS case_name
FROM calendar_events ce
LEFT JOIN users u_owner ON u_owner.userid = ce.owner_id
LEFT JOIN cases c ON c.caseid = ce.case_id
WHERE ce.start_time >= NOW()
  AND ce.start_time < NOW() + INTERVAL '30 days'
ORDER BY ce.start_time ASC
LIMIT 500;

\echo '=== calendar_event_managers batch ==='
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT cem.event_id, u.userid AS user_id, u.name
FROM calendar_event_managers cem
JOIN users u ON u.userid = cem.user_id
WHERE cem.event_id = ANY(
  (SELECT ARRAY_AGG(id) FROM (
    SELECT id FROM calendar_events
    WHERE start_time >= NOW() AND start_time < NOW() + INTERVAL '30 days'
    LIMIT 100
  ) s)::int[]
)
ORDER BY cem.event_id, u.name;

\echo '=== open cases aggregate (manager home subset) ==='
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*)::int
FROM cases
WHERE isclosed = false;

\echo '=== signing pending count ==='
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(DISTINCT sf.signingfileid)::int
FROM signingfiles sf
JOIN signaturespots ss ON ss.signingfileid = sf.signingfileid
WHERE ss.issigned = false AND sf.isdeleted = false;
