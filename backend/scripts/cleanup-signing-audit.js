#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Cleanup all signing files, audit events, and R2 storage from production.
 * 
 * What it does:
 *   1. Lists ALL objects in the R2 bucket and deletes them
 *   2. TRUNCATEs audit_events, signing_otp_challenges, signing_consents,
 *      signaturespots, signing_retention_warnings, firm_signing_policy, signingfiles
 *
 * Usage:
 *   node scripts/cleanup-signing-audit.js --dry-run     (default, preview only)
 *   node scripts/cleanup-signing-audit.js --execute      (actually delete)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../config/db');
const { r2, BUCKET } = require('../utils/r2');
const { DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const DRY_RUN = !process.argv.includes('--execute');

async function listAllR2Keys() {
    const keys = [];
    let continuationToken = undefined;

    do {
        const cmd = new ListObjectsV2Command({
            Bucket: BUCKET,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
        });
        const resp = await r2.send(cmd);
        if (resp.Contents) {
            for (const obj of resp.Contents) {
                keys.push(obj.Key);
            }
        }
        continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
}

async function deleteR2Keys(keys) {
    let deleted = 0;
    let failed = 0;

    for (const key of keys) {
        try {
            if (DRY_RUN) {
                console.log(`  [dry-run] Would delete R2: ${key}`);
            } else {
                await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
                console.log(`  Deleted R2: ${key}`);
            }
            deleted++;
        } catch (err) {
            if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
                console.log(`  Skipped (not found): ${key}`);
                deleted++;
            } else {
                console.error(`  FAILED R2 delete: ${key} — ${err.message}`);
                failed++;
            }
        }
    }

    return { deleted, failed };
}

async function truncateTables(client) {
    const tables = [
        'audit_events',
        'signing_otp_challenges',
        'signing_consents',
        'signaturespots',
        'signing_retention_warnings',
        'firm_signing_policy',
        'signingfiles',
    ];

    if (DRY_RUN) {
        console.log(`\n[dry-run] Would TRUNCATE: ${tables.join(', ')}`);
        return;
    }

    for (const t of tables) {
        const sql = `TRUNCATE TABLE IF EXISTS public.${t} CASCADE;`;
        console.log(`Running: ${sql}`);
        await client.query(sql);
    }
    console.log('Tables truncated successfully.');
}

async function main() {
    console.log(`\n=== Signing & Audit Cleanup ===`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'EXECUTE (real delete!)'}`);
    console.log(`Bucket: ${BUCKET}\n`);

    let client;
    try {
        client = await pool.connect();

        // Count rows before cleanup
        const tables = ['signingfiles', 'signaturespots', 'signing_consents', 'signing_otp_challenges', 'audit_events', 'signing_retention_warnings', 'firm_signing_policy'];
        const counts = {};
        for (const t of tables) {
            try {
                const { rows } = await client.query(`SELECT COUNT(*)::int AS cnt FROM ${t}`);
                counts[t] = rows[0].cnt;
            } catch {
                counts[t] = '(table not found)';
            }
        }
        console.log('Current row counts:');
        for (const [table, count] of Object.entries(counts)) {
            console.log(`  ${table}: ${count}`);
        }

        // List ALL objects in R2 bucket
        console.log('\nListing all R2 objects...');
        const keys = await listAllR2Keys();
        console.log(`R2 objects to delete: ${keys.length}`);

        // Group by prefix for summary
        const prefixes = {};
        for (const k of keys) {
            const prefix = k.split('/')[0] || '(root)';
            prefixes[prefix] = (prefixes[prefix] || 0) + 1;
        }
        console.log('By prefix:');
        for (const [prefix, count] of Object.entries(prefixes)) {
            console.log(`  ${prefix}/: ${count}`);
        }

        // Delete from R2
        if (keys.length > 0) {
            const { deleted, failed } = await deleteR2Keys(keys);
            console.log(`R2 summary: ${deleted} deleted, ${failed} failed`);
            if (failed > 0 && !DRY_RUN) {
                console.error('WARNING: Some R2 deletes failed. Continuing with DB cleanup...');
            }
        }

        // Truncate tables
        await truncateTables(client);

        console.log('\n=== Done ===\n');
    } catch (err) {
        console.error('FATAL:', err);
        process.exit(1);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main();
