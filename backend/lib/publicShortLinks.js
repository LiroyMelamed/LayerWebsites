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

function normalizeHttpUrl(url) {
    const s = String(url || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^waze:\/\//i.test(s)) return s;
    return '';
}

/** Trim + unwrap accidental `[url]` wrapping from pasted Zoom links. */
function unwrapLocation(location) {
    let s = String(location || '').trim();
    if (/^\[.+\]$/.test(s)) s = s.slice(1, -1).trim();
    return s;
}

function isZoomMeetingUrl(location) {
    const s = unwrapLocation(location);
    return /\bzoom\.us\b/i.test(s);
}

/** Zoom / Meet / Teams URLs — not a physical place for Waze/Maps. */
function isRemoteMeetingUrl(location) {
    const s = unwrapLocation(location);
    if (!s) return false;
    return isZoomMeetingUrl(s)
        || /\bmeet\.google\.com\b/i.test(s)
        || /\bteams\.microsoft\.com\b/i.test(s)
        || /\bteams\.live\.com\b/i.test(s);
}

/**
 * Place / nav policy by meeting type:
 * - phone  → none (never location / waze / maps / office fallback)
 * - zoom   → link only (no office fallback, no waze/maps)
 * - else   → physical place (office fallback ok)
 */
function meetingPlaceMode(meetingType) {
    const mt = String(meetingType || '').trim().toLowerCase();
    if (mt === 'phone') return 'none';
    if (mt === 'zoom') return 'link';
    return 'place';
}

/**
 * Hebrew label for the location line in SMS.
 * Zoom → "קישור לזום"; other video links → "קישור לפגישה"; else "מיקום".
 */
function remoteMeetingLabel(location, meetingType) {
    const mt = String(meetingType || '').trim().toLowerCase();
    if (mt === 'zoom' || isZoomMeetingUrl(location)) return 'קישור לזום';
    if (mt === 'phone') return '';
    if (isRemoteMeetingUrl(location)) return 'קישור לפגישה';
    return 'מיקום';
}

const { reminderKindLabelHe } = require('./reminderKindLabelHe');

/** Hebrew meeting-kind phrase for SMS/push body lines (not always "פגישה"). */
function meetingTypeLabelHe(meetingType, eventType = '', title = '', reminderTemplateKey = '', subject = '', templateLabel = '') {
    const et = String(eventType || '').trim().toLowerCase();
    const eventTitle = String(title || '').trim();

    if (et === 'hearing') return 'דיון';
    if (et === 'reminder') {
        return reminderKindLabelHe(reminderTemplateKey, {
            title: eventTitle,
            subject,
            templateLabel,
        });
    }
    if (et === 'holiday') return eventTitle || 'חג';
    if (et === 'leave') return eventTitle || 'חופשה';

    const mt = String(meetingType || '').trim().toLowerCase();
    if (mt === 'zoom') return 'פגישת זום';
    if (mt === 'frontal') return 'פגישה פרונטלית';
    if (mt === 'phone') return 'פגישה טלפונית';
    if (mt === 'other') return eventTitle || 'פגישה';

    if (eventTitle) return eventTitle;
    return 'אירוע';
}

function isRemoteMeeting(location, meetingType) {
    const mode = meetingPlaceMode(meetingType);
    if (mode === 'none' || mode === 'link') return true;
    return isRemoteMeetingUrl(location);
}

/** Ensure bare domains become https:// links for SMS. */
function coerceHttpUrl(raw) {
    const s = unwrapLocation(raw);
    if (!s) return '';
    const normalized = normalizeHttpUrl(s);
    if (normalized) return normalized;
    if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(s)) return `https://${s}`;
    return s;
}

/** Parse "lat, lng" (optional spaces). */
function parseLatLng(location) {
    const q = String(location || '').trim();
    const m = q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
}

/**
 * Official-style Waze deep link.
 * Prefer coordinate form (short, no Hebrew % encoding). Query form is a fallback
 * that should be wrapped via toCleanNavUrl before SMS/email.
 */
function rawWazeUrl(location) {
    const q = String(location || '').trim();
    if (!q) return '';
    const coord = parseLatLng(q);
    if (coord) {
        return `https://waze.com/ul?ll=${coord.lat},${coord.lng}&navigate=yes`;
    }
    return `https://waze.com/ul?q=${encodeURIComponent(q)}`;
}

/**
 * Clean Google Maps link (maps.google.com/?q=… is shorter than the search API form).
 */
function rawMapsUrl(location) {
    const q = String(location || '').trim();
    if (!q) return '';
    const coord = parseLatLng(q);
    if (coord) {
        return `https://maps.google.com/?q=${coord.lat},${coord.lng}`;
    }
    return `https://maps.google.com/?q=${encodeURIComponent(q)}`;
}

/**
 * True when the URL is already a short official place permalink / coord link
 * that is safe to put in SMS as-is (no giant %D7 Hebrew query string).
 */
function isAlreadyCleanNavUrl(url) {
    const u = String(url || '').trim();
    if (!u) return false;
    // Waze place permalink: https://waze.com/ul/hsv9n8gwrw
    if (/^https?:\/\/(www\.)?waze\.com\/ul\/[a-z0-9]+\/?$/i.test(u)) return true;
    // Waze coordinate navigate link
    if (/^https?:\/\/(www\.)?waze\.com\/ul\?ll=-?\d/i.test(u)) return true;
    // Google short share links
    if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(u)) return true;
    // Coordinate-only Google link (no encoded text)
    if (/^https?:\/\/(www\.)?maps\.google\.com\/\?q=-?\d+(\.\d+)?,-?\d+(\.\d+)?$/i.test(u)) return true;
    if (/^https?:\/\/(www\.)?google\.com\/maps\?q=-?\d+(\.\d+)?,-?\d+(\.\d+)?$/i.test(u)) return true;
    // Our own short links
    if (/\/n\/[A-Za-z0-9_-]{6,16}\/?$/i.test(u)) return true;
    return false;
}

/**
 * Never put raw Hebrew-encoded map query strings in SMS/email.
 * Keep official place permalinks & coordinate links; wrap everything else in /n/.
 */
async function toCleanNavUrl(targetUrl, kind = 'nav') {
    const url = normalizeHttpUrl(targetUrl);
    if (!url) return '';
    if (isAlreadyCleanNavUrl(url)) return url;
    // Avoid wrapping if URL has no ugly percent-encoding and is reasonably short
    if (!/%[0-9A-Fa-f]{2}/.test(url) && url.length <= 80) return url;
    return createShortLink(url, kind);
}

/**
 * Direct Waze/Maps URLs for SMS/email — always SMS-safe length.
 * Prefer firm place links when address is empty or matches the office address.
 * @returns {Promise<{ address: string, wazeUrl: string, mapsUrl: string }>}
 */
async function buildShortNavUrls(location, {
    officeAddress = '',
    firmWazeUrl = '',
    firmMapsUrl = '',
    meetingType = '',
} = {}) {
    const mode = meetingPlaceMode(meetingType);
    const rawLocation = unwrapLocation(location);

    // Phone: never emit place / link / maps.
    if (mode === 'none') {
        return {
            address: '',
            wazeUrl: '',
            mapsUrl: '',
            isRemote: true,
            label: '',
            mode,
        };
    }

    // Zoom / video: link only — never office fallback, never Waze/Maps.
    if (mode === 'link' || isRemoteMeetingUrl(rawLocation)) {
        const url = coerceHttpUrl(rawLocation);
        return {
            address: url,
            wazeUrl: '',
            mapsUrl: '',
            isRemote: true,
            label: remoteMeetingLabel(rawLocation, meetingType || 'zoom'),
            mode: 'link',
        };
    }

    const address = rawLocation || String(officeAddress || '').trim();
    if (!address) {
        return { address: '', wazeUrl: '', mapsUrl: '', isRemote: false, label: 'מיקום', mode };
    }

    const office = String(officeAddress || '').trim();
    const useFirmLinks = !rawLocation
        || (office && address === office);

    const firmWaze = normalizeHttpUrl(firmWazeUrl);
    const firmMaps = normalizeHttpUrl(firmMapsUrl);

    let wazeUrl = (useFirmLinks && firmWaze) ? firmWaze : rawWazeUrl(address);
    let mapsUrl = (useFirmLinks && firmMaps) ? firmMaps : rawMapsUrl(address);

    wazeUrl = await toCleanNavUrl(wazeUrl, 'waze');
    mapsUrl = await toCleanNavUrl(mapsUrl, 'maps');

    return { address, wazeUrl, mapsUrl, isRemote: false, label: 'מיקום', mode };
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
async function buildShortNavLinksBlock(location, opts = {}) {
    if (meetingPlaceMode(opts.meetingType) === 'none') return '';
    const { address, wazeUrl, mapsUrl, isRemote, label } = await buildShortNavUrls(location, opts);
    if (!address) return '';
    const lineLabel = label || (isRemote ? remoteMeetingLabel(address, opts.meetingType) : 'מיקום');
    if (!lineLabel) return '';
    let block = `\n${lineLabel}: ${address}`;
    if (!isRemote) {
        if (wazeUrl) block += `\nוויז: ${wazeUrl}`;
        if (mapsUrl) block += `\nמפות: ${mapsUrl}`;
    }
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
    toCleanNavUrl,
    isAlreadyCleanNavUrl,
    parseLatLng,
    unwrapLocation,
    isZoomMeetingUrl,
    isRemoteMeetingUrl,
    isRemoteMeeting,
    remoteMeetingLabel,
    meetingTypeLabelHe,
    meetingPlaceMode,
};
