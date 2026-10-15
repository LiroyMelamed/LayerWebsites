/**
 * Incident logger — ISO 22301 (Business Continuity) alignment.
 *
 * Provides a lightweight incident-report structure for recording
 * security incidents, outages, and other events that may affect
 * business continuity.
 *
 * This is a local file-based stub.  In a mature deployment it can
 * be extended to forward incidents to an external SIEM, ticketing
 * system, or a cloud BCMS platform.
 *
 * Relevant controls:
 *   ISO 22301 §8.4  – Incident response structure
 *   ISO 27001 A.5.24 – Information security incident management planning
 *   ISO 27001 A.5.25 – Assessment and decision on information security events
 *   ISO 27001 A.5.26 – Response to information security incidents
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logSecurityEvent } = require('./securityAuditLogger');

const INCIDENTS_DIR = path.join(__dirname, '..', 'logs', 'incidents');

// Ensure directory exists
try {
    fs.mkdirSync(INCIDENTS_DIR, { recursive: true });
} catch { /* ignore */ }

/**
 * Severity levels (ISO 27035-2 inspired).
 */
const Severity = Object.freeze({
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
});

/**
 * Create a new incident report.
 *
 * @param {object}  opts
 * @param {string}  opts.severity        – low | medium | high | critical
 * @param {string}  opts.summary         – Brief description (max 500 chars)
 * @param {string}  [opts.detectedBy]    – System / user who detected the incident
 * @param {object}  [opts.meta]          – Additional non-PII context
 * @returns {object} The created incident record
 */
function createIncident({ severity, summary, detectedBy, meta }) {
    const incident = {
        incidentId: `INC-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        severity: Object.values(Severity).includes(severity) ? severity : Severity.MEDIUM,
        detectedAt: new Date().toISOString(),
        resolvedAt: null,
        status: 'open',
        summary: String(summary || '').slice(0, 500),
        detectedBy: detectedBy || 'system',
        meta: meta || {},
    };

    _persistIncident(incident);

    // Also log to the security audit trail
    logSecurityEvent({
        type: 'INCIDENT_CREATED',
        success: true,
        meta: {
            incidentId: incident.incidentId,
            severity: incident.severity,
        },
    });

    return incident;
}

/**
 * Resolve an existing incident by ID.
 *
 * @param {string} incidentId
 * @param {string} [resolutionSummary]  – How it was resolved
 * @returns {object|null} Updated incident or null if not found
 */
function resolveIncident(incidentId, resolutionSummary) {
    const filePath = _incidentFilePath(incidentId);
    if (!fs.existsSync(filePath)) return null;

    try {
        const incident = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        incident.resolvedAt = new Date().toISOString();
        incident.status = 'resolved';
        if (resolutionSummary) incident.resolutionSummary = String(resolutionSummary).slice(0, 500);

        fs.writeFileSync(filePath, JSON.stringify(incident, null, 2), 'utf-8');

        logSecurityEvent({
            type: 'INCIDENT_RESOLVED',
            success: true,
            meta: { incidentId },
        });

        return incident;
    } catch (err) {
        console.error('[incident-logger] Failed to resolve incident:', err.message);
        return null;
    }
}

/**
 * List recent incidents (newest first, max 100).
 *
 * @returns {object[]}
 */
function listIncidents() {
    try {
        const files = fs.readdirSync(INCIDENTS_DIR)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse()
            .slice(0, 100);

        return files.map(f => {
            try {
                return JSON.parse(fs.readFileSync(path.join(INCIDENTS_DIR, f), 'utf-8'));
            } catch { return null; }
        }).filter(Boolean);
    } catch {
        return [];
    }
}

// ── Internal helpers ──────────────────────────────────────────

function _incidentFilePath(incidentId) {
    // Sanitise to prevent path traversal
    const safe = String(incidentId).replace(/[^a-zA-Z0-9\-_]/g, '');
    return path.join(INCIDENTS_DIR, `${safe}.json`);
}

function _persistIncident(incident) {
    try {
        const filePath = _incidentFilePath(incident.incidentId);
        fs.writeFileSync(filePath, JSON.stringify(incident, null, 2), 'utf-8');
    } catch (err) {
        console.error('[incident-logger] Failed to persist incident:', err.message);
    }
}

module.exports = {
    Severity,
    createIncident,
    resolveIncident,
    listIncidents,
};
