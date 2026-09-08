const pool = require('../../config/db');
const C = require('./constants');
const {
    buildAttentionItems,
    buildMorningBrief,
    deriveCaseHealth,
    summarizeAttention,
    flattenAttentionItems,
} = require('./scoring');
const { MemoryCache } = require('../../utils/memoryCache');

const cache = new MemoryCache({ name: 'managerHome', maxEntries: 5 });

const JERUSALEM_TODAY = `(NOW() AT TIME ZONE 'Asia/Jerusalem')::date`;

async function fetchManagerGreeting(userId) {
    if (!userId) return { managerName: null };
    const { rows } = await pool.query(
        `SELECT name FROM users WHERE userid = $1 LIMIT 1`,
        [userId]
    );
    return { managerName: rows[0]?.name || null };
}

async function fetchOpenCasesWithActivity() {
    // Meaningful activity only — see constants.js for definition (excludes cases.updatedat).
    const { rows } = await pool.query(`
        WITH open_cases AS (
            SELECT c.* FROM cases c WHERE c.isclosed = false
        ),
        desc_agg AS (
            SELECT cd.caseid,
                   MAX(cd.timestamp) AS last_desc_at
            FROM casedescriptions cd
            JOIN open_cases oc ON oc.caseid = cd.caseid
            GROUP BY cd.caseid
        ),
        stage_file_agg AS (
            SELECT sf.caseid, MAX(sf.created_at) AS last_stage_file_at
            FROM stage_files sf
            JOIN open_cases oc ON oc.caseid = sf.caseid
            GROUP BY sf.caseid
        ),
        upload_agg AS (
            SELECT uf.caseid, MAX(uf.uploaddate) AS last_upload_at
            FROM uploadedfiles uf
            JOIN open_cases oc ON oc.caseid = uf.caseid
            GROUP BY uf.caseid
        ),
        signing_agg AS (
            SELECT sfi.caseid,
                   MAX(sfi.createdat) AS last_signing_created_at,
                   MAX(sfi.signedat) FILTER (WHERE sfi.signedat IS NOT NULL) AS last_signing_signed_at
            FROM signingfiles sfi
            JOIN open_cases oc ON oc.caseid = sfi.caseid
            GROUP BY sfi.caseid
        ),
        activity AS (
            SELECT
                oc.caseid,
                GREATEST(
                    COALESCE(da.last_desc_at, '-infinity'::timestamptz),
                    COALESCE(sfa.last_stage_file_at, '-infinity'::timestamptz),
                    COALESCE(ua.last_upload_at, '-infinity'::timestamptz),
                    COALESCE(sa.last_signing_created_at, '-infinity'::timestamptz),
                    COALESCE(sa.last_signing_signed_at, '-infinity'::timestamptz),
                    COALESCE(oc.createdat, '-infinity'::timestamptz)
                ) AS last_meaningful_activity_at,
                COALESCE(
                    (
                        SELECT MAX(cd.timestamp)
                        FROM casedescriptions cd
                        WHERE cd.caseid = oc.caseid AND cd.stage = oc.currentstage
                    ),
                    oc.createdat
                ) AS current_stage_since
            FROM open_cases oc
            LEFT JOIN desc_agg da ON da.caseid = oc.caseid
            LEFT JOIN stage_file_agg sfa ON sfa.caseid = oc.caseid
            LEFT JOIN upload_agg ua ON ua.caseid = oc.caseid
            LEFT JOIN signing_agg sa ON sa.caseid = oc.caseid
        )
        SELECT
            c.caseid,
            c.casename,
            c.currentstage,
            c.casemanager,
            c.casemanagerid,
            c.estimatedcompletiondate,
            c.licenseexpirydate,
            c.haslicenseexpiry,
            c.createdat,
            u.name AS client_name,
            ct.numberofstages,
            a.last_meaningful_activity_at,
            a.current_stage_since,
            CASE
                WHEN a.last_meaningful_activity_at = '-infinity'::timestamptz THEN NULL
                ELSE GREATEST(0, EXTRACT(DAY FROM (NOW() - a.last_meaningful_activity_at)))::int
            END AS days_since_meaningful_activity,
            CASE
                WHEN a.current_stage_since IS NULL THEN NULL
                ELSE GREATEST(0, EXTRACT(DAY FROM (NOW() - a.current_stage_since)))::int
            END AS days_in_current_stage
        FROM open_cases c
        JOIN activity a ON a.caseid = c.caseid
        LEFT JOIN users u ON u.userid = c.userid
        LEFT JOIN casetypes ct ON ct.casetypeid = c.casetypeid
        ORDER BY c.caseid
    `);
    return rows;
}

async function fetchSigningOperationalRows() {
    const { rows } = await pool.query(`
        SELECT
            sf.signingfileid,
            sf.caseid,
            sf.filename,
            sf.status,
            sf.createdat,
            sf.expiresat,
            sf.rejectionreason,
            c.casename,
            c.casemanager,
            c.casemanagerid,
            cl.name AS client_name
        FROM signingfiles sf
        LEFT JOIN cases c ON c.caseid = sf.caseid
        LEFT JOIN users cl ON cl.userid = sf.clientid
        WHERE sf.status IN ('pending', 'rejected')
          AND (c.caseid IS NULL OR c.isclosed = false)
        ORDER BY
            CASE
                WHEN sf.status = 'pending' AND sf.expiresat IS NOT NULL AND sf.expiresat < NOW() THEN 0
                WHEN sf.status = 'pending' AND sf.expiresat IS NOT NULL
                     AND sf.expiresat >= NOW()
                     AND sf.expiresat < NOW() + ($1 || ' days')::interval THEN 1
                WHEN sf.status = 'rejected' THEN 2
                ELSE 3
            END,
            sf.createdat ASC
        LIMIT 50
    `, [String(C.SIGNING_EXPIRING_DAYS)]);
    return rows;
}

async function fetchSigningSummary() {
    const { rows } = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE sf.status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE sf.status = 'pending' AND sf.expiresat IS NOT NULL AND sf.expiresat < NOW())::int AS expired,
            COUNT(*) FILTER (
                WHERE sf.status = 'pending'
                  AND sf.expiresat IS NOT NULL
                  AND sf.expiresat >= NOW()
                  AND sf.expiresat < NOW() + ($1 || ' days')::interval
            )::int AS expiring,
            COUNT(*) FILTER (WHERE sf.status = 'rejected')::int AS rejected,
            COUNT(*) FILTER (
                WHERE sf.status = 'signed'
                  AND sf.signedat >= ${JERUSALEM_TODAY}::timestamptz AT TIME ZONE 'Asia/Jerusalem'
            )::int AS signed_today
        FROM signingfiles sf
        LEFT JOIN cases c ON c.caseid = sf.caseid
        WHERE c.caseid IS NULL OR c.isclosed = false
    `, [String(C.SIGNING_EXPIRING_DAYS)]);
    return rows[0] || { pending: 0, expired: 0, expiring: 0, rejected: 0, signed_today: 0 };
}

async function fetchPendingRsvpEvents() {
    const { rows } = await pool.query(`
        SELECT
            ce.id,
            ce.title,
            ce.start_time,
            ce.invite_status,
            ce.case_id,
            ce.client_name,
            ce.lead_name,
            ce.lead_case_name,
            ce.manager_user_id,
            mgr.name AS manager_name,
            c.casename AS case_name
        FROM calendar_events ce
        LEFT JOIN cases c ON c.caseid = ce.case_id
        LEFT JOIN users mgr ON mgr.userid = ce.manager_user_id
        WHERE ce.start_time >= NOW()
          AND ce.start_time < NOW() + ($1 || ' days')::interval
          AND ce.event_type NOT IN ('holiday', 'leave')
          AND ce.invite_status IN ('pending')
        ORDER BY ce.start_time ASC
        LIMIT 20
    `, [String(C.RSVP_LOOKAHEAD_DAYS)]);
    return rows;
}

async function fetchFailedReminders() {
    const { rows } = await pool.query(`
        (
            SELECT
                'signing_reminder' AS entity_type,
                sfr.id AS entity_id,
                sf.caseid AS case_id,
                c.casename AS case_name,
                u.name AS client_name,
                COALESCE(sf.filename, 'חתימה') AS label,
                'signing' AS action_route
            FROM signing_file_reminders sfr
            JOIN signingfiles sf ON sf.signingfileid = sfr.signing_file_id
            LEFT JOIN cases c ON c.caseid = sf.caseid
            LEFT JOIN users u ON u.userid = sfr.signer_user_id
            WHERE sfr.status = 'FAILED'
              AND sfr.created_at >= NOW() - INTERVAL '7 days'
            ORDER BY sfr.created_at DESC
            LIMIT 5
        )
        UNION ALL
        (
            SELECT
                'email_reminder' AS entity_type,
                ser.id AS entity_id,
                ser.calendar_event_id AS case_id,
                NULL AS case_name,
                ser.client_name,
                COALESCE(ser.subject, ser.template_key) AS label,
                'reminders' AS action_route
            FROM scheduled_email_reminders ser
            WHERE ser.status = 'FAILED'
              AND ser.created_at >= NOW() - INTERVAL '7 days'
            ORDER BY ser.created_at DESC
            LIMIT 5
        )
    `);
    return rows;
}

async function fetchTodayEvents() {
    const { rows } = await pool.query(`
        SELECT
            ce.id,
            ce.title,
            ce.start_time,
            ce.end_time,
            ce.location,
            ce.event_type,
            ce.meeting_type,
            ce.invite_status,
            ce.case_id,
            ce.client_name,
            ce.client_user_id,
            ce.lead_name,
            ce.lead_phone,
            ce.lead_email,
            ce.lead_case_name,
            ce.manager_user_id,
            mgr.name AS manager_name,
            c.casename AS case_name,
            cl.name AS client_user_name
        FROM calendar_events ce
        LEFT JOIN cases c ON c.caseid = ce.case_id
        LEFT JOIN users mgr ON mgr.userid = ce.manager_user_id
        LEFT JOIN users cl ON cl.userid = ce.client_user_id
        WHERE ce.start_time >= ${JERUSALEM_TODAY}::timestamptz AT TIME ZONE 'Asia/Jerusalem'
          AND ce.start_time < (${JERUSALEM_TODAY} + INTERVAL '1 day')::timestamptz AT TIME ZONE 'Asia/Jerusalem'
        ORDER BY ce.start_time ASC
        LIMIT 40
    `);
    return rows;
}

async function fetchPotentialClients() {
    // Calendar-derived potential clients only — not a CRM lead pipeline.
    const { rows } = await pool.query(`
        SELECT
            ce.id,
            ce.title,
            ce.start_time,
            ce.lead_name,
            ce.lead_phone,
            ce.lead_email,
            ce.lead_case_name,
            ce.meeting_type,
            ce.invite_status,
            mgr.name AS manager_name
        FROM calendar_events ce
        LEFT JOIN users mgr ON mgr.userid = ce.manager_user_id
        WHERE ce.start_time >= NOW()
          AND ce.start_time < NOW() + ($1 || ' days')::interval
          AND ce.event_type NOT IN ('holiday', 'leave')
          AND (
            NULLIF(TRIM(ce.lead_name), '') IS NOT NULL
            OR NULLIF(TRIM(ce.lead_phone), '') IS NOT NULL
            OR NULLIF(TRIM(ce.lead_email), '') IS NOT NULL
          )
        ORDER BY ce.start_time ASC
        LIMIT 15
    `, [String(C.RSVP_LOOKAHEAD_DAYS)]);
    return rows;
}

function jerusalemDayBoundsSql() {
    const dayStart = `${JERUSALEM_TODAY}::timestamptz AT TIME ZONE 'Asia/Jerusalem'`;
    const dayEnd = `(${JERUSALEM_TODAY} + INTERVAL '1 day')::timestamptz AT TIME ZONE 'Asia/Jerusalem'`;
    return { dayStart, dayEnd };
}

function mapCaseListItem(row) {
    return {
        caseId: row.caseid,
        caseName: row.casename,
        managerId: row.casemanagerid || null,
        managerName: row.casemanager || null,
        clientName: row.client_name || null,
        currentStage: row.currentstage ?? null,
        createdAt: row.createdat || null,
        closedAt: row.updatedat || null,
    };
}

async function fetchCasesOpenedTodayList() {
    const { dayStart, dayEnd } = jerusalemDayBoundsSql();
    const { rows } = await pool.query(`
        SELECT
            c.caseid,
            c.casename,
            c.currentstage,
            c.casemanager,
            c.casemanagerid,
            c.createdat,
            u.name AS client_name
        FROM cases c
        LEFT JOIN users u ON u.userid = c.userid
        WHERE c.createdat >= ${dayStart}
          AND c.createdat < ${dayEnd}
        ORDER BY c.createdat DESC
        LIMIT $1
    `, [C.DRILL_DOWN_LIST_LIMIT]);
    return rows.map(mapCaseListItem);
}

async function fetchCasesClosedTodayList() {
    const { dayStart, dayEnd } = jerusalemDayBoundsSql();
    const { rows } = await pool.query(`
        SELECT
            c.caseid,
            c.casename,
            c.currentstage,
            c.casemanager,
            c.casemanagerid,
            c.updatedat,
            u.name AS client_name
        FROM cases c
        LEFT JOIN users u ON u.userid = c.userid
        WHERE c.isclosed = true
          AND c.updatedat >= ${dayStart}
          AND c.updatedat < ${dayEnd}
        ORDER BY c.updatedat DESC
        LIMIT $1
    `, [C.DRILL_DOWN_LIST_LIMIT]);
    return rows.map(mapCaseListItem);
}

async function fetchTodayActivityLog() {
    const { dayStart, dayEnd } = jerusalemDayBoundsSql();
    const { rows } = await pool.query(`
        SELECT * FROM (
            SELECT
                'stage_update' AS activity_type,
                cd.timestamp AS occurred_at,
                c.caseid,
                c.casename,
                c.casemanagerid AS manager_id,
                c.casemanager AS manager_name,
                jsonb_build_object('stage', cd.stage) AS meta
            FROM casedescriptions cd
            JOIN cases c ON c.caseid = cd.caseid
            WHERE cd.timestamp >= ${dayStart}
              AND cd.timestamp < ${dayEnd}

            UNION ALL

            SELECT
                'case_opened' AS activity_type,
                c.createdat AS occurred_at,
                c.caseid,
                c.casename,
                c.casemanagerid AS manager_id,
                c.casemanager AS manager_name,
                '{}'::jsonb AS meta
            FROM cases c
            WHERE c.createdat >= ${dayStart}
              AND c.createdat < ${dayEnd}

            UNION ALL

            SELECT
                'case_closed' AS activity_type,
                c.updatedat AS occurred_at,
                c.caseid,
                c.casename,
                c.casemanagerid AS manager_id,
                c.casemanager AS manager_name,
                '{}'::jsonb AS meta
            FROM cases c
            WHERE c.isclosed = true
              AND c.updatedat >= ${dayStart}
              AND c.updatedat < ${dayEnd}

            UNION ALL

            SELECT
                'signing_completed' AS activity_type,
                sf.signedat AS occurred_at,
                sf.caseid,
                c.casename,
                c.casemanagerid AS manager_id,
                c.casemanager AS manager_name,
                jsonb_build_object('filename', sf.filename) AS meta
            FROM signingfiles sf
            LEFT JOIN cases c ON c.caseid = sf.caseid
            WHERE sf.status = 'signed'
              AND sf.signedat >= ${dayStart}
              AND sf.signedat < ${dayEnd}

            UNION ALL

            SELECT
                'document_uploaded' AS activity_type,
                sf.created_at AS occurred_at,
                sf.caseid,
                c.casename,
                c.casemanagerid AS manager_id,
                c.casemanager AS manager_name,
                jsonb_build_object('filename', sf.file_name) AS meta
            FROM stage_files sf
            JOIN cases c ON c.caseid = sf.caseid
            WHERE sf.created_at >= ${dayStart}
              AND sf.created_at < ${dayEnd}
        ) combined
        ORDER BY occurred_at DESC NULLS LAST
        LIMIT $1
    `, [C.DRILL_DOWN_LIST_LIMIT]);
    return rows.map((r) => ({
        activityType: r.activity_type,
        occurredAt: r.occurred_at,
        caseId: r.caseid,
        caseName: r.casename,
        managerId: r.manager_id,
        managerName: r.manager_name,
        meta: r.meta || {},
    }));
}

async function fetchFirmDailyStats() {
    const { dayStart, dayEnd } = jerusalemDayBoundsSql();

    const { rows: openedRows } = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM cases
        WHERE createdat >= ${dayStart}
          AND createdat < ${dayEnd}
    `);

    const { rows: closedRows } = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM cases
        WHERE isclosed = true
          AND updatedat >= ${dayStart}
          AND updatedat < ${dayEnd}
    `);

    const { rows: totalRows } = await pool.query(`
        SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE isclosed = false)::int AS active,
            COUNT(*) FILTER (WHERE isclosed = true)::int AS closed
        FROM cases
    `);

    const { rows: activityRows } = await pool.query(`
        WITH acts AS (
            SELECT c.casemanagerid AS manager_id, c.casemanager AS manager_name
            FROM casedescriptions cd
            JOIN cases c ON c.caseid = cd.caseid
            WHERE cd.timestamp >= ${dayStart}
              AND cd.timestamp < ${dayEnd}
              AND c.casemanagerid IS NOT NULL
            UNION ALL
            SELECT casemanagerid, casemanager
            FROM cases
            WHERE createdat >= ${dayStart}
              AND createdat < ${dayEnd}
              AND casemanagerid IS NOT NULL
            UNION ALL
            SELECT c.casemanagerid, c.casemanager
            FROM signingfiles sf
            JOIN cases c ON c.caseid = sf.caseid
            WHERE sf.signedat >= ${dayStart}
              AND sf.signedat < ${dayEnd}
              AND c.casemanagerid IS NOT NULL
        )
        SELECT manager_id, manager_name, COUNT(*)::int AS activity_count
        FROM acts
        WHERE manager_id IS NOT NULL
        GROUP BY manager_id, manager_name
        ORDER BY activity_count DESC
        LIMIT 1
    `);

    const top = activityRows[0];
    const totals = totalRows[0] || {};
    return {
        casesOpenedToday: openedRows[0]?.count ?? 0,
        casesClosedToday: closedRows[0]?.count ?? 0,
        totalCases: totals.total ?? 0,
        activeCases: totals.active ?? 0,
        closedCases: totals.closed ?? 0,
        mostActiveManager: top
            ? {
                managerId: top.manager_id,
                managerName: top.manager_name,
                activityCount: top.activity_count,
            }
            : null,
    };
}

async function fetchManagerWorkload(caseRows, attentionItems) {
    const flatItems = flattenAttentionItems(attentionItems);
    const byManager = new Map();

    for (const row of caseRows) {
        const id = row.casemanagerid || 0;
        const name = row.casemanager || null;
        const key = String(id);
        if (!byManager.has(key)) {
            byManager.set(key, {
                managerId: id || null,
                managerName: id ? name : null,
                activeCases: 0,
                needsAttention: 0,
                urgentCases: 0,
                unassigned: !id,
            });
        }
        byManager.get(key).activeCases += 1;
    }

    const caseIdsNeedingAttention = new Set();
    const caseIdsUrgent = new Set();
    for (const item of flatItems) {
        if (!item.caseId) continue;
        caseIdsNeedingAttention.add(item.caseId);
        if (item.priority === 'critical' || item.priority === 'high') {
            caseIdsUrgent.add(item.caseId);
        }
    }

    for (const row of caseRows) {
        const key = String(row.casemanagerid || 0);
        const entry = byManager.get(key);
        if (!entry) continue;
        if (caseIdsNeedingAttention.has(row.caseid)) entry.needsAttention += 1;
        if (caseIdsUrgent.has(row.caseid)) entry.urgentCases += 1;
    }

    return [...byManager.values()]
        .filter((m) => m.activeCases > 0)
        .sort((a, b) => b.activeCases - a.activeCases);
}

async function fetchCasesByStage() {
    const { rows } = await pool.query(`
        SELECT
            COALESCE(c.casetypename, ct.casetypename, 'לא מוגדר') AS case_type,
            c.currentstage AS stage,
            ct.numberofstages,
            COUNT(*)::int AS case_count
        FROM cases c
        LEFT JOIN casetypes ct ON ct.casetypeid = c.casetypeid
        WHERE c.isclosed = false
        GROUP BY c.casetypename, ct.casetypename, c.currentstage, ct.numberofstages
        ORDER BY case_type, c.currentstage
    `);
    return rows;
}

async function fetchRecentActivity() {
    const { rows } = await pool.query(`
        SELECT * FROM (
            SELECT
                'stage_update' AS activity_type,
                cd.timestamp AS occurred_at,
                c.caseid,
                c.casename,
                jsonb_build_object('stage', cd.stage) AS meta
            FROM casedescriptions cd
            JOIN cases c ON c.caseid = cd.caseid
            WHERE cd.timestamp >= NOW() - INTERVAL '14 days'

            UNION ALL

            SELECT
                'signing_completed' AS activity_type,
                sf.signedat AS occurred_at,
                sf.caseid,
                c.casename,
                jsonb_build_object('filename', sf.filename) AS meta
            FROM signingfiles sf
            LEFT JOIN cases c ON c.caseid = sf.caseid
            WHERE sf.status = 'signed'
              AND sf.signedat >= NOW() - INTERVAL '14 days'

            UNION ALL

            SELECT
                'signing_rejected' AS activity_type,
                COALESCE(sf.signedat, sf.createdat) AS occurred_at,
                sf.caseid,
                c.casename,
                jsonb_build_object('filename', sf.filename) AS meta
            FROM signingfiles sf
            LEFT JOIN cases c ON c.caseid = sf.caseid
            WHERE sf.status = 'rejected'
              AND COALESCE(sf.signedat, sf.createdat) >= NOW() - INTERVAL '14 days'

            UNION ALL

            SELECT
                'document_uploaded' AS activity_type,
                sf.created_at AS occurred_at,
                sf.caseid,
                c.casename,
                jsonb_build_object('filename', sf.file_name) AS meta
            FROM stage_files sf
            JOIN cases c ON c.caseid = sf.caseid
            WHERE sf.created_at >= NOW() - INTERVAL '14 days'
        ) combined
        ORDER BY occurred_at DESC NULLS LAST
        LIMIT $1
    `, [C.RECENT_ACTIVITY_LIMIT]);
    return rows;
}

function mapTodayEvent(row) {
    const isLead = Boolean(
        (row.lead_name && String(row.lead_name).trim())
        || (row.lead_phone && String(row.lead_phone).trim())
    );
    return {
        id: row.id,
        title: row.title,
        startTime: row.start_time,
        endTime: row.end_time,
        location: row.location,
        eventType: row.event_type,
        meetingType: row.meeting_type,
        inviteStatus: row.invite_status,
        caseId: row.case_id,
        caseName: row.case_name || row.lead_case_name || null,
        clientDisplayName: row.client_user_name || row.client_name || row.lead_name || null,
        managerName: row.manager_name || null,
        isPotentialClient: isLead,
        leadPhone: row.lead_phone || null,
    };
}

function buildCaseHealthList(caseRows, attentionItems) {
    const flat = flattenAttentionItems(attentionItems);
    const signalsByCase = new Map();
    for (const item of flat) {
        if (!item.caseId) continue;
        if (!signalsByCase.has(item.caseId)) signalsByCase.set(item.caseId, []);
        signalsByCase.get(item.caseId).push(item);
    }

    return caseRows
        .map((row) => {
            const signals = signalsByCase.get(row.caseid) || [];
            const hasCritical = signals.some((s) => s.priority === 'critical');
            return {
                caseId: row.caseid,
                caseName: row.casename,
                managerId: row.casemanagerid,
                managerName: row.casemanager,
                health: deriveCaseHealth(signals.length, hasCritical),
                signalCount: signals.length,
                daysSinceMeaningfulActivity: row.days_since_meaningful_activity,
                lastMeaningfulActivityAt: row.last_meaningful_activity_at,
            };
        })
        .filter((c) => c.health !== 'healthy')
        .sort((a, b) => b.signalCount - a.signalCount)
        .slice(0, 20);
}

async function buildManagerHomePayload({ userId } = {}) {
    const [
        greeting,
        caseRows,
        signingRows,
        signingSummary,
        rsvpRows,
        failedReminders,
        todayRows,
        potentialClients,
        casesByStage,
        recentActivity,
    ] = await Promise.all([
        fetchManagerGreeting(userId),
        fetchOpenCasesWithActivity(),
        fetchSigningOperationalRows(),
        fetchSigningSummary(),
        fetchPendingRsvpEvents(),
        fetchFailedReminders(),
        fetchTodayEvents(),
        fetchPotentialClients(),
        fetchCasesByStage(),
        fetchRecentActivity(),
    ]);

    const attentionItems = buildAttentionItems({
        caseRows,
        signingRows,
        rsvpRows,
        failedReminders,
    });

    const summary = summarizeAttention(attentionItems, caseRows, signingSummary);
    summary.potentialClientMeetings = potentialClients.length;
    summary.todayEventCount = todayRows.length;

    const today = todayRows.map(mapTodayEvent);
    const managerWorkload = await fetchManagerWorkload(caseRows, attentionItems);
    const unassignedCount = caseRows.filter((r) => !r.casemanagerid).length;

    return {
        greeting: {
            managerName: greeting.managerName,
        },
        summary,
        morningBrief: buildMorningBrief({
            attentionItems,
            today,
            potentialClients,
        }),
        attentionItems,
        today,
        caseHealth: buildCaseHealthList(caseRows, attentionItems),
        managerWorkload,
        casesByStage,
        unassignedCases: {
            count: unassignedCount,
            caseIds: caseRows.filter((r) => !r.casemanagerid).map((r) => r.caseid).slice(0, 10),
        },
        signing: {
            summary: signingSummary,
            queue: signingRows.slice(0, 12).map((r) => ({
                signingFileId: r.signingfileid,
                caseId: r.caseid,
                caseName: r.casename,
                filename: r.filename,
                status: r.status,
                clientName: r.client_name,
                managerName: r.casemanager,
                createdAt: r.createdat,
                expiresAt: r.expiresat,
            })),
        },
        potentialClients: potentialClients.map((r) => ({
            eventId: r.id,
            title: r.title,
            startTime: r.start_time,
            leadName: r.lead_name,
            leadPhone: r.lead_phone,
            leadEmail: r.lead_email,
            leadCaseName: r.lead_case_name,
            meetingType: r.meeting_type,
            inviteStatus: r.invite_status,
            managerName: r.manager_name,
        })),
        recentActivity: recentActivity.map((r) => ({
            activityType: r.activity_type,
            occurredAt: r.occurred_at,
            caseId: r.caseid,
            caseName: r.casename,
            meta: r.meta || {},
        })),
        generatedAt: new Date().toISOString(),
    };
}

async function getManagerHomeData({ userId, ttlMs = C.MANAGER_HOME_CACHE_TTL_MS } = {}) {
    return cache.getOrSet(`managerHome:${userId || 'admin'}`, { ttlMs }, () =>
        buildManagerHomePayload({ userId })
    );
}

function invalidateManagerHomeCache() {
    cache.deleteByPrefix('managerHome:');
}

function __testReset() {
    cache.clear();
}

module.exports = {
    buildManagerHomePayload,
    getManagerHomeData,
    invalidateManagerHomeCache,
    __testReset,
};
