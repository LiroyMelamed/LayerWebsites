/*
PP CLEANUP — TEST USERS ONLY

Purpose:
- Safely remove only E2E test users from PRE-PRODUCTION (PP).
- NEVER touch legal/evidentiary data (audit_events, signing files, signatures, cases, signed docs).

Rules enforced by this script:
1) Identify test users strictly via explicit markers (e2e-test-* patterns and optional marker columns if present).
2) Hard-delete ONLY IF the user has ZERO legal/evidentiary links:
   - audit_events (actor_userid)
   - cases (userid)
   - signingfiles (lawyerid/clientid)
   - signatures (signaturespots.signeruserid, if column exists)
3) audit_events is append-only: this script NEVER UPDATE/DELETEs audit_events; it only SELECTs.

Safety guards:
- Aborts if IS_PRODUCTION=true or NODE_ENV=production.

Usage:
- Preview only (default):
    node backend/scripts/pp-cleanup-test-users.js
- Apply deletes (transactional):
    PP_CLEANUP_APPLY=true node backend/scripts/pp-cleanup-test-users.js
*/

function isProductionEnv() {
    return String(process.env.IS_PRODUCTION || '').toLowerCase() === 'true'
        || String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

async function hasColumn(db, { table, column }) {
    const res = await db.query(
        `select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = $1
           and column_name = $2
         limit 1`,
        [table, column]
    );
    return res.rowCount > 0;
}

function buildTestUserWhere({ hasUsername, hasFullName, hasIsTestUser, hasCreatedBy }) {
    // STRICT identification. Do not rely on created_at.
    const clauses = [
        `email ilike 'e2e-test-%@example.com'`,
        `name ilike 'e2e-test-%'`,
    ];

    if (hasUsername) clauses.push(`username ilike 'e2e-test-%'`);
    if (hasFullName) clauses.push(`full_name ilike 'e2e-test-%'`);
    if (hasIsTestUser) clauses.push(`is_test_user = true`);
    if (hasCreatedBy) clauses.push(`created_by ilike 'e2e%'`);

    return `(${clauses.join(' OR ')})`;
}

function buildHasLegalDataSQL({ signerUserIdSupported }) {
    // Must not modify any legal/evidentiary tables.
    // Only existence checks.
    return `(
        exists (select 1 from audit_events ae where ae.actor_userid = u.userid)
        OR exists (select 1 from cases c where c.userid = u.userid)
        OR exists (select 1 from signingfiles sf where sf.lawyerid = u.userid or sf.clientid = u.userid)
        ${signerUserIdSupported ? 'OR exists (select 1 from signaturespots sp where sp.signeruserid = u.userid)' : ''}
    )`;
}

async function main() {
    if (isProductionEnv()) {
        console.error('ABORT: This PP cleanup script must not run in production.');
        process.exitCode = 2;
        return;
    }

    // Require DB only after passing the production guard.
    const pool = require('../config/db');

    const apply = String(process.env.PP_CLEANUP_APPLY || '').toLowerCase() === 'true';

    const client = await pool.connect();
    try {
        const hasUsername = await hasColumn(client, { table: 'users', column: 'username' });
        const hasFullName = await hasColumn(client, { table: 'users', column: 'full_name' });
        const hasIsTestUser = await hasColumn(client, { table: 'users', column: 'is_test_user' });
        const hasCreatedBy = await hasColumn(client, { table: 'users', column: 'created_by' });

        const signerUserIdSupported = await hasColumn(client, { table: 'signaturespots', column: 'signeruserid' });

        const testUserWhere = buildTestUserWhere({ hasUsername, hasFullName, hasIsTestUser, hasCreatedBy });
        const hasLegalDataExpr = buildHasLegalDataSQL({ signerUserIdSupported });

        // Preview
        const previewSql = `
            select
                u.userid,
                u.role,
                u.name,
                u.email,
                (${hasLegalDataExpr}) as has_legal_data
            from users u
            where ${testUserWhere}
            order by u.userid desc
        `;

        const previewRes = await client.query(previewSql);
        const rows = previewRes.rows || [];

        const wouldDelete = rows.filter(r => !r.has_legal_data);
        const wouldSkip = rows.filter(r => r.has_legal_data);

        console.log(`PP cleanup preview: matched test users = ${rows.length}`);
        console.log(`- would DELETE (no legal data): ${wouldDelete.length}`);
        console.log(`- would SKIP  (has legal data): ${wouldSkip.length}`);

        // Print a small preview list (bounded).
        const maxPrint = 25;
        for (const r of wouldDelete.slice(0, maxPrint)) {
            console.log(`DELETE userid=${r.userid} role=${r.role} email=${r.email}`);
        }
        for (const r of wouldSkip.slice(0, maxPrint)) {
            console.log(`SKIP   userid=${r.userid} role=${r.role} email=${r.email}`);
        }

        if (!apply) {
            console.log('PP_CLEANUP_APPLY is not true; preview only (no changes made).');
            return;
        }

        // Apply deletes transactionally using the SAME conditions.
        await client.query('BEGIN');

        const deleteSql = `
            with candidates as (
                select u.userid
                from users u
                where ${testUserWhere}
                  and not (${hasLegalDataExpr})
            ),
            del_userdevices as (
                delete from userdevices d
                where d.userid in (select userid from candidates)
                returning d.userid
            ),
            del_otps as (
                delete from otps o
                where o.userid in (select userid from candidates)
                returning o.userid
            ),
            del_usernotifications as (
                delete from usernotifications n
                where n.userid in (select userid from candidates)
                returning n.userid
            ),
            del_refresh_tokens as (
                delete from refresh_tokens r
                where r.userid in (select userid from candidates)
                returning r.userid
            )
            delete from users u
            where u.userid in (select userid from candidates)
            returning u.userid
        `;

        const delRes = await client.query(deleteSql);
        const deletedCount = delRes.rowCount || 0;

        await client.query('COMMIT');

        console.log(`PP cleanup applied: deleted users = ${deletedCount}`);
        console.log(`PP cleanup applied: skipped users (has legal data) = ${wouldSkip.length}`);
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch { }
        console.error('PP cleanup failed:', e?.message || e);
        process.exitCode = 1;
    } finally {
        client.release();
    }
}

main()
    .catch((e) => {
        console.error('PP cleanup crashed:', e?.message || e);
        process.exitCode = 1;
    })
    .finally(async () => {
        // Intentionally left blank: the pg Pool is created inside main() after guard.
    });
