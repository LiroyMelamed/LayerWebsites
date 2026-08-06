#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Read-only storage measurement for a single tenant.
 *
 * Reports the TRUE storage footprint of this tenant:
 *   - R2 bucket usage broken down by top-level key prefix (summing object sizes).
 *     `db-backups/` and `backups/` prefixes are reported separately and EXCLUDED
 *     from the customer total (they are DB dumps, not customer storage).
 *   - DB-tracked file-byte sums: signingfiles (unsigned+signed), stage_files,
 *     template_attachments.
 *   - Informational in-DB text sizes: knowledge_chunks, chatbot_messages.
 *
 * Makes NO writes/deletes. Reuses the tenant's own .env (DB + R2 bucket).
 *
 * Usage:  cd <tenant>/backend && node scripts/measure-storage.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../config/db');
const { r2, BUCKET } = require('../utils/r2');
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

const BACKUP_PREFIXES = new Set(['db-backups', 'backups']);

function mb(bytes) {
    return (Number(bytes || 0) / (1024 * 1024)).toFixed(2);
}

function isRelationMissingError(e) {
    return String(e?.message || '').includes('does not exist');
}

// Sum one scalar-bytes query, tolerating a missing table.
async function sumQuery(sql) {
    try {
        const res = await pool.query(sql);
        return res.rows?.[0] || {};
    } catch (e) {
        if (isRelationMissingError(e)) return { __missing: true };
        throw e;
    }
}

async function measureR2ByPrefix() {
    const byPrefix = {}; // top-level prefix -> { bytes, count }
    let continuationToken;

    do {
        const resp = await r2.send(new ListObjectsV2Command({
            Bucket: BUCKET,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
        }));
        for (const obj of resp.Contents || []) {
            const top = String(obj.Key || '').split('/')[0] || '(root)';
            if (!byPrefix[top]) byPrefix[top] = { bytes: 0, count: 0 };
            byPrefix[top].bytes += Number(obj.Size || 0);
            byPrefix[top].count += 1;
        }
        continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);

    return byPrefix;
}

async function main() {
    const dbNameRes = await pool.query('select current_database() as db');
    const dbName = dbNameRes.rows?.[0]?.db || '(unknown)';

    console.log(`\n================ STORAGE MEASUREMENT: ${dbName} (bucket: ${BUCKET}) ================`);

    // --- R2 ---
    let byPrefix = {};
    let r2Error = null;
    try {
        byPrefix = await measureR2ByPrefix();
    } catch (e) {
        r2Error = e.message;
    }

    let customerR2 = 0;
    let backupR2 = 0;
    console.log('\n-- R2 by prefix --');
    if (r2Error) {
        console.log(`  (R2 listing failed: ${r2Error})`);
    } else {
        const prefixes = Object.keys(byPrefix).sort((a, b) => byPrefix[b].bytes - byPrefix[a].bytes);
        for (const p of prefixes) {
            const { bytes, count } = byPrefix[p];
            const tag = BACKUP_PREFIXES.has(p) ? '  [backup — excluded]' : '';
            console.log(`  ${p.padEnd(22)} ${String(count).padStart(7)} objs   ${mb(bytes).padStart(10)} MB${tag}`);
            if (BACKUP_PREFIXES.has(p)) backupR2 += bytes; else customerR2 += bytes;
        }
        if (!prefixes.length) console.log('  (bucket empty)');
    }

    // --- DB-tracked file sizes ---
    const signing = await sumQuery(
        `select coalesce(sum(coalesce(unsignedpdfbytes,0)+coalesce(signedpdfbytes,0)),0)::bigint as bytes,
                count(*)::int as n
         from signingfiles where pendingdeleteatutc is null`
    );
    const stage = await sumQuery(
        `select coalesce(sum(coalesce(file_size,0)),0)::bigint as bytes,
                count(*)::int as n,
                count(*) filter (where file_size is null)::int as null_sizes
         from stage_files`
    );
    const template = await sumQuery(
        `select coalesce(sum(coalesce(file_size,0)),0)::bigint as bytes, count(*)::int as n
         from template_attachments`
    );
    const knowledge = await sumQuery(
        `select coalesce(sum(octet_length(content)),0)::bigint as bytes from knowledge_chunks`
    );
    const chatbot = await sumQuery(
        `select coalesce(sum(octet_length(coalesce(message,'')) + octet_length(coalesce(response,''))),0)::bigint as bytes
         from chatbot_messages`
    );

    const dbSigning = Number(signing.bytes || 0);
    const dbStage = Number(stage.bytes || 0);
    const dbTemplate = Number(template.bytes || 0);
    const dbTrackedTotal = dbSigning + dbStage + dbTemplate;

    console.log('\n-- DB-tracked file bytes (enforcement candidates) --');
    console.log(`  signingfiles        ${mb(dbSigning).padStart(10)} MB  (${signing.n || 0} files)`);
    console.log(`  stage_files         ${mb(dbStage).padStart(10)} MB  (${stage.n || 0} files, ${stage.null_sizes || 0} with NULL size)`);
    console.log(`  template_attachments${mb(dbTemplate).padStart(10)} MB  (${template.n || 0} files)`);
    console.log(`  DB-TRACKED TOTAL    ${mb(dbTrackedTotal).padStart(10)} MB`);

    console.log('\n-- In-DB text (informational, not R2) --');
    console.log(`  knowledge_chunks    ${mb(knowledge.bytes).padStart(10)} MB`);
    console.log(`  chatbot_messages    ${mb(chatbot.bytes).padStart(10)} MB`);

    console.log('\n-- Headline --');
    console.log(`  customer R2 total   ${mb(customerR2).padStart(10)} MB   (true footprint, backups excluded)`);
    console.log(`  backups in bucket   ${mb(backupR2).padStart(10)} MB   (excluded)`);
    console.log(`  DB-tracked total    ${mb(dbTrackedTotal).padStart(10)} MB   (what enforcement will count)`);

    console.log(`\nRESULT ${dbName}: customerR2=${mb(customerR2)} dbTracked=${mb(dbTrackedTotal)} dbSigning=${mb(dbSigning)} dbStage=${mb(dbStage)} dbTemplate=${mb(dbTemplate)}`);
}

main()
    .catch((e) => { console.error('measure-storage failed:', e.message); process.exitCode = 1; })
    .finally(() => pool.end().catch(() => {}).finally(() => process.exit(process.exitCode || 0)));
