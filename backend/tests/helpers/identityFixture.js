const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const pool = require('../../config/db');

// Real identities: JWT role claims cannot stand in for a current users row.
function useTestIdentities() {
    const identities = {};
    test.before(async () => {
        assert.equal(process.env.LEGAL_DB_QA, 'true');
        assert.equal(process.env.DB_HOST, '127.0.0.1');
        assert.ok(['legal_e2e_qa','codex_readiness_20261005'].includes(process.env.DB_NAME));
        for (const [key, role] of [['admin','Admin'],['lawyer','Lawyer'],['client','User'],['outsider','User'],['lawyerB','Lawyer'],['lawyerC','Lawyer'],['staffOutsider','Lawyer']]) {
            const id = crypto.randomUUID();
            const r = await pool.query(
                'INSERT INTO users(name,email,phonenumber,passwordhash,role) VALUES($1,$2,$3,$4,$5) RETURNING userid',
                ['Synthetic identity QA '+key, id+'@example.test', 'qa-'+id.slice(0,16), 'x', role]);
            identities[key] = r.rows[0].userid;
        }
    });
    test.after(async () => {
        await pool.query('DELETE FROM users WHERE userid=ANY($1::int[])',[Object.values(identities)]);
        await pool.end();
    });
    return identities;
}
module.exports = { useTestIdentities };
