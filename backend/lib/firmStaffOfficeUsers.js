const { normalizeRolePermissions } = require('./firmRolePermissions');
const { createAppError } = require('../utils/appError');

/** Existing office users shown in platform-admin UI (not Staff creation model). */
const OFFICE_USER_LIST_ROLES = Object.freeze(['Admin', 'Lawyer']);

/** Backend assignment eligibility (includes legacy QA Staff accounts — not listed in UI). */
const FIRM_STAFF_ROLE_ASSIGNMENT_ROLES = Object.freeze(['Admin', 'Lawyer', 'Staff']);

/**
 * v1 — Lawyers use ClientStack (not AdminStack). Custom roles may only grant areas
 * that map to Lawyer-accessible APIs / existing client UX (Option C).
 */
const LAWYER_ASSIGNABLE_AREA_IDS = Object.freeze(['cases', 'signing', 'reminders', 'calendar']);

function rolePermissionsVisibleAreaIds(permissions) {
    const normalized = normalizeRolePermissions(permissions);
    const areas = normalized?.areas || {};
    return Object.keys(areas).filter((id) => areas[id]?.visible);
}

function assertFirmStaffRoleCompatibleWithUser(userRole, roleRow) {
    if (userRole !== 'Lawyer') return null;
    const visible = rolePermissionsVisibleAreaIds(roleRow.permissions);
    const disallowed = visible.filter((id) => !LAWYER_ASSIGNABLE_AREA_IDS.includes(id));
    if (disallowed.length > 0) {
        return createAppError(
            'ROLE_NOT_COMPATIBLE_WITH_USER',
            409,
            'תפקיד זה כולל הרשאות שאינן זמינות לעורך דין בממשק הנוכחי (AdminStack). בחר תפקיד עם תיקים/חתימות/יומן/תזכורות בלבד.',
            { disallowedAreas: disallowed },
        );
    }
    return null;
}

module.exports = {
    OFFICE_USER_LIST_ROLES,
    FIRM_STAFF_ROLE_ASSIGNMENT_ROLES,
    LAWYER_ASSIGNABLE_AREA_IDS,
    assertFirmStaffRoleCompatibleWithUser,
};
