#!/usr/bin/env node
/* eslint-disable no-console */

// Retention cleanup (documents only) for SigningFiles and related evidence artifacts.
// Default: dry-run. Execute requires explicit env flags.

const crypto = require('crypto');
const pool = require('../config/db');
const { r2, BUCKET } = require('../utils/r2');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { resolveTenantPlan } = require('../lib/plan/resolveTenantPlan');
const { resolveFirmPlan } = require('../lib/plan/resolveFirmPlan');

function isFirmScopeEnabled() {
    return String(process.env.FIRM_SCOPE_ENABLED ?? 'false').toLowerCase() === 'true';
}

function randomUuid() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    // Fallback for older Node versions
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (crypto.randomBytes(1)[0] % 16);
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function parseArgs(argv) {
    const args = { tenant: null, firm: null, dryRun: true, nowIso: null, maxDocs: null, softBufferDays: null };
    for (let i = 2; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--help' || a === '-h') args.help = true;
        else if (a === '--tenant') args.tenant = argv[++i];
        else if (a === '--firm') args.firm = argv[++i];
        else if (a === '--dry-run') args.dryRun = true;
        else if (a === '--execute') args.dryRun = false;
        else if (a === '--now') args.nowIso = argv[++i];
        else if (a === '--max-docs') args.maxDocs = argv[++i];
        else if (a === '--soft-buffer-days' || a === '--buffer-days') args.softBufferDays = argv[++i];
        else throw new Error(`Unknown arg: ${a}`);
    }
    return args;
}

function requireExecuteGates() {
    if (String(process.env.RETENTION_ALLOW_DELETE || '').toLowerCase() !== 'true') {
        throw new Error('Execute mode blocked: set RETENTION_ALLOW_DELETE=true');
    }
    if (String(process.env.RETENTION_CONFIRM || '') !== 'DELETE') {
        throw new Error('Execute mode blocked: set RETENTION_CONFIRM=DELETE');
    }
}

function toDateOrThrow(nowIso) {
    if (!nowIso) return new Date();
    const d = new Date(nowIso);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid --now value: ${nowIso}`);
    return d;
}

function subtractDays(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - Number(days));
    return d;
}

async function deleteObjectSafe({ bucket, key }) {
    if (!key) return { ok: true, skipped: true };
    const b = bucket || BUCKET;
    try {
        await r2.send(new DeleteObjectCommand({ Bucket: b, Key: key }));
        return { ok: true, skipped: false };
    } catch (e) {
        return { ok: false, error: e };
    }
}

async function discoverTenants({ tenantId }) {
    if (tenantId) {
        const t = Number(tenantId);
        if (!Number.isFinite(t) || t <= 0) throw new Error('--tenant must be a positive integer');
        return [t];
    }

    // Prefer explicit subscriptions; fallback to any lawyerid seen in signingfiles.
    const res = await pool.query(
        `select distinct tenant_id as "TenantId" from tenant_subscriptions where status = 'active'
     union
     select distinct lawyerid as "TenantId" from signingfiles where lawyerid is not null
     order by "TenantId" asc`
    );

    return (res.rows || []).map((r) => Number(r.TenantId)).filter((n) => Number.isFinite(n) && n > 0);
}

async function discoverFirms({ firmId }) {
    if (firmId) {
        const f = Number(firmId);
        if (!Number.isFinite(f) || f <= 0) throw new Error('--firm must be a positive integer');
        return [f];
    }

    const res = await pool.query(
        `select distinct firmid as "FirmId" from firm_subscriptions where status = 'active'
     union
     select distinct firmid as "FirmId" from signingfiles where firmid is not null
     order by "FirmId" asc`
    );

    return (res.rows || []).map((r) => Number(r.FirmId)).filter((n) => Number.isFinite(n) && n > 0);
}

async function tableExists(regclassName) {
    try {
        const res = await pool.query('select to_regclass($1) as r', [regclassName]);
        return Boolean(res.rows?.[0]?.r);
    } catch {
        return false;
    }
}

async function getCandidateSigningFiles({ scopeType, scopeId, cutoffIso, bufferCutoffIso, maxDocs }) {
    if (scopeType === 'firm') {
        // Robustness: include firmid NULL rows only if the lawyer is a member of this firm.
        // This allows retention cleanup to work safely even before firm backfill completes.
        const hasFirmUsers = await tableExists('public.firm_users');

        const sql = hasFirmUsers
            ? `select
        signingfileid as "SigningFileId",
        lawyerid as "LawyerId",
        status as "Status",
        createdat as "CreatedAt",
        signedat as "SignedAt",
        legalhold as "LegalHold",
        signedstoragebucket as "SignedStorageBucket",
        signedstoragekey as "SignedStorageKey",
        signedfilekey as "SignedFileKey",
        originalstoragebucket as "OriginalStorageBucket",
        originalstoragekey as "OriginalStorageKey",
        filekey as "FileKey",
        originalfilekey as "OriginalFileKey",
        pendingdeleteatutc as "PendingDeleteAtUtc",
        presentedpdfsha256 as "PresentedPdfSha256",
        signedpdfsha256 as "SignedPdfSha256"
     from signingfiles
     left join firm_users fu on fu.userid = signingfiles.lawyerid and fu.firmid = $1
         where (
           signingfiles.firmid = $1
           or (signingfiles.firmid is null and fu.firmid is not null)
         )
       and lower(status) = 'signed'
       and coalesce(legalhold, false) = false
       and pendingdeleteatutc is null
       and coalesce(signedat, createdat) < $2::timestamptz
       and (signedat is null or signedat < $3::timestamptz)
       order by coalesce(signedat, createdat) asc
       limit $4`
            : `select
        signingfileid as "SigningFileId",
        lawyerid as "LawyerId",
        status as "Status",
        createdat as "CreatedAt",
        signedat as "SignedAt",
        legalhold as "LegalHold",
        signedstoragebucket as "SignedStorageBucket",
        signedstoragekey as "SignedStorageKey",
        signedfilekey as "SignedFileKey",
        originalstoragebucket as "OriginalStorageBucket",
        originalstoragekey as "OriginalStorageKey",
        filekey as "FileKey",
        originalfilekey as "OriginalFileKey",
        pendingdeleteatutc as "PendingDeleteAtUtc",
        presentedpdfsha256 as "PresentedPdfSha256",
        signedpdfsha256 as "SignedPdfSha256"
     from signingfiles
         where firmid = $1
       and lower(status) = 'signed'
       and coalesce(legalhold, false) = false
       and pendingdeleteatutc is null
       and coalesce(signedat, createdat) < $2::timestamptz
       and (signedat is null or signedat < $3::timestamptz)
       order by coalesce(signedat, createdat) asc
       limit $4`;

        const res = await pool.query(sql, [scopeId, cutoffIso, bufferCutoffIso, maxDocs]);
        return res.rows || [];
    }

    const res = await pool.query(
        `select
        signingfileid as "SigningFileId",
        lawyerid as "LawyerId",
        status as "Status",
        createdat as "CreatedAt",
        signedat as "SignedAt",
        legalhold as "LegalHold",
        signedstoragebucket as "SignedStorageBucket",
        signedstoragekey as "SignedStorageKey",
        signedfilekey as "SignedFileKey",
        originalstoragebucket as "OriginalStorageBucket",
        originalstoragekey as "OriginalStorageKey",
        filekey as "FileKey",
        originalfilekey as "OriginalFileKey",
        pendingdeleteatutc as "PendingDeleteAtUtc",
        presentedpdfsha256 as "PresentedPdfSha256",
        signedpdfsha256 as "SignedPdfSha256"
     from signingfiles
         where lawyerid = $1
       and lower(status) = 'signed'
       and coalesce(legalhold, false) = false
       and pendingdeleteatutc is null
       and coalesce(signedat, createdat) < $2::timestamptz
       and (signedat is null or signedat < $3::timestamptz)
       order by coalesce(signedat, createdat) asc
       limit $4`,
        [scopeId, cutoffIso, bufferCutoffIso, maxDocs]
    );
    return res.rows || [];
}

async function getSignatureDataKeys(signingFileId) {
    const res = await pool.query(
        `select signaturedata as "SignatureDataKey"
     from signaturespots
     where signingfileid = $1 and signaturedata is not null`,
        [signingFileId]
    );
    return (res.rows || []).map((r) => r.SignatureDataKey).filter(Boolean);
}

async function deleteSigningFileDataTx(client, signingFileId) {
    // Allow deleting audit_events only inside this transaction.
    await client.query(`set local app.audit_events_allow_delete = 'true'`);

    // Delete child tables first.
    await client.query('delete from signing_otp_challenges where signingfileid = $1', [signingFileId]);
    await client.query('delete from signing_consents where signingfileid = $1', [signingFileId]);
    await client.query('delete from audit_events where signingfileid = $1', [signingFileId]);
    await client.query('delete from signaturespots where signingfileid = $1', [signingFileId]);

    // Finally, delete the signing file.
    await client.query('delete from signingfiles where signingfileid = $1', [signingFileId]);
}

async function recordRun({
    runId,
    tenantId,
    planKey,
    dryRun,
    startedAt,
    finishedAt,
    summary,
    deletedCounts,
    errors,
}) {
    await pool.query(
        `insert into data_retention_runs(
        run_id, tenant_id, plan_key, dry_run, started_at, finished_at, summary_json, deleted_counts_json, errors_json
     ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`,
        [
            runId,
            tenantId,
            planKey,
            dryRun,
            startedAt,
            finishedAt,
            JSON.stringify(summary || {}),
            JSON.stringify(deletedCounts || {}),
            JSON.stringify(errors || []),
        ]
    );
}

async function run(argv = process.argv) {
    const args = parseArgs(argv);
    if (args.help) {
        console.log('Usage: node scripts/retentionCleanup.js [--tenant <id>] [--firm <id>] [--dry-run|--execute] [--now <iso>] [--max-docs N] [--soft-buffer-days N]');
        console.log('Execute mode requires: RETENTION_ALLOW_DELETE=true and RETENTION_CONFIRM=DELETE');
        return;
    }

    if (!args.dryRun) requireExecuteGates();

    const now = toDateOrThrow(args.nowIso);
    const startedAt = new Date();
    const runId = randomUuid();

    const errors = [];
    const perTenantSummary = [];
    const deletedCounts = {
        tenantsProcessed: 0,
        pendingDeleteMarked: 0,
        signingFilesDeleted: 0,
        storageObjectsDeleted: 0,
        signingSpotsDeleted: 0,
        auditEventsDeleted: 0,
        consentsDeleted: 0,
        otpChallengesDeleted: 0,
    };

    /** @type {Array<{scopeType: 'tenant'|'firm', id: number}>} */
    const scopes = [];

    if (args.firm) {
        const firms = await discoverFirms({ firmId: args.firm });
        for (const id of firms) scopes.push({ scopeType: 'firm', id });
    } else if (args.tenant) {
        const tenants = await discoverTenants({ tenantId: args.tenant });
        for (const id of tenants) scopes.push({ scopeType: 'tenant', id });
    } else if (isFirmScopeEnabled()) {
        try {
            const firms = await discoverFirms({ firmId: null });
            if (firms.length > 0) {
                for (const id of firms) scopes.push({ scopeType: 'firm', id });
            } else {
                const tenants = await discoverTenants({ tenantId: null });
                for (const id of tenants) scopes.push({ scopeType: 'tenant', id });
            }
        } catch {
            const tenants = await discoverTenants({ tenantId: null });
            for (const id of tenants) scopes.push({ scopeType: 'tenant', id });
        }
    } else {
        const tenants = await discoverTenants({ tenantId: null });
        for (const id of tenants) scopes.push({ scopeType: 'tenant', id });
    }

    if (scopes.length === 0) {
        console.log('[retention] No tenants/firms found.');
    }

    for (const scope of scopes) {
        deletedCounts.tenantsProcessed += 1;

        const scopeType = scope.scopeType;
        const scopeId = scope.id;

        let policy;
        try {
            policy = scopeType === 'firm'
                ? await resolveFirmPlan(scopeId)
                : await resolveTenantPlan(scopeId);
        } catch (e) {
            errors.push({ scopeType, scopeId, stage: 'resolvePlan', message: e?.message || String(e) });
            continue;
        }

        if (!policy) {
            errors.push({ scopeType, scopeId, stage: 'resolvePlan', message: 'No policy found' });
            continue;
        }

        const retentionDays = policy.effectiveDocumentsRetentionDaysPii;
        const cutoff = subtractDays(now, retentionDays);
        const cutoffIso = cutoff.toISOString();

        const softBufferDays = Number.parseInt(String(args.softBufferDays ?? process.env.RETENTION_SOFT_BUFFER_DAYS ?? '7'), 10);
        const bufferDays = Number.isFinite(softBufferDays) && softBufferDays >= 0 ? softBufferDays : 7;
        const bufferCutoffIso = subtractDays(now, bufferDays).toISOString();

        const maxDocs = (() => {
            const n = Number(args.maxDocs ?? process.env.RETENTION_MAX_DOCS ?? '500');
            if (!Number.isFinite(n) || n <= 0) return 500;
            return Math.floor(n);
        })();

        const candidates = await getCandidateSigningFiles({ scopeType, scopeId, cutoffIso, bufferCutoffIso, maxDocs });

        const tenantInfo = {
            scopeType,
            scopeId,
            planKey: policy.planKey,
            documentsRetentionDaysPii: retentionDays,
            softBufferDays: bufferDays,
            maxDocs,
            cutoffUtc: cutoffIso,
            candidateCount: candidates.length,
            sampleSigningFileIds: candidates.slice(0, 20).map((r) => r.SigningFileId),
        };

        if (args.dryRun) {
            // Dry-run: do not delete anything.
            perTenantSummary.push(tenantInfo);
            continue;
        }

        let tenantStorageDeletes = 0;
        let tenantFilesDeleted = 0;
        let tenantPendingMarked = 0;

        for (const row of candidates) {
            const signingFileId = Number(row.SigningFileId);
            if (!Number.isFinite(signingFileId) || signingFileId <= 0) continue;

            // Guardrail: do NOT delete if critical evidence is missing.
            const missing = [];
            if (!row.SignedStorageKey && !row.SignedFileKey) missing.push('signed_storage_key');
            if (!row.PresentedPdfSha256) missing.push('presented_pdf_sha256');
            if (!row.SignedPdfSha256) missing.push('signed_pdf_sha256');
            if (missing.length > 0) {
                errors.push({ scopeType, scopeId, signingFileId, stage: 'guardrail', message: 'Missing critical evidence; skip deletion', missing });
                continue;
            }

            // Phase 1: mark pending delete (two-phase). Keep marker if anything fails later.
            const markRes = await pool.query(
                `update signingfiles
         set pendingdeleteatutc = now(),
             pendingdeletereason = $2
         where signingfileid = $1
           and lower(status) = 'signed'
           and coalesce(legalhold, false) = false
           and pendingdeleteatutc is null
         returning signingfileid`,
                [signingFileId, `retention_cleanup_run:${runId}`]
            );
            if (markRes.rowCount === 0) {
                errors.push({ scopeType, scopeId, signingFileId, stage: 'markPending', message: 'Could not mark pending delete (already pending or not eligible)' });
                continue;
            }
            tenantPendingMarked += 1;

            const signatureDataKeys = await getSignatureDataKeys(signingFileId);

            const storageTargets = [
                { bucket: row.SignedStorageBucket, key: row.SignedStorageKey },
                { bucket: row.SignedStorageBucket, key: row.SignedFileKey },
                { bucket: row.OriginalStorageBucket, key: row.OriginalStorageKey },
                { bucket: null, key: row.FileKey },
                { bucket: null, key: row.OriginalFileKey },
                ...signatureDataKeys.map((k) => ({ bucket: null, key: k })),
            ].filter((t) => Boolean(t.key));

            // 1) Delete storage objects first. If any fail, skip DB deletion.
            let storageOk = true;
            for (const target of storageTargets) {
                const result = await deleteObjectSafe(target);
                if (!result.ok) {
                    storageOk = false;
                    errors.push({
                        scopeType,
                        scopeId,
                        signingFileId,
                        stage: 'storageDelete',
                        message: result.error?.message || String(result.error),
                    });
                    break;
                }
                if (!result.skipped) tenantStorageDeletes += 1;
            }
            if (!storageOk) continue;

            // 2) Delete DB rows in a transaction.
            const client = await pool.connect();
            try {
                await client.query('begin');

                // Pre-count for reporting
                const counts = await client.query(
                    `select
              (select count(*) from signaturespots where signingfileid = $1) as spots,
              (select count(*) from audit_events where signingfileid = $1) as events,
              (select count(*) from signing_consents where signingfileid = $1) as consents,
              (select count(*) from signing_otp_challenges where signingfileid = $1) as otps`,
                    [signingFileId]
                );
                const c = counts.rows?.[0] || {};

                await deleteSigningFileDataTx(client, signingFileId);

                await client.query('commit');
                tenantFilesDeleted += 1;

                deletedCounts.signingSpotsDeleted += Number(c.spots || 0);
                deletedCounts.auditEventsDeleted += Number(c.events || 0);
                deletedCounts.consentsDeleted += Number(c.consents || 0);
                deletedCounts.otpChallengesDeleted += Number(c.otps || 0);
            } catch (e) {
                try { await client.query('rollback'); } catch { /* ignore */ }
                errors.push({ scopeType, scopeId, signingFileId, stage: 'dbDelete', message: e?.message || String(e) });
            } finally {
                client.release();
            }
        }

        deletedCounts.signingFilesDeleted += tenantFilesDeleted;
        deletedCounts.pendingDeleteMarked += tenantPendingMarked;
        deletedCounts.storageObjectsDeleted += tenantStorageDeletes;

        perTenantSummary.push({
            ...tenantInfo,
            markedPendingDelete: tenantPendingMarked,
            deletedSigningFiles: tenantFilesDeleted,
            deletedStorageObjects: tenantStorageDeletes,
        });
    }

    const finishedAt = new Date();
    const summary = {
        runId,
        dryRun: args.dryRun,
        nowUtc: now.toISOString(),
        scopeCount: scopes.length,
        perTenant: perTenantSummary,
        note: 'Eligibility: status=signed, legalhold=false, pendingdeleteatutc is null, signed_at older than soft buffer, coalesce(signedat, createdat) < cutoff',
        storageKeysLogged: false,
    };

    // Best-effort: always write a data_retention_runs record.
    try {
        // In dry-run, planKey is per-tenant; at run level we store null when running multi-tenant.
        const runScopeId = args.firm ? Number(args.firm) : (args.tenant ? Number(args.tenant) : null);
        const runPlanKey = (runScopeId && perTenantSummary.length === 1) ? perTenantSummary[0].planKey : null;

        await recordRun({
            runId,
            tenantId: runScopeId,
            planKey: runPlanKey,
            dryRun: args.dryRun,
            startedAt,
            finishedAt,
            summary,
            deletedCounts: args.dryRun ? {} : deletedCounts,
            errors,
        });
    } catch (e) {
        console.error('[retention] Failed to write data_retention_runs:', e?.message || e);
    }

    console.log(JSON.stringify({ summary, deletedCounts: args.dryRun ? null : deletedCounts, errors }, null, 2));
    if (!args.dryRun && errors.length > 0) process.exitCode = 2;
}

module.exports = { run };

if (require.main === module) {
    run().catch((e) => {
        console.error('[retention] Fatal:', e?.stack || e);
        process.exit(1);
    });
}
