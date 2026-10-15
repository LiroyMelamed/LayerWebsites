'use strict';
const { courtNumber, fail } = require('./validation');

// Caller owns the case transaction and has already checked edit/create access.
// Omitted fields from older clients preserve the existing reference; blank clears it.
async function saveCaseCourtNumber(db, caseId, tenantId, value, env = process.env) {
    if (value === undefined) return;
    const number = value === null || String(value).trim() === '' ? null : courtNumber(value);
    const target = (await db.query('SELECT caseid,integration_demo FROM cases WHERE caseid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 FOR UPDATE', [caseId, tenantId])).rows[0];
    if (!target) fail('CASE_NOT_FOUND', 'התיק לא נמצא', 404);
    const current = (await db.query('SELECT id,court_number FROM court_case_links WHERE case_id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 AND is_primary FOR UPDATE', [caseId, tenantId])).rows[0];
    if ((current?.court_number || null) === number) return;
    if (current) {
        await db.query('DELETE FROM court_case_links WHERE id=$1', [current.id]);
        await db.query('UPDATE court_updates SET case_id=NULL WHERE case_id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2 AND court_number=$3', [caseId, tenantId, current.court_number]);
    }
    if (!number) return;
    const linked = await db.query(`INSERT INTO court_case_links(law_firm_tenant_id,case_id,court_number,is_primary)
        VALUES($1,$2,$3,true) ON CONFLICT(law_firm_tenant_id,court_number)
        DO UPDATE SET is_primary=true WHERE court_case_links.case_id=excluded.case_id RETURNING id`, [tenantId, caseId, number]);
    if (!linked.rows.length) fail('COURT_NUMBER_IN_USE', 'מספר תיק בית המשפט כבר משויך לתיק אחר במשרד', 409);
    // Synthetic updates must never be attached to an ordinary live case.
    if (target.integration_demo || env.WHATSAPP_DEMO_ONLY === 'true') {
        await db.query('UPDATE court_updates SET case_id=$1 WHERE law_firm_tenant_id IS NOT DISTINCT FROM $2 AND court_number=$3 AND is_demo=true', [caseId, tenantId, number]);
    }
}
module.exports = { saveCaseCourtNumber };
