const { PERMISSION_AREAS, CATALOG_VERSION, normalizeRolePermissions } = require('./firmRolePermissions');
const BASELINE_ROLE_NAME = '\u05de\u05e0\u05d4\u05dc \u05de\u05e9\u05e8\u05d3 \u05db\u05dc\u05dc\u05d9';
function fullOfficePermissions() {
    return normalizeRolePermissions({ version: CATALOG_VERSION, areas: Object.fromEntries(PERMISSION_AREAS.map(area => [area.id, { visible: true, actions: [...(area.actions || [])], ...(area.supportsDataScope ? { dataScope: 'all_firm' } : {}) }])) });
}
function canonical(value) {
    if (Array.isArray(value)) return JSON.stringify(value.map(canonical).sort());
    if (value && typeof value === 'object') return JSON.stringify(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return JSON.stringify(value);
}
function isFullOfficeRole(permissions) { return canonical(normalizeRolePermissions(permissions)) === canonical(fullOfficePermissions()); }
const ELIGIBLE_OFFICE_SQL = `u.role IN ('Admin', 'Lawyer')
    AND COALESCE((to_jsonb(u)->>'is_active')::boolean, (to_jsonb(u)->>'isactive')::boolean, true)
    AND NOT COALESCE((to_jsonb(u)->>'is_deleted')::boolean, (to_jsonb(u)->>'isdeleted')::boolean, false)
    AND COALESCE(to_jsonb(u)->>'deleted_at', to_jsonb(u)->>'deletedat', to_jsonb(u)->>'disabled_at') IS NULL
    AND NOT EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = u.userid AND pa.is_active = TRUE)
    AND (u.law_firm_tenant_id IS NULL OR EXISTS (SELECT 1 FROM law_firm_tenants t WHERE t.id = u.law_firm_tenant_id AND t.is_active = TRUE))`;
async function planAndSeedOfficeBaseline(client, { apply = false, tenantMode, preserveCustom = false } = {}) {
    if (!['dedicated','shared'].includes(tenantMode)) throw new Error('An explicit dedicated/shared deployment mode is required');
    let begun = false;
    try {
        await client.query('BEGIN'); begun = true;
        if (apply) {
            await client.query('SELECT pg_advisory_xact_lock(70481020261007)');
            await client.query('LOCK TABLE users, firm_staff_roles IN SHARE ROW EXCLUSIVE MODE');
        }
        const { rows: users } = await client.query(`SELECT u.userid, u.role, u.law_firm_tenant_id, u.firm_staff_role_id FROM users u WHERE ${ELIGIBLE_OFFICE_SQL} ORDER BY u.userid`);
        const { rows: roles } = await client.query('SELECT id, law_firm_tenant_id, name, permissions, is_active FROM firm_staff_roles');
        if (tenantMode === 'shared' && users.some(user => !user.law_firm_tenant_id)) throw new Error('Shared rollout has unscoped office identities; canonical tenant mapping required');
        const tenants = [...new Set(users.map(user => user.law_firm_tenant_id || null))];
        if (tenantMode === 'dedicated' && tenants.length > 1) throw new Error('Dedicated rollout contains multiple office scopes; verify deployment mode');
        const plan = { apply, assigned: 0, rolesCreated: 0, conflicts: 0, alreadyBaseline: 0, tenants: [] };
        for (const tenantId of tenants) {
            const scopedUsers = users.filter(user => (user.law_firm_tenant_id || null) === tenantId);
            const matches = roles.filter(role => (role.law_firm_tenant_id || null) === tenantId && role.name.toLocaleLowerCase() === BASELINE_ROLE_NAME.toLocaleLowerCase());
            if (matches.length > 1 || matches.some(role => !role.is_active || !isFullOfficeRole(role.permissions))) throw new Error('Baseline role name conflicts with existing/inactive permissions; no overwrite');
            let baselineRole = matches[0];
            const legacy = [], conflicts = [];
            for (const user of scopedUsers) {
                if (!user.firm_staff_role_id) legacy.push(user);
                else if (baselineRole && user.firm_staff_role_id === baselineRole.id) plan.alreadyBaseline++;
                else conflicts.push(user);
            }
            plan.conflicts += conflicts.length;
            plan.tenants.push({ tenantId, unassignedOfficeUsers: legacy.length, preservedCustomAssignments: conflicts.length, baselineExists: Boolean(baselineRole) });
            if (apply && conflicts.length && !preserveCustom) throw new Error('Existing custom-role assignments require explicit preserve-custom review; nothing committed');
            if (!apply || !legacy.length) continue;
            if (!baselineRole) {
                const result = await client.query('INSERT INTO firm_staff_roles (law_firm_tenant_id, name, permissions) VALUES ($1, $2, $3::jsonb) RETURNING id', [tenantId, BASELINE_ROLE_NAME, JSON.stringify(fullOfficePermissions())]);
                baselineRole = { id: result.rows[0]?.id };
                if (!baselineRole.id) throw new Error('Baseline insert did not return an ID');
                plan.rolesCreated++;
            }
            for (const user of legacy) {
                const result = await client.query(`UPDATE users u SET firm_staff_role_id = $2 WHERE u.userid = $1 AND u.firm_staff_role_id IS NULL AND u.law_firm_tenant_id IS NOT DISTINCT FROM $3::uuid AND ${ELIGIBLE_OFFICE_SQL}`, [user.userid, baselineRole.id, tenantId]);
                if (result.rowCount !== 1) throw new Error('Account eligibility/assignment changed; entire rollout rolled back');
                plan.assigned++;
            }
        }
        await client.query(apply ? 'COMMIT' : 'ROLLBACK'); begun = false;
        return plan;
    } catch (error) {
        if (begun) { try { await client.query('ROLLBACK'); } catch {} }
        throw error;
    }
}
module.exports = { BASELINE_ROLE_NAME, fullOfficePermissions, isFullOfficeRole, planAndSeedOfficeBaseline, ELIGIBLE_OFFICE_SQL };
