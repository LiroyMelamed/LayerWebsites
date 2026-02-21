/**
 * File scanning utility — ISO 27001 A.12.2.1 (Controls against malware)
 *
 * Scans uploaded files for malware using ClamAV daemon (clamd).
 * This is called after a file has been uploaded to R2 via presigned URL.
 *
 * Prerequisites on the production server:
 *   sudo apt install clamav clamav-daemon -y
 *   sudo freshclam
 *   sudo systemctl enable clamav-daemon
 *   sudo systemctl start clamav-daemon
 *
 * npm install clamscan   (in backend/)
 *
 * If ClamAV is not installed, scanning is skipped with a warning (non-blocking).
 */

const { logSecurityEvent } = require('./securityAuditLogger');

let clamInstance = null;
let clamAvailable = false;
let initAttempted = false;

/**
 * Lazily initialize the ClamAV client.
 * Returns null if ClamAV is not installed / daemon not running.
 */
async function getClamClient() {
    if (initAttempted) return clamInstance;
    initAttempted = true;

    try {
        const NodeClam = require('clamscan');
        clamInstance = await new NodeClam().init({
            removeInfected: false,
            debugMode: false,
            scanRecursively: false,
            clamdscan: {
                socket: process.env.CLAMAV_SOCKET || '/var/run/clamav/clamd.ctl',
                host: process.env.CLAMAV_HOST || null,
                port: process.env.CLAMAV_PORT ? Number(process.env.CLAMAV_PORT) : null,
                timeout: Number(process.env.CLAMAV_TIMEOUT_MS || 30000),
                active: true,
            },
            preference: 'clamdscan',
        });
        clamAvailable = true;
        console.log('[clamav] ClamAV daemon connected successfully');
    } catch (err) {
        console.warn('[clamav] ClamAV not available — file scanning disabled:', err.message);
        clamInstance = null;
        clamAvailable = false;
    }
    return clamInstance;
}

/**
 * Scan a file on disk.
 *
 * @param {string} filePath - absolute path to the file to scan
 * @param {object} [context] - optional metadata for audit logging (userId, ip, fileName)
 * @returns {{ safe: boolean, virus?: string, skipped?: boolean }}
 */
async function scanFile(filePath, context = {}) {
    const clam = await getClamClient();
    if (!clam) {
        // ClamAV not installed — skip but log
        logSecurityEvent({
            type: 'FILE_SCAN_SKIPPED',
            userId: context.userId,
            ip: context.ip,
            success: true,
            meta: { reason: 'clamav_unavailable', fileName: context.fileName },
        });
        return { safe: true, skipped: true };
    }

    try {
        const { isInfected, viruses } = await clam.isInfected(filePath);

        if (isInfected) {
            const virusName = (viruses || []).join(', ') || 'Unknown';
            logSecurityEvent({
                type: 'FILE_SCAN_INFECTED',
                userId: context.userId,
                ip: context.ip,
                success: false,
                meta: { fileName: context.fileName, virus: virusName },
            });
            console.error(`[clamav] INFECTED FILE DETECTED: ${virusName} — ${context.fileName}`);
            return { safe: false, virus: virusName };
        }

        logSecurityEvent({
            type: 'FILE_SCAN_CLEAN',
            userId: context.userId,
            ip: context.ip,
            success: true,
            meta: { fileName: context.fileName },
        });
        return { safe: true };
    } catch (err) {
        console.error('[clamav] Scan error:', err.message);
        logSecurityEvent({
            type: 'FILE_SCAN_ERROR',
            userId: context.userId,
            ip: context.ip,
            success: false,
            meta: { fileName: context.fileName, error: err.message },
        });
        // Fail-open in development, fail-closed in production
        const failClosed = process.env.IS_PRODUCTION === 'true';
        return { safe: !failClosed, skipped: !failClosed, error: err.message };
    }
}

/**
 * Scan a buffer (writes to temp file, scans, deletes).
 *
 * @param {Buffer} buffer
 * @param {object} [context]
 * @returns {{ safe: boolean, virus?: string, skipped?: boolean }}
 */
async function scanBuffer(buffer, context = {}) {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmpFile = path.join(os.tmpdir(), `clamscan-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    try {
        fs.writeFileSync(tmpFile, buffer);
        return await scanFile(tmpFile, context);
    } finally {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
}

module.exports = { scanFile, scanBuffer, getClamClient };
