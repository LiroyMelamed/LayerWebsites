const { expect, fail } = require('../../lib/signingV2/errors');
const { assertCases } = require('./access');

function caseId(value) {
    const id = Number(value);
    expect(/^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(id) && id <= 2147483647, 'INVALID_CASE');
    return id;
}

async function searchCases(db, scope, query = '') {
    if (!scope.caseView) return { cases: [] };
    expect(typeof query === 'string' && query.length <= 160, 'INVALID_SEARCH');
    const result = await db.query(`SELECT c.caseid AS id,c.casename AS name,c.companyname AS company
        FROM cases c WHERE (to_jsonb(c)->>'law_firm_tenant_id') IS NOT DISTINCT FROM $1::text
        AND ($2::boolean OR EXISTS (SELECT 1 FROM case_users cu WHERE cu.caseid=c.caseid AND cu.userid=$3))
        AND ($4='' OR c.casename ILIKE '%'||$4||'%' OR c.caseid::text=$4)
        ORDER BY c.createdat DESC,c.caseid DESC LIMIT 50`, [scope.tenantId, scope.caseAll, scope.userId, query.trim()]);
    return { cases: result.rows };
}

async function loadCaseContext(db, scope, id) {
    id = caseId(id);
    await assertCases(db, scope, [id]);
    const record = (await db.query(`SELECT caseid AS id,casename AS name,companyname AS company FROM cases WHERE caseid=$1`, [id])).rows[0];
    if (!record) fail('NOT_FOUND', 404);
    // A case relationship suggests people, never authority or an office permission.
    // Contacts are read only after case access is checked and stay in this tenant.
    const people = (await db.query(`SELECT DISTINCT u.userid AS id,u.name,u.email,u.phonenumber AS phone,u.role
        FROM cases c JOIN users u ON u.userid=c.userid OR u.userid=c.casemanagerid
        OR EXISTS (SELECT 1 FROM case_users cu WHERE cu.caseid=c.caseid AND cu.userid=u.userid)
        WHERE c.caseid=$1 AND u.law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid
        ORDER BY u.name,u.userid LIMIT 200`, [id, scope.tenantId])).rows;
    return { ...record, people };
}

module.exports = { caseId, searchCases, loadCaseContext };
