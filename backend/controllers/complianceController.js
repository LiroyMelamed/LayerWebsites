/**
 * Compliance controller.
 *
 * Public endpoint – no authentication required.
 * Exposes the compliance posture driven by the
 * COMPLIANCE_BADGES_MODE environment flag.
 *
 * Ref: ISO 27001 Annex A – A.5.1 (Information security policies)
 */

const { getComplianceStatus } = require('../config/compliance');

/**
 * GET /api/compliance/status
 *
 * Returns the current compliance posture for all three standards
 * the platform aligns with (ISO 27001, 27701, 22301).
 */
async function getStatus(req, res) {
    try {
        const status = getComplianceStatus();
        return res.status(200).json(status);
    } catch (err) {
        console.error('[compliance] Failed to build status:', err?.message);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
}

module.exports = { getStatus };
