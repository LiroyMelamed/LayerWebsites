/**
 * Syslog / Papertrail log forwarding — ISO 27001 A.12.4.1
 *
 * Forwards security audit logs to a remote syslog endpoint (e.g., Papertrail, Datadog, rsyslog).
 *
 * Setup:
 * 1. Sign up at https://papertrailapp.com (free tier: 50MB/day)
 * 2. Create a "Log Destination" — you'll get a host + port (e.g., logs5.papertrailapp.com:12345)
 * 3. Set in .env:
 *      SYSLOG_HOST=logs5.papertrailapp.com
 *      SYSLOG_PORT=12345
 *      SYSLOG_PROTOCOL=tls   (use 'udp' for development)
 *
 * This module watches the security-audit.log file and forwards new lines via syslog.
 * It also overrides console.error / console.warn to forward those too.
 */

const dgram = require('dgram');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SYSLOG_HOST = process.env.SYSLOG_HOST || '';
const SYSLOG_PORT = Number(process.env.SYSLOG_PORT || 0);
const SYSLOG_PROTOCOL = String(process.env.SYSLOG_PROTOCOL || 'udp').toLowerCase();
const APP_NAME = String(process.env.SYSLOG_APP_NAME || 'melamedlaw');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'security-audit.log');

let _enabled = false;
let _udpClient = null;
let _tlsSocket = null;

/**
 * Send a syslog message (RFC 5424 simplified).
 */
function sendSyslog(message, severity = 6 /* informational */) {
    if (!_enabled) return;

    const facility = 1; // user-level
    const priority = facility * 8 + severity;
    const timestamp = new Date().toISOString();
    const hostname = os.hostname();
    const syslogLine = `<${priority}>1 ${timestamp} ${hostname} ${APP_NAME} ${process.pid} - - ${message}`;

    if (SYSLOG_PROTOCOL === 'tls' && _tlsSocket && !_tlsSocket.destroyed) {
        _tlsSocket.write(syslogLine + '\n');
    } else if (_udpClient) {
        const buf = Buffer.from(syslogLine);
        _udpClient.send(buf, 0, buf.length, SYSLOG_PORT, SYSLOG_HOST);
    }
}

/**
 * Initialize the syslog forwarder. Call once at server startup.
 */
function initSyslogForwarder() {
    if (!SYSLOG_HOST || !SYSLOG_PORT) {
        console.log('[syslog] SYSLOG_HOST/PORT not configured — log forwarding disabled');
        return;
    }

    _enabled = true;

    if (SYSLOG_PROTOCOL === 'tls') {
        _tlsSocket = tls.connect({ host: SYSLOG_HOST, port: SYSLOG_PORT }, () => {
            console.log(`[syslog] Connected to ${SYSLOG_HOST}:${SYSLOG_PORT} via TLS`);
        });
        _tlsSocket.on('error', (err) => {
            console.error('[syslog] TLS connection error:', err.message);
        });
        _tlsSocket.on('close', () => {
            console.warn('[syslog] TLS connection closed — will reconnect on next restart');
            _enabled = false;
        });
    } else {
        _udpClient = dgram.createSocket('udp4');
        console.log(`[syslog] Forwarding logs to ${SYSLOG_HOST}:${SYSLOG_PORT} via UDP`);
    }

    // Tail the security audit log and forward new lines
    try {
        if (fs.existsSync(LOG_FILE)) {
            let fileSize = fs.statSync(LOG_FILE).size;
            fs.watch(LOG_FILE, (eventType) => {
                if (eventType !== 'change') return;
                try {
                    const newSize = fs.statSync(LOG_FILE).size;
                    if (newSize <= fileSize) { fileSize = newSize; return; }

                    const stream = fs.createReadStream(LOG_FILE, { start: fileSize, encoding: 'utf8' });
                    let buffer = '';
                    stream.on('data', (chunk) => { buffer += chunk; });
                    stream.on('end', () => {
                        const lines = buffer.split('\n').filter(Boolean);
                        for (const line of lines) {
                            try {
                                const parsed = JSON.parse(line);
                                const severity = parsed.level === 'WARN' ? 4 : 6;
                                sendSyslog(line, severity);
                            } catch {
                                sendSyslog(line);
                            }
                        }
                    });
                    fileSize = newSize;
                } catch {
                    // ignore stat errors
                }
            });
        }
    } catch {
        // Log file doesn't exist yet — will be created on first security event
    }
}

module.exports = { initSyslogForwarder, sendSyslog };
