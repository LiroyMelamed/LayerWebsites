/*
PP RESET — ADMINS PRESERVED

GOAL:
- Reset the PP database to a clean state while preserving ALL Admin users.

SAFETY GUARDS (MANDATORY):
- Abort immediately if IS_PRODUCTION=true OR NODE_ENV=production.

RESET SCOPE (non-admin data):
- Deletes/truncates legal/test artifacts: audit_events, cases, signingfiles, signatures, consents, otp tables, etc.
- Preserves Admin users (role='Admin') and does NOT modify their credentials.

Preview/apply:
- Default: preview only (counts before, and what would be deleted).
- Apply: set PP_RESET_APPLY=true.

IMPORTANT:
- This is a destructive operation for PP only.
*/

function isProductionEnv() {
    return String(process.env.IS_PRODUCTION || '').toLowerCase() === 'true'
        || String(process.env.NODE_ENV || '').toLowerCase() === 'production';
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

async function hasTablePrivilege(db, tableName, privilege) {
    const res = await db.query(
        `select has_table_privilege(current_user, $1, $2) as ok`,
        [`public.${tableName}`, privilege]
    );
    return Boolean(res.rows?.[0]?.ok);
}

async function countRows(db, tableName, whereSql, params) {
    const where = whereSql ? ` where ${whereSql}` : '';
    const res = await db.query(`select count(*)::bigint as n from public.${tableName}${where}`, params || []);
    return Number(res.rows?.[0]?.n || 0);
}

async function main() {
    console.log('==============================');
    console.log('PP RESET — ADMINS PRESERVED');
    console.log('==============================');
    console.log('(INFO) The lines below are OUTPUT only — do not paste them into PowerShell.');

    if (isProductionEnv()) {
        console.error('ABORT: This PP reset script must not run in production.');
        process.exitCode = 2;
        return;
    }

    const apply = String(process.env.PP_RESET_APPLY || '').toLowerCase() === 'true';

    // Require DB only after passing production guard.
    const pool = require('../config/db');

    const client = await pool.connect();
    try {
        // Admins preserved list
        const adminsRes = await client.query(
            `select userid, email
             from public.users
             where role = 'Admin'
             order by userid asc`
        );
        const admins = adminsRes.rows || [];

        // PowerShell-safe output: single-line JSON (no leading "- ").
        console.log(`# Preserved Admins (count=${admins.length}) JSON:`);
        console.log(`# ${JSON.stringify(admins.map(a => ({ userid: a.userid, email: a.email })))} `);

        const adminCountBefore = admins.length;

        // Tables to reset (only if they exist)
        const tablesToTruncate = [
            'audit_events',
            'signing_otp_challenges',
            'signing_consents',
            'signaturespots',
            'signingfiles',
            'casedescriptions',
            'cases',
            'otps',
            'userdevices',
            'usernotifications',
            'refresh_tokens',
        ];

        const existingTables = [];
        for (const t of tablesToTruncate) {
            // Skip tables that don't exist in this DB.
            if (await tableExists(client, t)) existingTables.push(t);
        }

        // Preview counts before
        const before = {};
        for (const t of existingTables) {
            before[t] = await countRows(client, t);
        }
        const usersBefore = await countRows(client, 'users');
        const nonAdminUsersBefore = await countRows(client, 'users', `role <> 'Admin'`);

        console.log('# --- COUNTS BEFORE ---');
        for (const t of existingTables) {
            console.log(`# ${t}: ${before[t]}`);
        }
        console.log(`# users: ${usersBefore}`);
        console.log(`# users_non_admin: ${nonAdminUsersBefore}`);

        if (!apply) {
            console.log('# PP_RESET_APPLY is not true; preview only (no changes made).');
            return;
        }

        // Before doing anything destructive, ensure we have permissions.
        // audit_events in particular is often locked down.
        const missing = [];
        for (const t of existingTables) {
            const ok = await hasTablePrivilege(client, t, 'TRUNCATE');
            if (!ok) missing.push(t);
        }
        if (missing.length > 0) {
            throw new Error(
                `Missing TRUNCATE privilege for tables: ${missing.join(', ')} (current_user=${String((await client.query('select current_user as u')).rows?.[0]?.u || '')})`
            );
        }

        await client.query('BEGIN');

        // Truncate data tables first (transactional in Postgres).
        // Use CASCADE to satisfy FK order safely without disabling constraints.
        if (existingTables.length > 0) {
            const truncateSql = `TRUNCATE TABLE ${existingTables.map(t => `public.${t}`).join(', ')} RESTART IDENTITY CASCADE;`;
            await client.query(truncateSql);
        }

        // Delete all non-admin users.
        // This preserves admin credentials (no updates).
        const delUsersRes = await client.query(`delete from public.users where role <> 'Admin' returning userid`);
        const deletedNonAdminUsers = delUsersRes.rowCount || 0;

        await client.query('COMMIT');

        // Counts after
        const after = {};
        for (const t of existingTables) {
            after[t] = await countRows(client, t);
        }
        const usersAfter = await countRows(client, 'users');
        const nonAdminUsersAfter = await countRows(client, 'users', `role <> 'Admin'`);

        const adminsAfterRes = await client.query(
            `select count(*)::bigint as n
             from public.users
             where role = 'Admin'`
        );
        const adminCountAfter = Number(adminsAfterRes.rows?.[0]?.n || 0);

        console.log('# --- COUNTS AFTER ---');
        for (const t of existingTables) {
            console.log(`# ${t}: ${after[t]}`);
        }
        console.log(`# users: ${usersAfter}`);
        console.log(`# users_non_admin: ${nonAdminUsersAfter}`);

        console.log('# --- SUMMARY (ROWS DELETED) ---');
        for (const t of existingTables) {
            console.log(`# ${t}: ${before[t] - after[t]}`);
        }
        console.log(`# users_non_admin: ${deletedNonAdminUsers}`);

        console.log(`# Admin count before: ${adminCountBefore}`);
        console.log(`# Admin count after:  ${adminCountAfter}`);
        console.log(`# Admins preserved:   ${adminCountBefore === adminCountAfter ? 'YES' : 'NO'}`);

        if (adminCountBefore !== adminCountAfter) {
            throw new Error('Admin preservation check failed (count mismatch).');
        }
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch { }
        console.error('PP reset failed:', e?.message || e);
        process.exitCode = 1;
    } finally {
        client.release();
        try { await pool.end(); } catch { }
    }
}

main().catch((e) => {
    console.error('PP reset crashed:', e?.message || e);
    process.exitCode = 1;
});
