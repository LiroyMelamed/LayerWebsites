#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Cleanup all signing files and audit events from production.
 * 
 * What it does:
 *   1. Reads all R2 keys from signingfiles (filekey, originalfilekey, signedfilekey)
 *   2. Reads all saved-signature keys from signaturespots (signeruserid → saved-signatures/user-N.png)
 *   3. Deletes all those objects from R2
 *   4. TRUNCATEs audit_events, signing_otp_challenges, signing_consents,
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
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

const DRY_RUN = !process.argv.includes('--execute');

async function collectR2Keys(client) {
    const keys = new Set();

    // All file keys from signingfiles
    const { rows: fileRows } = await client.query(`
        SELECT filekey, originalfilekey, signedfilekey
        FROM signingfiles
    `);

    for (const row of fileRows) {
        if (row.filekey) keys.add(row.filekey);
        if (row.originalfilekey) keys.add(row.originalfilekey);
        if (row.signedfilekey) keys.add(row.signedfilekey);
    }

    // Saved signatures: each unique signer user → saved-signatures/user-N.png
    const { rows: spotRows } = await client.query(`
        SELECT DISTINCT signeruserid FROM signaturespots WHERE signeruserid IS NOT NULL
    `);
    for (const row of spotRows) {
        keys.add(`saved-signatures/user-${row.signeruserid}.png`);
    }

    return [...keys].filter(Boolean);
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
            // NoSuchKey is fine (already deleted), anything else is a warning
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

    const sql = `TRUNCATE TABLE ${tables.map(t => `public.${t}`).join(', ')} CASCADE;`;
    console.log(`\nRunning: ${sql}`);
    await client.query(sql);
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
        const counts = {};
        for (const t of ['signingfiles', 'signaturespots', 'signing_consents', 'signing_otp_challenges', 'audit_events', 'signing_retention_warnings', 'firm_signing_policy']) {
            const { rows } = await client.query(`SELECT COUNT(*)::int AS cnt FROM ${t}`);
            counts[t] = rows[0].cnt;
        }
        console.log('Current row counts:');
        for (const [table, count] of Object.entries(counts)) {
            console.log(`  ${table}: ${count}`);
        }

        // Collect R2 keys
        const keys = await collectR2Keys(client);
        console.log(`\nR2 objects to delete: ${keys.length}`);

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
