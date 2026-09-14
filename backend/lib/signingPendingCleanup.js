'use strict';

/**
 * Auto-delete signing files stuck in pending status for too long.
 * Cancels auto-reminders, removes R2 objects, then deletes DB rows.
 */

const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const pool = require('../config/db');
const { r2, BUCKET } = require('../utils/r2');
const { cancelRemindersForFile } = require('./signingFileReminders');
const { invalidateOperationalDashboardCaches } = require('../utils/operationalDashboardCache');

const PENDING_SIGNING_AUTO_DELETE_DAYS = 30;

async function deleteSigningFileStorage(keys) {
    for (const key of keys) {
        if (!key) continue;
        try {
            await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
        } catch (err) {
            console.warn(`[signing-pending-cleanup] R2 delete failed ${key}:`, err?.message || err);
        }
    }
}

async function deleteSigningFileRow(client, signingFileId) {
    await client.query("SET LOCAL app.audit_events_allow_delete = 'true'");
    await client.query('DELETE FROM signaturespots WHERE signingfileid = $1', [signingFileId]);
    await client.query('DELETE FROM signingfiles WHERE signingfileid = $1', [signingFileId]);
}

async function findStalePendingSigningFiles(limit = 50) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
    const { rows } = await pool.query(
        `SELECT signingfileid AS "SigningFileId",
                filekey AS "FileKey",
                originalfilekey AS "OriginalFileKey",
                signedfilekey AS "SignedFileKey",
                createdat AS "CreatedAt"
         FROM signingfiles
         WHERE LOWER(status) = 'pending'
           AND createdat < NOW() - ($1::int * INTERVAL '1 day')
         ORDER BY createdat ASC
         LIMIT $2`,
        [PENDING_SIGNING_AUTO_DELETE_DAYS, safeLimit]
    );
    return rows;
}

/**
 * @param {{ limit?: number, dryRun?: boolean }} opts
 * @returns {Promise<{ deleted: number, scanned: number, dryRun: boolean, errors: Array<{ signingFileId: number, message: string }> }>}
 */
async function purgeStalePendingSigningFiles(opts = {}) {
    const limit = opts.limit ?? 50;
    const dryRun = opts.dryRun === true;
    const rows = await findStalePendingSigningFiles(limit);
    if (!rows.length) {
        return { deleted: 0, dryRun, scanned: 0, errors: [] };
    }

    let deleted = 0;
    const errors = [];

    for (const file of rows) {
        const id = file.SigningFileId;
        if (dryRun) {
            deleted += 1;
            continue;
        }
        try {
            await cancelRemindersForFile(id);
            const keys = [file.FileKey, file.OriginalFileKey, file.SignedFileKey].filter(Boolean);
            await deleteSigningFileStorage(keys);

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await deleteSigningFileRow(client, id);
                await client.query('COMMIT');
                deleted += 1;
            } catch (txErr) {
                await client.query('ROLLBACK');
                throw txErr;
            } finally {
                client.release();
            }
        } catch (err) {
            errors.push({
                signingFileId: id,
                message: err?.message || String(err),
            });
        }
    }

    if (deleted > 0 && !dryRun) {
        invalidateOperationalDashboardCaches();
    }

    return { deleted, dryRun, scanned: rows.length, errors };
}

module.exports = {
    PENDING_SIGNING_AUTO_DELETE_DAYS,
    findStalePendingSigningFiles,
    purgeStalePendingSigningFiles,
};
