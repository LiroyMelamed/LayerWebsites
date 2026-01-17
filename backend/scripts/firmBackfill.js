#!/usr/bin/env node
/* eslint-disable no-console */

// Firm backfill utility
// - SAFE: dry-run default
// - IDEMPOTENT: only updates rows where firmid IS NULL
// - BATCHED: processes in batches to avoid long locks

const pool = require('../config/db');

const DEFAULT_BATCH_SIZE = 500;

function isFirmScopeEnabled() {
    return String(process.env.FIRM_SCOPE_ENABLED ?? 'false').toLowerCase() === 'true';
}

function parseArgs(argv) {
    const args = {
        execute: false,
        max: null,
        since: null,
        firm: null,
        verbose: false,
        help: false,
    };

    for (let i = 2; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--help' || a === '-h') args.help = true;
        else if (a === '--execute') args.execute = true;
        else if (a === '--max') args.max = argv[++i];
        else if (a === '--since') args.since = argv[++i];
        else if (a === '--firm') args.firm = argv[++i];
        else if (a === '--verbose') args.verbose = true;
        else throw new Error(`Unknown arg: ${a}`);
    }

    return args;
}

function requireExecuteGates() {
    if (!isFirmScopeEnabled()) {
        throw new Error('Execute mode blocked: set FIRM_SCOPE_ENABLED=true');
    }
    if (String(process.env.BACKFILL_ALLOW_WRITE || '').toLowerCase() !== 'true') {
        throw new Error('Execute mode blocked: set BACKFILL_ALLOW_WRITE=true');
    }
    if (String(process.env.BACKFILL_CONFIRM || '') !== 'YES') {
        throw new Error('Execute mode blocked: set BACKFILL_CONFIRM=YES');
    }
}

function parsePositiveIntOrNull(v) {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
}

function parseSinceOrNull(v) {
    if (!v) return null;
    // Accept YYYY-MM-DD and treat as midnight UTC.
    const m = /^\d{4}-\d{2}-\d{2}$/.exec(String(v));
    if (!m) throw new Error('--since must be YYYY-MM-DD');
    const iso = `${v}T00:00:00.000Z`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error('--since invalid date');
    return iso;
}

async function regclassExists(name) {
    const res = await pool.query('select to_regclass($1) as r', [name]);
    return Boolean(res.rows?.[0]?.r);
}

async function ensureDefaultFirm() {
    const firmKey = String(process.env.LAW_FIRM_KEY || 'default');
    const firmName = String(process.env.LAW_FIRM_NAME || 'Default Firm');

    const existing = await pool.query(
        'select firmid as "FirmId" from firms where firm_key = $1 limit 1',
        [firmKey]
    );

    const firmId = Number(existing.rows?.[0]?.FirmId);
    if (Number.isFinite(firmId) && firmId > 0) return firmId;

    const inserted = await pool.query(
        'insert into firms (firm_key, name) values ($1, $2) returning firmid as "FirmId"',
        [firmKey, firmName]
    );

    const newId = Number(inserted.rows?.[0]?.FirmId);
    if (!Number.isFinite(newId) || newId <= 0) throw new Error('Failed to create default firm');
    return newId;
}

function computeTargetFirmId({ defaultFirmId, userFirmIds }) {
    if (Array.isArray(userFirmIds) && userFirmIds.length > 0) {
        if (userFirmIds.includes(defaultFirmId)) {
            return { firmId: defaultFirmId, reason: 'user_in_default_firm' };
        }
        if (userFirmIds.length === 1) {
            return { firmId: userFirmIds[0], reason: 'user_single_firm_membership' };
        }
        // Multi-firm edge case: choose the smallest firm id deterministically.
        const chosen = [...userFirmIds].sort((a, b) => a - b)[0];
        return { firmId: chosen, reason: 'user_multi_firm_choose_smallest' };
    }

    // Single deployment assumption: fall back to default firm.
    return { firmId: defaultFirmId, reason: 'no_membership_default' };
}

function buildValuesUpdate({ table, idColumn, targetColumn, idType, targetType, rows }) {
    // UPDATE <table> t SET <targetColumn> = v.<targetColumn>
    // FROM (VALUES ($1,$2),...) v(<idColumn>, <targetColumn>)
    // WHERE t.<idColumn>=v.<idColumn> AND t.<targetColumn> IS NULL

    const values = [];
    const params = [];

    for (const r of rows) {
        params.push(r.id, r.value);
        const i = params.length;
        const idCast = idType ? `::${idType}` : '';
        const targetCast = targetType ? `::${targetType}` : '';
        values.push(`($${i - 1}${idCast}, $${i}${targetCast})`);
    }

    const sql = `update ${table} t
set ${targetColumn} = v.${targetColumn}
from (values ${values.join(', ')}) v(${idColumn}, ${targetColumn})
where t.${idColumn} = v.${idColumn}
  and t.${targetColumn} is null`;

    return { sql, params };
}

async function backfillSigningFiles({ defaultFirmId, dryRun, max, sinceIso, verbose }) {
    const summary = {
        scannedSigningFiles: 0,
        updatedSigningFiles: 0,
        skippedSigningFiles: 0,
        reasons: {
            user_in_default_firm: 0,
            user_single_firm_membership: 0,
            user_multi_firm_choose_smallest: 0,
            no_membership_default: 0,
            already_backfilled_race: 0,
        },
    };

    let lastId = 0;
    const totalCap = max != null ? Number(max) : null;
    const limitCap = Number.isFinite(totalCap) && totalCap > 0 ? Math.floor(totalCap) : null;

    while (true) {
        const remaining = limitCap == null ? DEFAULT_BATCH_SIZE : Math.min(DEFAULT_BATCH_SIZE, Math.max(0, limitCap - summary.scannedSigningFiles));
        if (remaining <= 0) break;

        const params = [lastId, remaining];
        let where = 'where firmid is null and signingfileid > $1';
        if (sinceIso) {
            params.push(sinceIso);
            where += ` and createdat >= $${params.length}::timestamptz`;
        }

        const res = await pool.query(
            `select signingfileid as "SigningFileId", lawyerid as "LawyerId"
             from signingfiles
             ${where}
             order by signingfileid asc
             limit $2`,
            params
        );

        const rows = res.rows || [];
        if (rows.length === 0) break;

        lastId = Number(rows[rows.length - 1].SigningFileId) || lastId;

        summary.scannedSigningFiles += rows.length;

        const lawyerIds = Array.from(
            new Set(
                rows
                    .map((r) => Number(r.LawyerId))
                    .filter((n) => Number.isFinite(n) && n > 0)
            )
        );

        const firmUsers = lawyerIds.length === 0
            ? []
            : (await pool.query(
                'select userid as "UserId", firmid as "FirmId" from firm_users where userid = any($1::int[])',
                [lawyerIds]
            )).rows;

        /** @type {Map<number, number[]>} */
        const userToFirmIds = new Map();
        for (const r of firmUsers || []) {
            const userId = Number(r.UserId);
            const firmId = Number(r.FirmId);
            if (!Number.isFinite(userId) || userId <= 0) continue;
            if (!Number.isFinite(firmId) || firmId <= 0) continue;
            const arr = userToFirmIds.get(userId) || [];
            arr.push(firmId);
            userToFirmIds.set(userId, arr);
        }

        const updates = [];
        for (const r of rows) {
            const signingFileId = Number(r.SigningFileId);
            const lawyerId = Number(r.LawyerId);
            if (!Number.isFinite(signingFileId) || signingFileId <= 0) {
                summary.skippedSigningFiles += 1;
                continue;
            }

            const firmIds = Number.isFinite(lawyerId) && lawyerId > 0 ? userToFirmIds.get(lawyerId) : null;
            const decision = computeTargetFirmId({ defaultFirmId, userFirmIds: firmIds || [] });

            summary.reasons[decision.reason] = (summary.reasons[decision.reason] || 0) + 1;
            updates.push({ id: signingFileId, value: decision.firmId });

            if (verbose) {
                console.log('[backfill] signingfile', { signingFileId, lawyerId: Number.isFinite(lawyerId) ? lawyerId : null, firmId: decision.firmId, reason: decision.reason });
            }
        }

        if (updates.length === 0) continue;

        if (dryRun) {
            summary.updatedSigningFiles += updates.length;
            continue;
        }

        const { sql, params: updateParams } = buildValuesUpdate({
            table: 'signingfiles',
            idColumn: 'signingfileid',
            targetColumn: 'firmid',
            idType: 'int',
            targetType: 'int',
            rows: updates,
        });

        const upd = await pool.query(sql, updateParams);
        const applied = Number(upd.rowCount) || 0;
        summary.updatedSigningFiles += applied;

        const skippedRace = updates.length - applied;
        if (skippedRace > 0) {
            summary.skippedSigningFiles += skippedRace;
            summary.reasons.already_backfilled_race += skippedRace;
        }
    }

    return summary;
}

async function checkNullableFirmIdInFirmUsageEvents() {
    const exists = await regclassExists('public.firm_usage_events');
    if (!exists) return { exists: false, nullable: false, nullCount: 0 };

    const col = await pool.query(
        `select is_nullable as "IsNullable"
         from information_schema.columns
         where table_schema = 'public' and table_name = 'firm_usage_events' and column_name = 'firmid'
         limit 1`
    );

    const isNullable = String(col.rows?.[0]?.IsNullable || '').toLowerCase() === 'yes';
    if (!isNullable) return { exists: true, nullable: false, nullCount: 0 };

    const cnt = await pool.query('select count(*)::int as c from firm_usage_events where firmid is null');
    return { exists: true, nullable: true, nullCount: Number(cnt.rows?.[0]?.c || 0) };
}

async function run(argv = process.argv) {
    const args = parseArgs(argv);
    if (args.help) {
        console.log('Usage: node scripts/firmBackfill.js [--execute] [--max N] [--since YYYY-MM-DD] [--firm <firmId>] [--verbose]');
        console.log('Default: dry-run (no writes).');
        console.log('Execute requires: FIRM_SCOPE_ENABLED=true, BACKFILL_ALLOW_WRITE=true, BACKFILL_CONFIRM=YES');
        return;
    }

    const max = args.max != null ? parsePositiveIntOrNull(args.max) : null;
    if (args.max != null && max == null) throw new Error('--max must be a positive integer');

    const sinceIso = parseSinceOrNull(args.since);

    const firmArg = args.firm != null ? parsePositiveIntOrNull(args.firm) : null;
    if (args.firm != null && firmArg == null) throw new Error('--firm must be a positive integer');

    const dryRun = !args.execute;
    if (!dryRun) requireExecuteGates();

    const tablesOk = await regclassExists('public.firms') && await regclassExists('public.firm_users') && await regclassExists('public.signingfiles');
    if (!tablesOk) {
        throw new Error('Firm backfill requires migrated schema: firms, firm_users, signingfiles');
    }

    const hasSigningFilesFirmId = await pool.query(
        `select 1
         from information_schema.columns
         where table_schema = 'public' and table_name = 'signingfiles' and column_name = 'firmid'
         limit 1`
    );

    if ((hasSigningFilesFirmId.rows || []).length === 0) {
        throw new Error('signingfiles.firmid column not found (run migrations first)');
    }

    const firmIdUsed = firmArg || await ensureDefaultFirm();

    const signingFilesSummary = await backfillSigningFiles({
        defaultFirmId: firmIdUsed,
        dryRun,
        max,
        sinceIso,
        verbose: args.verbose,
    });

    const firmUsageEventsCheck = await checkNullableFirmIdInFirmUsageEvents();

    const finalSummary = {
        updatedSigningFiles: signingFilesSummary.updatedSigningFiles,
        skippedSigningFiles: signingFilesSummary.skippedSigningFiles,
        reasons: signingFilesSummary.reasons,
        firmIdUsed,
        max: max || null,
        dryRun,
        scannedSigningFiles: signingFilesSummary.scannedSigningFiles,
        since: sinceIso,
        notes: {
            firm_usage_events: firmUsageEventsCheck,
        },
    };

    console.log(JSON.stringify(finalSummary, null, 2));
}

if (require.main === module) {
    run().catch((e) => {
        console.error('[firmBackfill] failed:', e?.message || e);
        process.exitCode = 1;
    });
}

module.exports = { run };
