/*
PROD RESET — PRESERVE ONE ADMIN BY PHONE

GOAL:
- Delete ALL tenant data and ALL users except ONE preserved Admin user.

DEFAULT MODE:
- Preview only (prints what would be deleted).

APPLY MODE (DESTRUCTIVE):
- Set ALL of the following:
  - PROD_RESET_APPLY=true
  - PROD_RESET_CONFIRM=DELETE_PROD_DATA
  - PROD_RESET_PHONE=0507299064

DB CONFIG:
- Prefer DATABASE_URL, otherwise require: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT
- Optional: DB_SSL=true

NOTES:
- Preserves reference/platform tables by default (to keep the app functional):
    - subscription_plans
    - casetypes
    - casetypedescriptions

- If you also want to wipe case types, set:
    - PROD_RESET_WIPE_CASETYPES=true

- Uses TRUNCATE ... CASCADE for data tables when possible.
- Deletes users last: DELETE FROM users WHERE userid <> preserved.
*/

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// When running manually (not via PM2), load backend/.env if present.
// This keeps behavior consistent with PM2's env_file: '.env'.
try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
    }
} catch {
    // no-op
}

function asBoolEnv(name) {
    return String(process.env[name] || '').toLowerCase() === 'true';
}

function mustEqualEnv(name, expected) {
    return String(process.env[name] || '') === String(expected);
}

function logInfo(msg) {
    console.log(`# ${msg}`);
}

function logError(msg) {
    console.error(`# ERROR: ${msg}`);
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

function buildPoolFromEnv() {
    if (process.env.DATABASE_URL) {
        return new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: String(process.env.DB_SSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined,
        });
    }

    const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_PORT'];
    for (const key of required) {
        if (!process.env[key]) {
            throw new Error(
                `Missing required DB config: ${key}. Set DATABASE_URL or all of ${required.join(', ')}.`
            );
        }
    }

    return new Pool({
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT),
        ssl: String(process.env.DB_SSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
        max: Number.parseInt(process.env.DB_POOL_MAX || '10', 10),
        idleTimeoutMillis: Number.parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10),
        connectionTimeoutMillis: Number.parseInt(process.env.DB_POOL_CONN_TIMEOUT_MS || '5000', 10),
    });
}

async function getTablesReferencingUsers(db) {
    const res = await db.query(
        `select distinct tc.table_name as table_name
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on tc.constraint_name = kcu.constraint_name
          and tc.table_schema = kcu.table_schema
         join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name
          and ccu.table_schema = tc.table_schema
         where tc.table_schema = 'public'
           and tc.constraint_type = 'FOREIGN KEY'
           and ccu.table_name = 'users'`
    );

    return (res.rows || [])
        .map(r => String(r.table_name || '').trim())
        .filter(Boolean);
}

async function main() {
    logInfo('==============================');
    logInfo('PROD RESET — PRESERVE ADMIN PHONE');
    logInfo('==============================');

    const preservedPhone = String(process.env.PROD_RESET_PHONE || '').trim();
    if (!preservedPhone) {
        logError('Missing PROD_RESET_PHONE. Example: PROD_RESET_PHONE=0507299064');
        process.exitCode = 2;
        return;
    }

    const apply = asBoolEnv('PROD_RESET_APPLY');
    logInfo(`Apply mode: ${apply ? 'YES' : 'NO (preview only)'}`);

    if (apply) {
        if (!mustEqualEnv('PROD_RESET_CONFIRM', 'DELETE_PROD_DATA')) {
            logError("Refusing to apply: set PROD_RESET_CONFIRM=DELETE_PROD_DATA");
            process.exitCode = 2;
            return;
        }
        if (!mustEqualEnv('PROD_RESET_PHONE', preservedPhone)) {
            // Defensive: prevent accidentally applying to a different phone than printed.
            logError('Refusing to apply: PROD_RESET_PHONE mismatch');
            process.exitCode = 2;
            return;
        }
    }

    const wipeCaseTypes = asBoolEnv('PROD_RESET_WIPE_CASETYPES');

    const preserveTables = new Set([
        'subscription_plans',
        // Case types are reference data that the app may depend on.
        // Preserve by default; allow wiping via PROD_RESET_WIPE_CASETYPES=true.
        ...(wipeCaseTypes ? [] : ['casetypes', 'casetypedescriptions']),
    ]);

    // Baseline known data tables to clear.
    const baselineTablesToClear = [
        'audit_events',
        'signing_otp_challenges',
        'signing_consents',
        'signaturespots',
        'signing_retention_warnings',
        'signingfiles',
        'uploadedfiles',
        'casedescriptions',
        'cases',
        'otps',
        'userdevices',
        'usernotifications',
        'refresh_tokens',
        'tenant_subscriptions',
        'data_retention_runs',
        'firms',
        'firm_users',
        'firm_subscriptions',
        'firm_plan_overrides',
        'firm_usage_events',
        'firm_signing_policy',
    ];

    const pool = buildPoolFromEnv();
    const client = await pool.connect();

    try {
        // 1) Validate preserved admin
        if (!(await tableExists(client, 'users'))) {
            throw new Error('Missing required table: public.users');
        }

        const preservedRes = await client.query(
            `select userid, name, email, phonenumber, role
             from public.users
             where phonenumber = $1`,
            [preservedPhone]
        );

        if ((preservedRes.rows || []).length !== 1) {
            throw new Error(
                `Preserved admin with phone ${preservedPhone} must exist exactly once (found ${preservedRes.rows?.length || 0}).`
            );
        }

        const preserved = preservedRes.rows[0];
        if (String(preserved.role) !== 'Admin') {
            throw new Error(
                `Preserved user role must be 'Admin' (found role='${String(preserved.role)}').`
            );
        }

        logInfo(`Preserved admin: ${JSON.stringify({ userid: preserved.userid, email: preserved.email, phone: preserved.phonenumber })}`);

        // 2) Build final clear-list = baseline + any FK tables that reference users
        const fkToUsers = await getTablesReferencingUsers(client);
        const finalTablesToClear = Array.from(new Set([
            ...baselineTablesToClear,
            ...fkToUsers,
        ]))
            .filter(t => !preserveTables.has(t) && t !== 'users');

        // 3) Only keep tables that actually exist
        const existingTablesToClear = [];
        for (const t of finalTablesToClear) {
            if (await tableExists(client, t)) existingTablesToClear.push(t);
        }

        // Preview counts
        const usersBefore = await countRows(client, 'users');
        const usersToDelete = await countRows(client, 'users', 'userid <> $1', [preserved.userid]);

        logInfo('--- PREVIEW COUNTS ---');
        logInfo(`users_total: ${usersBefore}`);
        logInfo(`users_to_delete: ${usersToDelete}`);

        for (const t of existingTablesToClear) {
            const n = await countRows(client, t);
            logInfo(`${t}: ${n}`);
        }

        if (!apply) {
            logInfo('Preview only. To APPLY, set:');
            logInfo('PROD_RESET_APPLY=true');
            logInfo('PROD_RESET_CONFIRM=DELETE_PROD_DATA');
            logInfo(`PROD_RESET_PHONE=${preservedPhone}`);
            return;
        }

        // 4) Privilege checks (best-effort)
        const missingTruncate = [];
        for (const t of existingTablesToClear) {
            const ok = await hasTablePrivilege(client, t, 'TRUNCATE');
            if (!ok) missingTruncate.push(t);
        }
        const canDeleteUsers = await hasTablePrivilege(client, 'users', 'DELETE');
        if (!canDeleteUsers) missingTruncate.push('DELETE:users');

        if (missingTruncate.length > 0) {
            throw new Error(`Missing privileges: ${missingTruncate.join(', ')}`);
        }

        await client.query('BEGIN');

        // Lock the preserved user row so it can’t disappear mid-transaction.
        await client.query('select userid from public.users where userid = $1 for update', [preserved.userid]);

        // Truncate all data tables.
        if (existingTablesToClear.length > 0) {
            const truncateSql = `TRUNCATE TABLE ${existingTablesToClear.map(t => `public.${t}`).join(', ')} CASCADE;`;
            await client.query(truncateSql);
            logInfo(`Truncated tables count: ${existingTablesToClear.length}`);
        } else {
            logInfo('No data tables found to truncate (unexpected).');
        }

        // Delete all users except preserved.
        const delUsersRes = await client.query(
            'delete from public.users where userid <> $1',
            [preserved.userid]
        );
        logInfo(`Deleted users: ${delUsersRes.rowCount || 0}`);

        await client.query('COMMIT');

        // Final verification
        const usersAfter = await countRows(client, 'users');
        const preservedAfter = await countRows(client, 'users', 'userid = $1', [preserved.userid]);

        logInfo('--- AFTER ---');
        logInfo(`users_total: ${usersAfter}`);
        logInfo(`preserved_user_exists: ${preservedAfter === 1 ? 'YES' : 'NO'}`);

        if (usersAfter !== 1 || preservedAfter !== 1) {
            throw new Error('Post-check failed: expected exactly 1 preserved admin user remaining.');
        }
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch { }
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
