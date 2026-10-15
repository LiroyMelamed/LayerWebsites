/**
 * Centralized compliance configuration reader.
 *
 * Controls how ISO compliance badges and status are presented
 * throughout the application.  The single source of truth for all
 * compliance-related feature flags.
 *
 * Environment variables:
 *   COMPLIANCE_BADGES_MODE  – "aligned" (default) | "certified"
 *
 * Usage:
 *   const { getComplianceStatus, getMode } = require('./compliance');
 *
 * LEGAL NOTE
 * ----------
 * Only set COMPLIANCE_BADGES_MODE=certified **after** your
 * organisation has obtained the relevant certification from an
 * accredited registrar and can evidence a valid certificate.
 * False claims of certification can constitute a legal liability.
 */

const VALID_MODES = ['aligned', 'certified'];

/** Reads and validates badge mode from the environment. */
function getMode() {
    const raw = (process.env.COMPLIANCE_BADGES_MODE || '').toLowerCase().trim();
    return VALID_MODES.includes(raw) ? raw : 'aligned';
}

/**
 * Returns the full compliance status object,
 * ready to be serialised and sent to clients.
 */
function getComplianceStatus() {
    const mode = getMode();
    const isCertified = mode === 'certified';

    return {
        mode,
        standards: {
            iso27001: {
                name: 'ISO/IEC 27001',
                scope: 'Information Security Management System (ISMS)',
                status: isCertified ? 'certified' : 'aligned',
                label: isCertified
                    ? 'ISO/IEC 27001 Certified'
                    : 'Aligned with ISO/IEC 27001 controls',
            },
            iso27701: {
                name: 'ISO/IEC 27701',
                scope: 'Privacy Information Management System (PIMS)',
                status: isCertified ? 'certified' : 'ready',
                label: isCertified
                    ? 'ISO/IEC 27701 Certified'
                    : 'ISO/IEC 27701-ready',
            },
            iso22301: {
                name: 'ISO 22301',
                scope: 'Business Continuity Management System (BCMS)',
                status: isCertified ? 'certified' : 'based',
                label: isCertified
                    ? 'ISO 22301 Certified'
                    : 'Business continuity principles based on ISO 22301',
            },
        },
        disclaimer: isCertified
            ? 'Certification verified by an accredited registrar.'
            : 'Compliance program in progress. These controls are aligned with the listed standards but have not yet been formally certified by an accredited registrar.',
    };
}

module.exports = { getMode, getComplianceStatus };
