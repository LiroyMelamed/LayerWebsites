/** Existing office users shown in platform-admin UI (not Staff creation model). */
const OFFICE_USER_LIST_ROLES = Object.freeze(['Admin', 'Lawyer']);

/** Backend assignment eligibility (includes legacy QA Staff accounts — not listed in UI). */
const FIRM_STAFF_ROLE_ASSIGNMENT_ROLES = Object.freeze(['Admin', 'Lawyer', 'Staff']);

module.exports = {
    OFFICE_USER_LIST_ROLES,
    FIRM_STAFF_ROLE_ASSIGNMENT_ROLES,
};
