const { expect, fail } = require('../../lib/signingV2/errors');
const { assertClients } = require('./access');

function clientId(value) {
    const id = Number(value);
    expect(/^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(id) && id <= 2147483647, 'INVALID_CLIENT');
    return id;
}

async function loadClientContext(db, scope, id) {
    id = clientId(id);
    await assertClients(db, scope, [id]);
    // Repeat the tenant/availability predicate in the data read: a deletion or
    // move between statements must not return a stale client's contact details.
    const row = (await db.query(`SELECT userid AS id,name,email,phonenumber AS phone,companyname AS company
        FROM users WHERE userid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid
        AND role NOT IN ('Admin','Deleted')`, [id, scope.tenantId])).rows[0];
    if (!row) fail('NOT_FOUND', 404);
    return row;
}

module.exports = { clientId, loadClientContext };
