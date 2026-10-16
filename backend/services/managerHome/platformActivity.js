'use strict';

// Called inside the creation transaction. The authenticated actor is supplied by
// the controller, never from request-body ownership/assignment fields.
async function recordCaseOpened(db, actorId, caseId) {
    await db.query(`INSERT INTO manager_platform_activity(law_firm_tenant_id,actor_id,caseid,kind,activity_key)
        SELECT (to_jsonb(c)->>'law_firm_tenant_id')::uuid, u.userid, c.caseid, 'case_open', 'case:' || c.caseid
        FROM cases c JOIN users u ON u.userid=$1
        WHERE c.caseid=$2 AND u.role IN ('Admin','Lawyer')
          AND (to_jsonb(c)->>'law_firm_tenant_id') IS NOT DISTINCT FROM (to_jsonb(u)->>'law_firm_tenant_id')
        ON CONFLICT DO NOTHING`, [actorId, caseId]);
}

async function recordCalendarCreated(db, actorId, eventId) {
    // Only the first event in a recurrence is passed, so one series is one credit.
    await db.query(`INSERT INTO manager_platform_activity(law_firm_tenant_id,actor_id,caseid,kind,activity_key)
        SELECT (to_jsonb(e)->>'law_firm_tenant_id')::uuid, u.userid, e.case_id, 'calendar', 'calendar:' || e.id
        FROM calendar_events e JOIN users u ON u.userid=$1
        WHERE e.id=$2 AND e.event_type IN ('appointment','hearing','reminder')
          AND u.role IN ('Admin','Lawyer')
          AND (to_jsonb(e)->>'law_firm_tenant_id') IS NOT DISTINCT FROM (to_jsonb(u)->>'law_firm_tenant_id')
        ON CONFLICT DO NOTHING`, [actorId, eventId]);
}

module.exports = { recordCaseOpened, recordCalendarCreated };
