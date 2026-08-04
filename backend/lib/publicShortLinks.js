'use strict';

const crypto = require('crypto');
const pool = require('../config/db');

function getWebsiteDomain() {
    return String(process.env.WEBSITE_DOMAIN || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function getPublicAppBase() {
    const envBase = String(
        process.env.PUBLIC_APP_URL
        || process.env.FRONTEND_URL
        || process.env.CLIENT_APP_URL
        || ''
    ).trim().replace(/\/$/, '');
    if (envBase) return envBase;
    const domain = getWebsiteDomain();
    return domain ? `https://${domain}` : '';
}

function generateSlug(len = 8) {
    return crypto.randomBytes(6).toString('base64url').slice(0, len);
}

/**
 * Persist target URL under /n/<slug>. Returns absolute short URL, or targetUrl on failure.
 */
async function createShortLink(targetUrl, kind = 'nav', { expiresAt = null } = {}) {
    const url = String(targetUrl || '').trim();
    if (!url) return '';
    const base = getPublicAppBase();
    if (!base) return url;

    for (let i = 0; i < 8; i++) {
        const slug = generateSlug();
        try {
            await pool.query(
                `INSERT INTO public_short_links (slug, target_url, kind, expires_at)
                 VALUES ($1, $2, $3, $4)`,
                [slug, url, String(kind || 'nav').slice(0, 32), expiresAt]
            );
            return `${base}/n/${encodeURIComponent(slug)}`;
        } catch (err) {
            if (err && err.code === '23505') continue; // unique violation
            console.warn('[public-short-links] insert failed:', err.message);
            return url;
        }
    }
    console.warn('[public-short-links] slug collisions exhausted');
    return url;
}

async function resolveShortLink(slug) {
    const safe = String(slug || '').trim();
    if (!/^[A-Za-z0-9_-]{6,16}$/.test(safe)) return null;
    const { rows } = await pool.query(
        `SELECT target_url, kind, expires_at
         FROM public_short_links
         WHERE slug = $1
         LIMIT 1`,
        [safe]
    );
    const row = rows[0];
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
    return { url: row.target_url, kind: row.kind };
}

function rawWazeUrl(location) {
    const q = String(location || '').trim();
    if (!q) return '';
    return `https://waze.com/ul?q=${encodeURIComponent(q)}`;
}

function rawMapsUrl(location) {
    const q = String(location || '').trim();
    if (!q) return '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/**
 * Build short (or raw fallback) nav URLs for SMS.
 * @returns {Promise<{ address: string, wazeUrl: string, mapsUrl: string }>}
 */
async function buildShortNavUrls(location) {
    const address = String(location || '').trim();
    if (!address) return { address: '', wazeUrl: '', mapsUrl: '' };
    const wazeTarget = rawWazeUrl(address);
    const mapsTarget = rawMapsUrl(address);
    const [wazeUrl, mapsUrl] = await Promise.all([
        createShortLink(wazeTarget, 'waze'),
        createShortLink(mapsTarget, 'maps'),
    ]);
    return { address, wazeUrl, mapsUrl };
}

async function buildShortRsvpUrl(inviteToken) {
    const token = String(inviteToken || '').trim();
    if (!token) return '';
    const base = getPublicAppBase();
    if (!base) return '';
    const longUrl = `${base}/calendar-invite/${encodeURIComponent(token)}`;
    return createShortLink(longUrl, 'rsvp');
}

/** Compact nav block for lawyer auto SMS (not template-driven). */
async function buildShortNavLinksBlock(location) {
    const { address, wazeUrl, mapsUrl } = await buildShortNavUrls(location);
    if (!address) return '';
    let block = `\nמיקום: ${address}`;
    if (wazeUrl) block += `\nWaze: ${wazeUrl}`;
    if (mapsUrl) block += `\nMaps: ${mapsUrl}`;
    return block;
}

module.exports = {
    getWebsiteDomain,
    getPublicAppBase,
    createShortLink,
    resolveShortLink,
    rawWazeUrl,
    rawMapsUrl,
    buildShortNavUrls,
    buildShortRsvpUrl,
    buildShortNavLinksBlock,
};
