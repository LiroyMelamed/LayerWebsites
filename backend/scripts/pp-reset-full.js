/*
PP RESET — FULL (PP ONLY)

GOAL:
- Reset the PP database to a clean state for manual re-seeding.

SAFETY GUARDS (MANDATORY):
- Abort immediately if IS_PRODUCTION=true OR NODE_ENV=production.

Preview/apply:
- Default: preview only.
- Apply: set PP_RESET_APPLY=true.

Output requirements:
- PowerShell-safe output
- No lines starting with "-"
- Prefix info lines with "#"
- JSON for lists if printed
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

function asBoolEnv(name) {
    return String(process.env[name] || '').toLowerCase() === 'true';
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

async function countRows(db, tableName) {
    const res = await db.query(`select count(*)::bigint as n from public.${tableName}`);
    return Number(res.rows?.[0]?.n || 0);
}

async function getSerialSequencesForTable(db, tableName) {
    const res = await db.query(
        `select distinct
            pg_get_serial_sequence('public.' || c.relname, a.attname) as seq
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid
         join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
         where n.nspname = 'public'
           and c.relname = $1
           and a.attnum > 0
           and not a.attisdropped
           and pg_get_expr(d.adbin, d.adrelid) like 'nextval(%'
        `,
        [tableName]
    );

    return (res.rows || [])
        .map(r => String(r.seq || '').trim())
        .filter(Boolean);
}

async function hasSequencePrivileges(db, seqName) {
    const res = await db.query(
        `select
            has_sequence_privilege(current_user, $1, 'USAGE') as usage_ok,
            has_sequence_privilege(current_user, $1, 'UPDATE') as update_ok`,
        [seqName]
    );
    const row = res.rows?.[0] || {};
    return Boolean(row.usage_ok) && Boolean(row.update_ok);
}

async function resetSequence(db, seqName) {
    // Resets to 1 and marks is_called=false so nextval returns 1.
    await db.query(`select setval($1::regclass, 1, false)`, [seqName]);
}

async function main() {
    logInfo('==============================');
    logInfo('PP RESET — FULL');
    logInfo('==============================');

    if (isProductionEnv()) {
        logError('ABORT: This PP reset script must not run in production (IS_PRODUCTION=true or NODE_ENV=production).');
        process.exitCode = 2;
        return;
    }

    const apply = asBoolEnv('PP_RESET_APPLY');
    logInfo(`Apply mode: ${apply ? 'YES' : 'NO (preview only)'}`);

    // Require DB only after passing production guard.
    // Intentionally avoid requiring ../config/db (it logs to stdout without '#').
    const { Pool } = require('pg');
    const path = require('path');
    require('dotenv').config({ path: path.join(__dirname, '../.env') });

    const pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 5432,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: Number.parseInt(process.env.DB_POOL_MAX || '20', 10),
        idleTimeoutMillis: Number.parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10),
        connectionTimeoutMillis: Number.parseInt(process.env.DB_POOL_CONN_TIMEOUT_MS || '5000', 10),
    });

    const client = await pool.connect();
    try {
        const tablesForPreview = [
            'users',
            'audit_events',
            'signingfiles',
            'signaturespots',
            'signing_consents',
            'signing_otp_challenges',
            'cases',
            'casedescriptions',
            'refresh_tokens',
            'userdevices',
            'usernotifications',
        ];

        const existingPreviewTables = [];
        for (const t of tablesForPreview) {
            if (await tableExists(client, t)) existingPreviewTables.push(t);
        }

        logInfo('--- COUNTS (PREVIEW) ---');
        for (const t of existingPreviewTables) {
            const n = await countRows(client, t);
            logInfo(`${t}: ${n}`);
        }

        if (!apply) {
            logInfo('PP_RESET_APPLY is not true; preview only (no changes made).');
            return;
        }

        const deleteTables = ['refresh_tokens', 'userdevices', 'usernotifications', 'otps'];
        const truncateTablesInOrder = [
            'signing_otp_challenges',
            'signing_consents',
            'signaturespots',
            'signingfiles',
            'casedescriptions',
            'cases',
            'audit_events',
        ];

        const existingDeleteTables = [];
        for (const t of deleteTables) {
            if (await tableExists(client, t)) existingDeleteTables.push(t);
        }

        const existingTruncateTables = [];
        for (const t of truncateTablesInOrder) {
            if (await tableExists(client, t)) existingTruncateTables.push(t);
        }

        // Permission checks up front.
        const missing = [];
        for (const t of existingDeleteTables) {
            if (!(await hasTablePrivilege(client, t, 'DELETE'))) missing.push(`DELETE:${t}`);
        }
        for (const t of existingTruncateTables) {
            if (!(await hasTablePrivilege(client, t, 'TRUNCATE'))) missing.push(`TRUNCATE:${t}`);
        }
        if (await tableExists(client, 'users')) {
            if (!(await hasTablePrivilege(client, 'users', 'DELETE'))) missing.push('DELETE:users');
        }
        if (missing.length > 0) {
            throw new Error(`Missing privileges: ${missing.join(', ')}`);
        }

        await client.query('BEGIN');

        // Delete non-schema user-related data first.
        for (const t of existingDeleteTables) {
            const res = await client.query(`delete from public.${t}`);
            logInfo(`Deleted from ${t}: ${res.rowCount || 0}`);
        }

        // Truncate core signing/cases/audit tables.
        // Use CASCADE to ensure FK consistency without relying on implicit order in the schema.
        for (const t of existingTruncateTables) {
            await client.query(`truncate table public.${t} cascade`);
            logInfo(`Truncated ${t}`);
        }

        // Finally, delete ALL users (end with users=0).
        if (await tableExists(client, 'users')) {
            const delUsersRes = await client.query(`delete from public.users`);
            logInfo(`Deleted users: ${delUsersRes.rowCount || 0}`);
        }

        // Reset sequences for affected tables (best-effort within granted privileges).
        const sequenceResetTables = Array.from(new Set([
            ...existingDeleteTables,
            ...existingTruncateTables,
            'users',
        ].filter(Boolean)));

        const seqs = new Set();
        for (const t of sequenceResetTables) {
            if (!(await tableExists(client, t))) continue;
            const s = await getSerialSequencesForTable(client, t);
            for (const seqName of s) seqs.add(seqName);
        }

        let seqResetOk = 0;
        let seqResetSkip = 0;
        const skipped = [];

        for (const seqName of Array.from(seqs).sort()) {
            const ok = await hasSequencePrivileges(client, seqName);
            if (!ok) {
                seqResetSkip += 1;
                skipped.push(seqName);
                continue;
            }
            await resetSequence(client, seqName);
            seqResetOk += 1;
        }

        logInfo(`Sequences reset: ${seqResetOk}`);
        if (seqResetSkip > 0) {
            logInfo(`Sequences skipped (missing privilege): ${seqResetSkip}`);
            logInfo('Skipped sequences JSON:');
            console.log(`# ${JSON.stringify(skipped)}`);
        }

        await client.query('COMMIT');

        // Final verification counts (script-level).
        logInfo('--- COUNTS AFTER APPLY ---');
        for (const t of existingPreviewTables) {
            const n = await countRows(client, t);
            logInfo(`${t}: ${n}`);
        }

        if ((await tableExists(client, 'users')) && (await countRows(client, 'users')) !== 0) {
            throw new Error('Post-condition failed: users is not 0.');
        }

        logInfo('PP reset full completed successfully.');
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch { }
        logError(`PP reset failed: ${e?.message || e}`);
        process.exitCode = 1;
    } finally {
        client.release();
        try { await pool.end(); } catch { }
    }
}

main().catch((e) => {
    logError(`PP reset crashed: ${e?.message || e}`);
    process.exitCode = 1;
});
