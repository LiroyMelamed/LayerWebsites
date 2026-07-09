/**
 * SQL visibility rules for personal (scope=mine) vs lawyer-scoped firm filters.
 */

/** SQL fragment: event belongs to lawyer (owner, legacy manager column, or junction). */
function lawyerMatchSql(lawyerParamIdx) {
    return `(
        ce.owner_id = $${lawyerParamIdx}
        OR ce.manager_user_id = $${lawyerParamIdx}
        OR EXISTS (
            SELECT 1 FROM calendar_event_managers cem
            WHERE cem.event_id = ce.id AND cem.user_id = $${lawyerParamIdx}
        )
        OR (
            ce.manager_user_id IS NULL
            AND ce.manager_name IS NOT NULL
            AND ce.manager_name = (SELECT name FROM users WHERE userid = $${lawyerParamIdx})
        )
    )`;
}

/**
 * Personal calendar (scope=mine):
 *   • holidays — visible to everyone
 *   • leave — my own leave, or leave where I'm the tagged lawyer
 *   • other events — events I'm tagged in (as manager/attendee), plus events I own
 *     that have no tagged lawyer at all. Events created for other lawyers do NOT
 *     appear in the creator's personal calendar unless the creator is tagged too.
 */
function personalCalendarSql(lawyerParamIdx) {
    const p = `$${lawyerParamIdx}`;
    const managedByLawyer = `(
        ce.manager_user_id = ${p}
        OR EXISTS (
            SELECT 1 FROM calendar_event_managers cem
            WHERE cem.event_id = ce.id AND cem.user_id = ${p}
        )
        OR (
            ce.manager_user_id IS NULL
            AND ce.manager_name IS NOT NULL
            AND ce.manager_name = (SELECT name FROM users WHERE userid = ${p})
        )
    )`;
    return `(
        ce.event_type = 'holiday'
        OR (
            ce.event_type = 'leave'
            AND (
                (
                    ce.owner_id = ${p}
                    AND (ce.manager_user_id IS NULL OR ce.manager_user_id = ${p})
                )
                OR (
                    ce.owner_id <> ${p}
                    AND ${managedByLawyer}
                )
            )
        )
        OR (
            ce.event_type NOT IN ('holiday', 'leave')
            AND (
                ${managedByLawyer}
                OR (
                    ce.owner_id = ${p}
                    AND ce.manager_user_id IS NULL
                    AND NOT EXISTS (
                        SELECT 1 FROM calendar_event_managers cem
                        WHERE cem.event_id = ce.id
                    )
                )
            )
        )
    )`;
}

module.exports = {
    lawyerMatchSql,
    personalCalendarSql,
};
