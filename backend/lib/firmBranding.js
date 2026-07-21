/**
 * Single source of truth for firm/company display names and email sender branding.
 *
 * Platform settings (preferred):
 *   - firm:LAW_FIRM_NAME  — Hebrew client-facing name
 *   - firm:COMPANY_NAME   — English brand / legal name
 *   - messaging:SMTP_FROM_EMAIL — outbound email address
 *
 * Legacy env vars are fallbacks only (.env / rollout).
 */
const { getSetting } = require('../services/settingsService');

async function getLawFirmNameHe() {
    return String(
        (await getSetting('firm', 'LAW_FIRM_NAME', null))
        || process.env.LAW_FIRM_NAME
        || ''
    ).trim();
}

async function getFirmNameEn() {
    return String(
        (await getSetting('firm', 'COMPANY_NAME', null))
        || process.env.COMPANY_NAME
        || process.env.FIRM_NAME
        || ''
    ).trim();
}

/** Best client-facing firm name (Hebrew first, then English). */
async function getFirmDisplayName() {
    const he = await getLawFirmNameHe();
    if (he) return he;
    const en = await getFirmNameEn();
    if (en) return en;
    return String(process.env.FIRM_DISPLAY_NAME || '').trim();
}

/** Email "From" display name — same as firm display name, then SMTP_FROM_NAME env. */
async function getEmailFromName() {
    const display = await getFirmDisplayName();
    if (display) return display;
    return String(process.env.SMTP_FROM_NAME || '').trim();
}

async function getEmailFromEmail() {
    const smtpUser = String(process.env.SMTP_USER || '').trim();
    const configured = String(
        (await getSetting('messaging', 'SMTP_FROM_EMAIL', null))
        || process.env.SMTP_FROM_EMAIL
        || ''
    ).trim();
    // cPanel-style SMTP requires From to match the authenticated mailbox.
    // Prefer SMTP_USER when set; fall back to configured sender address.
    return smtpUser || configured;
}

module.exports = {
    getLawFirmNameHe,
    getFirmNameEn,
    getFirmDisplayName,
    getEmailFromName,
    getEmailFromEmail,
};
