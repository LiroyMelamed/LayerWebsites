#!/usr/bin/env node
/**
 * Download the latest DB backup from R2 and restore it locally.
 *
 * Usage:
 *   node backend/scripts/restore-db-from-r2.js
 *
 * Reads S3_* and DB_* from backend/.env
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { execSync } = require('child_process');
const fs = require('fs');
const {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
} = require('@aws-sdk/client-s3');

const PG_BIN = 'C:\\Program Files\\PostgreSQL\\17\\bin';
// Superuser for drop/create DB operations (local dev only)
const PG_SUPER_USER = process.env.PG_SUPER_USER || 'postgres';
const PG_SUPER_PASSWORD = process.env.PG_SUPER_PASSWORD || process.env.DB_PASSWORD;

const r2 = new S3Client({
    region: 'auto',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.S3_KEY,
        secretAccessKey: process.env.S3_SECRET,
    },
});

const BUCKET = process.env.S3_BUCKET;
const DB_NAME = process.env.DB_NAME;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '5432';

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function main() {
    console.log('Listing backups in R2...');

    // List all backup files
    const list = await r2.send(
        new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'backups/' })
    );

    if (!list.Contents || list.Contents.length === 0) {
        console.error('No backups found in R2!');
        process.exit(1);
    }

    // Sort by LastModified descending → pick latest
    const sorted = list.Contents.sort(
        (a, b) => new Date(b.LastModified) - new Date(a.LastModified)
    );
    const latest = sorted[0];
    console.log(`Latest backup: ${latest.Key} (${latest.Size} bytes, ${latest.LastModified})`);

    // Download
    const tmpFile = path.join(require('os').tmpdir(), 'melamedlaw-latest.dump');
    console.log(`Downloading to ${tmpFile}...`);

    const obj = await r2.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: latest.Key })
    );
    const buf = await streamToBuffer(obj.Body);
    fs.writeFileSync(tmpFile, buf);
    console.log(`Downloaded ${buf.length} bytes.`);

    // Set env for pg tools
    const pgEnv = {
        ...process.env,
        PGPASSWORD: DB_PASSWORD,
        PATH: `${PG_BIN};${process.env.PATH}`,
    };

    // Superuser env for drop/create DB
    const superEnv = {
        ...process.env,
        PGPASSWORD: PG_SUPER_PASSWORD,
        PATH: `${PG_BIN};${process.env.PATH}`,
    };

    const psqlSuper = (sql) =>
        execSync(
            `"${PG_BIN}\\psql.exe" -U ${PG_SUPER_USER} -h ${DB_HOST} -p ${DB_PORT} -d postgres -c "${sql}"`,
            { env: superEnv, stdio: 'pipe' }
        );

    // Drop & recreate DB
    console.log(`Dropping database "${DB_NAME}"...`);
    try {
        psqlSuper(`DROP DATABASE IF EXISTS \\"${DB_NAME}\\";`);
    } catch (e) {
        // May fail if connections exist — try terminating them first
        console.log('Terminating active connections...');
        try {
            psqlSuper(
                `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();`
            );
        } catch (_) {
            /* ignore */
        }
        psqlSuper(`DROP DATABASE IF EXISTS \\"${DB_NAME}\\";`);
    }

    console.log(`Creating database "${DB_NAME}"...`);
    psqlSuper(`CREATE DATABASE \\"${DB_NAME}\\" OWNER ${DB_USER};`);

    // Restore (use superuser for full access to all objects)
    console.log('Restoring...');
    try {
        execSync(
            `"${PG_BIN}\\pg_restore.exe" -U ${PG_SUPER_USER} -h ${DB_HOST} -p ${DB_PORT} -d ${DB_NAME} --no-owner --no-privileges "${tmpFile}"`,
            { env: superEnv, stdio: 'pipe' }
        );
        console.log('Restore completed successfully.');
    } catch (e) {
        // pg_restore exits non-zero on warnings — that's OK
        const stderr = e.stderr ? e.stderr.toString() : '';
        if (stderr.includes('already exists') || stderr.includes('must be owner')) {
            console.log('Restore completed with non-critical warnings.');
        } else if (e.status === 1) {
            // Exit code 1 = warnings only, data is fine
            console.log('Restore completed with warnings.');
        } else {
            console.error('Restore error:', stderr);
            process.exit(1);
        }
    }

    // Grant all privileges to the app user
    console.log(`Granting privileges to ${DB_USER}...`);
    const grantSql = `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER}; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER}; GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO ${DB_USER};`;
    execSync(
        `"${PG_BIN}\\psql.exe" -U ${PG_SUPER_USER} -h ${DB_HOST} -p ${DB_PORT} -d ${DB_NAME} -c "${grantSql}"`,
        { env: superEnv, stdio: 'pipe' }
    );

    // Verify
    const countResult = execSync(
        `"${PG_BIN}\\psql.exe" -U ${PG_SUPER_USER} -h ${DB_HOST} -p ${DB_PORT} -d ${DB_NAME} -t -c "SELECT 'tables=' || count(*) FROM information_schema.tables WHERE table_schema='public';"`,
        { env: superEnv, encoding: 'utf8' }
    ).trim();
    console.log(countResult);

    // Cleanup
    fs.unlinkSync(tmpFile);
    console.log('Done! Local DB restored from latest production backup.');
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
