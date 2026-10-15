/**
 * Per-tenant complimentary windows and whether MelaMedia bills this DB.
 */

const COMPLIMENTARY_UNTIL = {
    ashrafessa: '2027-01-01T23:59:59.999+02:00',
    morlevy: '2027-01-01T23:59:59.999+02:00',
    melamedia: '2027-01-01T23:59:59.999+02:00',
    idm: '2027-01-01T23:59:59.999+02:00',
    melamedlaw: '2026-09-12T23:59:59.999+03:00',
};

const UNBILLED_SLUGS = new Set(['melamedia', 'idm']);

function normalizeSlug(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function getTenantSlug() {
    const candidates = [
        process.env.RUNTIME_TENANT,
        process.env.FIRM_NAME,
        process.env.COMPANY_NAME,
        process.env.DB_NAME,
    ];
    for (const c of candidates) {
        const slug = normalizeSlug(c);
        if (!slug) continue;
        if (COMPLIMENTARY_UNTIL[slug] || UNBILLED_SLUGS.has(slug)) return slug;
        if (slug.includes('ashraf')) return 'ashrafessa';
        if (slug.includes('morlev')) return 'morlevy';
        if (slug.includes('melamedlaw')) return 'melamedlaw';
        if (slug.includes('melamedia')) return 'melamedia';
        if (slug === 'idm') return 'idm';
    }
    return normalizeSlug(process.env.FIRM_NAME || process.env.COMPANY_NAME || '') || 'unknown';
}

function parseIsoDate(value) {
    const s = String(value || '').trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function envComplimentaryUntil() {
    return parseIsoDate(process.env.FIRM_DEFAULT_UNLIMITED_UNTIL_UTC);
}

function defaultComplimentaryUntil(slug = getTenantSlug()) {
    const fromEnv = envComplimentaryUntil();
    if (fromEnv) return fromEnv;
    const iso = COMPLIMENTARY_UNTIL[slug];
    return iso ? new Date(iso) : null;
}

function defaultBillingEnabled(slug = getTenantSlug()) {
    const raw = String(process.env.BILLING_CHARGES_ENABLED || '').trim().toLowerCase();
    if (raw === 'false' || raw === '0') return false;
    if (raw === 'true' || raw === '1') return true;
    if (UNBILLED_SLUGS.has(slug)) return false;
    return true;
}

function isDateInFuture(date, now = new Date()) {
    if (!date) return false;
    const d = date instanceof Date ? date : parseIsoDate(date);
    if (!d) return false;
    return d.getTime() > now.getTime();
}

function computeFlags(row, now = new Date()) {
    const billingEnabled = row?.billingEnabled !== false;
    const complimentaryUntil = row?.complimentaryUntil || null;
    const stillComplimentary = !billingEnabled || isDateInFuture(complimentaryUntil, now);
    const graceUntil = row?.graceUntil ? new Date(row.graceUntil) : null;
    const graceExpired = Boolean(
        row?.status === 'past_due' && graceUntil && graceUntil.getTime() <= now.getTime()
    );
    const locked = Boolean(
        billingEnabled && !stillComplimentary && (row?.status === 'suspended' || graceExpired)
    );
    return { billingEnabled, stillComplimentary, graceExpired, locked, complimentaryUntil };
}

function addCalendarMonth(from = new Date()) {
    const d = new Date(from.getTime());
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
}

function addCalendarYear(from = new Date()) {
    const d = new Date(from.getTime());
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d;
}

function getPublicApiBaseUrl() {
    const explicit = String(process.env.PUBLIC_API_BASE_URL || '').trim().replace(/\/+$/, '');
    if (explicit) return explicit;
    const domain = String(process.env.WEBSITE_DOMAIN || '').trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '');
    if (domain) return `https://api-${domain}`;
    return 'http://127.0.0.1:5000';
}

function getFrontendBaseUrl() {
    const explicit = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
    if (explicit) return explicit;
    const domain = String(process.env.WEBSITE_DOMAIN || '').trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '');
    if (domain) return `https://${domain}`;
    return 'http://localhost:3000';
}

function getPayUrl() {
    return `${getFrontendBaseUrl()}/AdminStack/PlanUsage`;
}

module.exports = {
    COMPLIMENTARY_UNTIL,
    UNBILLED_SLUGS,
    getTenantSlug,
    defaultComplimentaryUntil,
    defaultBillingEnabled,
    isDateInFuture,
    computeFlags,
    addCalendarMonth,
    addCalendarYear,
    getPublicApiBaseUrl,
    getFrontendBaseUrl,
    getPayUrl,
    parseIsoDate,
};
