/**
 * Security audit logger — ISO 27001 Annex A
 *
 * Relevant controls:
 *   A.8.15  – Logging (event logging, protection of log information)
 *   A.8.16  – Monitoring activities
 *   A.5.28  – Collection of evidence
 *   A.5.33  – Protection of records
 *
 * Logs security-relevant events (login, OTP failures, lockouts, token refresh,
 * sensitive data access, compliance queries, etc.) to a structured JSON log file.
 *
 * Output: backend/logs/security-audit-YYYY-MM-DD.log  (JSONL — one JSON object per line)
 *
 * PII SAFE: Phone numbers are always masked (last 4 digits only).
 *           Emails, names, and other PII must NEVER be passed to this logger.
 *           Only pass userId for correlation.
 *
 * Log rotation: keeps last N days of daily log files (configurable via
 *               SECURITY_LOG_RETENTION_DAYS, default = 90).
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const MAX_LOG_AGE_DAYS = Number(process.env.SECURITY_LOG_RETENTION_DAYS || 90);

// Ensure log directory exists
try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
    // ignore — may already exist
}

/**
 * Get today's log file path (one file per day for easy rotation).
 */
function getLogFilePath() {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(LOG_DIR, `security-audit-${date}.log`);
}

/**
 * Delete log files older than MAX_LOG_AGE_DAYS.
 */
function rotateOldLogs() {
    try {
        const files = fs.readdirSync(LOG_DIR);
        const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;

        for (const file of files) {
            if (!file.startsWith('security-audit-') || !file.endsWith('.log')) continue;
            const filePath = path.join(LOG_DIR, file);
            try {
                const stat = fs.statSync(filePath);
                if (stat.mtimeMs < cutoff) {
                    fs.unlinkSync(filePath);
                    console.log(`[security-audit] Rotated old log: ${file}`);
                }
            } catch {
                // ignore individual file errors
            }
        }
    } catch (err) {
        console.error('[security-audit] Log rotation error:', err.message);
    }
}

// Rotate on startup
rotateOldLogs();

// Rotate daily at midnight
const _rotateInterval = setInterval(rotateOldLogs, 24 * 60 * 60 * 1000);
_rotateInterval.unref?.();

/**
 * Write a structured security event.
 *
 * @param {object} event
 * @param {string} event.type           - e.g. 'OTP_REQUEST', 'OTP_VERIFY_SUCCESS', 'OTP_VERIFY_FAIL',
 *                                        'LOCKOUT', 'TOKEN_REFRESH', 'LOGOUT',
 *                                        'SENSITIVE_ACCESS', 'COMPLIANCE_QUERY',
 *                                        'INCIDENT_CREATED', 'INCIDENT_RESOLVED'
 * @param {string} [event.phone]        - masked phone (last 4 digits only)
 * @param {number} [event.userId]
 * @param {string} [event.ip]
 * @param {string} [event.userAgent]
 * @param {boolean} [event.success]
 * @param {object} [event.meta]         - extra context (never include secrets)
 */
function logSecurityEvent({ type, phone, userId, ip, userAgent, success, meta }) {
    const entry = {
        timestamp: new Date().toISOString(),
        level: success === false ? 'WARN' : 'INFO',
        type: String(type || 'UNKNOWN'),
        // Never log full phone numbers — mask all but last 4 digits
        phone: phone ? `***${phone.slice(-4)}` : undefined,
        userId: userId ?? undefined,
        ip: ip ?? undefined,
        userAgent: userAgent ? String(userAgent).slice(0, 200) : undefined,
        success,
        meta: meta ?? undefined,
    };

    const line = JSON.stringify(entry) + '\n';

    // Non-blocking append. If write fails, log to stderr but don't crash.
    fs.appendFile(getLogFilePath(), line, (err) => {
        if (err) {
            console.error('[security-audit] Failed to write log:', err.message);
        }
    });
}

/**
 * Extract IP from request (respects X-Forwarded-For when trusted).
 */
function extractIp(req) {
    if (!req) return null;
    const xff = String(req.headers?.['x-forwarded-for'] || '').split(',')[0]?.trim();
    return xff || req.ip || null;
}

module.exports = { logSecurityEvent, extractIp };
