/*
PP CLEANUP — TEST ADMINS ONLY

Goal:
- Remove ONLY "test admin" users from the PP database.

Hard rules:
- MUST abort if IS_PRODUCTION=true OR NODE_ENV=production.
- MUST NOT touch audit_events.
- MUST NOT touch signingfiles / signatures / cases (and related signing evidence tables).
- MUST NOT truncate users.
- MUST NOT delete real admins.

Definition:
- Test admin: role='Admin' AND (email LIKE 'e2e-test-%' OR email LIKE 'test_%@%')
- Real admin: allowlisted OR email NOT matching those patterns.

Preview/apply:
- Default: preview only.
- Apply: set PP_CLEANUP_APPLY=true.

Output:
- PowerShell-safe: no lines starting with '-', prefix info with '#', JSON for lists.
*/

function isProductionEnv() {
    return String(process.env.IS_PRODUCTION || '').toLowerCase() === 'true'
        || String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function logInfo(msg) {
    console.log(`# ${msg}`);
}

function logError(msg) {
    console.error(`# ERROR: ${msg}`);
}

function isSafeIdentifier(name) {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(name || ''));
}

async function tableExists(db, tableName) {
    const res = await db.query(
        `select 1
         from information_schema.tables
         where table_schema = 'public'
           and table_name = $1
         limit 1`,
        [tableName]
    );
    return res.rowCount > 0;
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

async function countRows(db, tableName, whereSql, params) {
    const where = whereSql ? ` where ${whereSql}` : '';
    const res = await db.query(`select count(*)::bigint as n from public.${tableName}${where}`, params || []);
    return Number(res.rows?.[0]?.n || 0);
}

function isTestAdminEmail(email) {
    const e = String(email || '');
    // Match the DB definition as closely as possible.
    return e.startsWith('e2e-test-') || /^test_.+@.+/.test(e);
}

async function getTestAdmins(db, allowlistedEmailsLower) {
    const res = await db.query(
        `select userid, email
         from public.users
         where role = 'Admin'
           and (email like 'e2e-test-%' or email like 'test_%@%')
         order by userid asc`
    );

    const rows = (res.rows || []).map(r => ({ userid: Number(r.userid), email: String(r.email || '') }));
    return rows.filter(r => !allowlistedEmailsLower.has(r.email.toLowerCase()));
}

async function getDeletionBlockReasons(db, userId) {
    const uid = Number(userId);
    if (!Number.isInteger(uid) || uid <= 0) return ['invalid_userid'];

    const reasons = [];

    // Protected/legal tables: we must not touch these tables, even implicitly via ON DELETE SET NULL.
    // If any rows exist that reference this user, we must NOT delete the user.

    if (await tableExists(db, 'audit_events')) {
        const n = await countRows(db, 'audit_events', 'actor_userid = $1', [uid]);
        if (n > 0) reasons.push(`audit_events.actor_userid (${n})`);
    }

    if (await tableExists(db, 'signingfiles')) {
        const clauses = ['lawyerid = $1', 'clientid = $1'];
        // Newer evidence columns might exist.
        if (await hasColumn(db, { table: 'signingfiles', column: 'policyselectedbyuserid' })) {
            clauses.push('policyselectedbyuserid = $1');
        }
        if (await hasColumn(db, { table: 'signingfiles', column: 'otpwaiveracknowledgedbyuserid' })) {
            clauses.push('otpwaiveracknowledgedbyuserid = $1');
        }

        const n = await countRows(db, 'signingfiles', `(${clauses.join(' or ')})`, [uid]);
        if (n > 0) reasons.push(`signingfiles (lawyer/client/policy/waiver) (${n})`);
    }

    if (await tableExists(db, 'cases')) {
        const n = await countRows(db, 'cases', 'userid = $1', [uid]);
        if (n > 0) reasons.push(`cases.userid (${n})`);
    }

    if (await tableExists(db, 'signaturespots')) {
        if (await hasColumn(db, { table: 'signaturespots', column: 'signeruserid' })) {
            const n = await countRows(db, 'signaturespots', 'signeruserid = $1', [uid]);
            if (n > 0) reasons.push(`signaturespots.signeruserid (${n})`);
        }
    }

    if (await tableExists(db, 'signing_consents')) {
        if (await hasColumn(db, { table: 'signing_consents', column: 'signeruserid' })) {
            const n = await countRows(db, 'signing_consents', 'signeruserid = $1', [uid]);
            if (n > 0) reasons.push(`signing_consents.signeruserid (${n})`);
        }
    }

    if (await tableExists(db, 'signing_otp_challenges')) {
        if (await hasColumn(db, { table: 'signing_otp_challenges', column: 'signeruserid' })) {
            const n = await countRows(db, 'signing_otp_challenges', 'signeruserid = $1', [uid]);
            if (n > 0) reasons.push(`signing_otp_challenges.signeruserid (${n})`);
        }
    }

    return reasons;
}

async function getUserForeignKeyRefsToUsers(db) {
    // Returns rows like: { table: 'refresh_tokens', column: 'userid' }
    // Only public schema.
    const res = await db.query(
        `select
            cls.relname as table_name,
            att.attname as column_name
         from pg_constraint c
         join pg_class cls on cls.oid = c.conrelid
         join pg_namespace nsp on nsp.oid = cls.relnamespace
         join pg_attribute att on att.attrelid = c.conrelid and att.attnum = any(c.conkey)
         where c.contype = 'f'
           and c.confrelid = 'public.users'::regclass
           and nsp.nspname = 'public'
         order by cls.relname asc, att.attname asc`
    );

    const out = [];
    for (const r of res.rows || []) {
        const table = String(r.table_name || '');
        const column = String(r.column_name || '');
        if (!isSafeIdentifier(table) || !isSafeIdentifier(column)) continue;
        if (table === 'users') continue;
        out.push({ table, column });
    }
    return out;
}

async function main() {
    console.log('==============================');
    console.log('PP CLEANUP — TEST ADMINS ONLY');
    console.log('==============================');
    logInfo('(INFO) The lines below are OUTPUT only — do not paste them into PowerShell.');

    if (isProductionEnv()) {
        logError('ABORT: This script must not run in production (IS_PRODUCTION=true or NODE_ENV=production).');
        process.exitCode = 2;
        return;
    }

    const apply = String(process.env.PP_CLEANUP_APPLY || '').toLowerCase() === 'true';

    // Hardcoded allowlist as requested (minimal, no extra features).
    const allowlistedEmails = ['liroy@melamed.co.il'];
    const allowlistedEmailsLower = new Set(allowlistedEmails.map(e => e.toLowerCase()));

    // Require DB only after passing production guard.
    const pool = require('../config/db');

    const client = await pool.connect();
    try {
        // Gather current admin counts.
        const adminsTotal = await countRows(client, 'users', `role = 'Admin'`);

        const testAdmins = await getTestAdmins(client, allowlistedEmailsLower);

        logInfo(`Apply mode: ${apply ? 'YES' : 'NO (preview only)'}`);
        logInfo(`Admins total (current): ${adminsTotal}`);
        logInfo(`Test admins found (after allowlist): ${testAdmins.length}`);
        logInfo(`Test admins list JSON:`);
        console.log(`# ${JSON.stringify(testAdmins)}`);

        // Validate emails match expected pattern client-side as a sanity check.
        const unexpected = testAdmins.filter(a => !isTestAdminEmail(a.email));
        if (unexpected.length > 0) {
            logError('ABORT: Found rows from SQL selection that do not match expected test patterns.');
            logInfo('Unexpected list JSON:');
            console.log(`# ${JSON.stringify(unexpected)}`);
            process.exitCode = 2;
            return;
        }

        // Determine deletable vs blocked (blocked means deleting would touch legal tables).
        const deletable = [];
        const blocked = [];

        for (const u of testAdmins) {
            const reasons = await getDeletionBlockReasons(client, u.userid);
            if (reasons.length > 0) {
                blocked.push({ userid: u.userid, email: u.email, reasons });
            } else {
                deletable.push(u);
            }
        }

        const adminsRemainingAfter = adminsTotal - deletable.length;

        logInfo(`Deletable test admins: ${deletable.length}`);
        logInfo(`Blocked test admins (legal references): ${blocked.length}`);
        if (blocked.length > 0) {
            logInfo('Blocked list JSON:');
            console.log(`# ${JSON.stringify(blocked)}`);
        }
        logInfo(`Admins that will remain after APPLY: ${adminsRemainingAfter}`);

        if (!apply) return;

        if (blocked.length > 0) {
            logError('ABORT: Some test admins have legal references; deleting them would modify protected legal tables via FK actions.');
            process.exitCode = 2;
            return;
        }

        if (deletable.length === 0) {
            logInfo('Nothing to delete.');
        } else {
            const ids = deletable.map(u => Number(u.userid)).filter(n => Number.isInteger(n) && n > 0);

            // FK cleanup: delete dependent rows in NON-protected tables that reference users.userid.
            // We must NOT touch protected legal tables.
            const protectedTables = new Set([
                'audit_events',
                'signingfiles',
                'signaturespots',
                'signing_consents',
                'signing_otp_challenges',
                'cases',
                'casedescriptions',
            ]);

            const fkRefs = await getUserForeignKeyRefsToUsers(client);

            await client.query('BEGIN');
            try {
                // Delete dependents first (only for non-protected tables).
                const dependentDeletes = [];
                for (const ref of fkRefs) {
                    if (protectedTables.has(ref.table)) continue;

                    const sql = `delete from public.${ref.table} where ${ref.column} = any($1::int[])`;
                    const res = await client.query(sql, [ids]);
                    const n = res.rowCount || 0;
                    if (n > 0) dependentDeletes.push({ table: ref.table, column: ref.column, deleted: n });
                }

                // Delete ONLY those test admin user rows.
                const delUsersRes = await client.query(
                    `delete from public.users where userid = any($1::int[]) and role = 'Admin'
                     returning userid, email`,
                    [ids]
                );

                const deletedUsers = delUsersRes.rows || [];
                if (deletedUsers.length !== ids.length) {
                    throw new Error(`Deletion mismatch: requested=${ids.length} deleted=${deletedUsers.length}`);
                }

                await client.query('COMMIT');

                logInfo(`Deleted test admins: ${deletedUsers.length}`);
                logInfo('Deleted users JSON:');
                console.log(`# ${JSON.stringify(deletedUsers.map(u => ({ userid: Number(u.userid), email: String(u.email || '') })))} `);

                if (dependentDeletes.length > 0) {
                    logInfo('Deleted dependent non-legal rows (JSON):');
                    console.log(`# ${JSON.stringify(dependentDeletes)}`);
                }
            } catch (e) {
                try { await client.query('ROLLBACK'); } catch { }
                throw e;
            }
        }

        // Final counts required after APPLY.
        const usersCount = await countRows(client, 'users');
        const adminsCount = await countRows(client, 'users', `role = 'Admin'`);
        const nonAdminCount = await countRows(client, 'users', `role <> 'Admin'`);

        logInfo('--- FINAL COUNTS ---');
        logInfo(`users: ${usersCount}`);
        logInfo(`admins: ${adminsCount}`);
        logInfo(`non_admin_users: ${nonAdminCount}`);
    } catch (e) {
        logError(e?.message || String(e));
        process.exitCode = 1;
    } finally {
        client.release();
        try { await pool.end(); } catch { }
    }
}

main().catch((e) => {
    logError(e?.message || String(e));
    process.exitCode = 1;
});
