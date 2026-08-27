'use strict';

/**
 * Per-event calendar push reminders + SMS template composition.
 */

const settingsService = require('../services/settingsService');
const pool = require('../config/db');
const { renderTemplate } = require('../utils/templateRenderer');
const { getFirmDisplayName, getLawFirmNameHe } = require('./firmBranding');
const {
    getPublicAppBase,
    getWebsiteDomain,
    buildShortNavUrls,
    buildShortRsvpUrl,
    buildShortNavLinksBlock,
    rawWazeUrl,
    rawMapsUrl,
    unwrapLocation,
    isRemoteMeeting,
    remoteMeetingLabel,
    meetingTypeLabelHe,
    meetingPlaceMode,
} = require('./publicShortLinks');

const DEFAULT_ALLOWED_OFFSETS = [0, 15, 30, 60, 120, 1440, 2880, 10080];
const DEFAULT_ALLOWED_CHANNELS = ['push', 'sms', 'email'];
const REMINDABLE_EVENT_TYPES = new Set(['appointment', 'hearing', 'reminder']);
const MAX_OFFSETS_PER_EVENT = 8;
const VALID_CHANNEL_KEYS = new Set(['push', 'sms', 'email']);

const DEFAULT_CLIENT_REMINDER_SMS =
    'שלום {{recipientName}},\n'
    + 'זוהי תזכורת ל{{meetingTypeLabel}} שנקבעה עבורך ב{{firmName}}\n'
    + 'בתאריך {{date}} בשעה {{time}}.\n'
    + 'כתובתנו הינה {{address}}\n'
    + 'להוראות הגעה בוויז {{wazeUrl}}\n'
    + 'לבירור או שינוי נא להתקשר ל {{firmPhone}}\n'
    + 'מידע נוסף ניתן למצוא באתר שלנו\n'
    + '{{websiteUrl}}';

const DEFAULT_INVITE_SMS =
    'שלום {{recipientName}}, נקבעה לך {{meetingTypeLabel}}, בתאריך {{date}} בשעה {{time}},\n'
    + 'כתובתנו היא {{address}}. בברכה, {{firmName}},\n'
    + 'לאישור הגעה, אנא לחץ/י על הקישור {{rsvpUrl}}\n'
    + 'להוראות הגעה בוויז: {{wazeUrl}}\n'
    + 'לבירור או שינוי נא להתקשר ל {{firmPhone}}';

const {
    adaptClientReminderSmsForReminderEvent,
    DEFAULT_CLIENT_REMINDER_SMS_REMINDER,
} = require('./reminderKindLabelHe');

function usesHearingSmsTemplates(eventType) {
    return String(eventType || '').trim().toLowerCase() === 'hearing';
}

function upgradeLegacyCalendarSmsTemplate(text) {
    let s = String(text || '');
    if (!s || s.includes('{{meetingTypeLabel}}')) return s;
    return s
        .replace(/זוהי תזכורת לפגישה/g, 'זוהי תזכורת ל{{meetingTypeLabel}}')
        .replace(/זוהי תזכורת לדיון/g, 'זוהי תזכורת ל{{meetingTypeLabel}}')
        .replace(/נקבעה לך פגישה/g, 'נקבעה לך {{meetingTypeLabel}}')
        .replace(/נקבעה לך דיון/g, 'נקבעה לך {{meetingTypeLabel}}')
        .replace(/הוזמנת לדיון/g, 'הוזמנת ל{{meetingTypeLabel}}');
}

function defaultReminderTargets() {
    return { client: true, managers: true };
}

function parseReminderTargets(raw) {
    let src = raw;
    if (typeof raw === 'string') {
        try { src = JSON.parse(raw); } catch { src = null; }
    }
    if (!src || typeof src !== 'object') return defaultReminderTargets();
    return {
        client: src.client !== false && src.client !== 'false' && src.client !== 0,
        managers: src.managers !== false && src.managers !== 'false' && src.managers !== 0,
    };
}

function targetsToJson(targets) {
    return JSON.stringify(parseReminderTargets(targets));
}

/** Legacy long nav links (kept for any callers that need sync). Prefer buildShortNavLinksBlock. */
function buildNavLinks(location, meetingType = '') {
    if (meetingPlaceMode(meetingType) === 'none') return '';
    const q = unwrapLocation(location);
    if (!q) return '';
    if (isRemoteMeeting(q, meetingType)) {
        const label = remoteMeetingLabel(q, meetingType);
        if (!label) return '';
        return `\n${label}: ${q}`;
    }
    const encoded = encodeURIComponent(q);
    return `\nמיקום: ${q}\nWaze: https://waze.com/ul?q=${encoded}\nMaps: https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

function parseOffsetsList(raw) {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) {
        return raw
            .map((v) => parseInt(v, 10))
            .filter((n) => Number.isInteger(n) && n >= 0);
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                return parseOffsetsList(parsed);
            } catch {
                return [];
            }
        }
        return trimmed
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => Number.isInteger(n) && n >= 0);
    }
    return [];
}

function uniqueSortedDesc(offsets) {
    return [...new Set(offsets)].sort((a, b) => b - a);
}

async function loadAllowedReminderOffsets(settingsServiceArg) {
    const svc = settingsServiceArg || settingsService;
    const raw = await svc.getSetting(
        'calendar',
        'CALENDAR_REMINDER_OPTIONS',
        DEFAULT_ALLOWED_OFFSETS.join(',')
    );
    const parsed = uniqueSortedDesc(parseOffsetsList(raw));
    return parsed.length ? parsed : DEFAULT_ALLOWED_OFFSETS;
}

function normalizeReminderOffsets(input, allowedOffsets) {
    const allowed = new Set(allowedOffsets);
    const parsed = uniqueSortedDesc(parseOffsetsList(input))
        .filter((n) => allowed.has(n))
        .slice(0, MAX_OFFSETS_PER_EVENT);
    return parsed;
}

function offsetsToJson(offsets) {
    return JSON.stringify(uniqueSortedDesc(offsets));
}

function parseStoredOffsets(raw) {
    return uniqueSortedDesc(parseOffsetsList(raw));
}

function parseStoredSentOffsets(raw) {
    return uniqueSortedDesc(parseOffsetsList(raw));
}

/** Parse reminders_sent_offsets jsonb — supports role keys ("lawyer:30") and legacy numeric offsets. */
function parseStoredSentKeys(raw) {
    let list = raw;
    if (typeof raw === 'string') {
        try { list = JSON.parse(raw); } catch { list = []; }
    }
    if (!Array.isArray(list)) return [];
    const keys = new Set();
    for (const item of list) {
        if (typeof item === 'number' || (/^\d+$/.test(String(item)))) {
            const n = Number(item);
            keys.add(`lawyer:${n}`);
            keys.add(`client:${n}`);
        } else if (item != null && String(item).trim()) {
            keys.add(String(item).trim());
        }
    }
    return [...keys];
}

function sentKeysToJson(keys) {
    return JSON.stringify([...new Set(keys)]);
}

/**
 * Compute next reminders_sent_offsets after an update.
 * Returns null to keep the existing DB value unchanged.
 */
function computeRemindersSentOnUpdate(prevRaw, {
    timeChanged = false,
    remindersChanged = false,
    channelsChanged = false,
    currentLawyerOffsets = [],
    currentClientOffsets = [],
    nextLawyerOffsets = [],
    nextClientOffsets = [],
} = {}) {
    if (!timeChanged && !remindersChanged && !channelsChanged) return null;

    const prev = parseStoredSentKeys(prevRaw);
    const hadLawyer0 = currentLawyerOffsets.includes(0);
    const hadClient0 = currentClientOffsets.includes(0);
    const hasLawyer0 = nextLawyerOffsets.includes(0);
    const hasClient0 = nextClientOffsets.includes(0);

    if (channelsChanged && !timeChanged && !remindersChanged) {
        return null;
    }

    if (timeChanged && !remindersChanged) {
        return sentKeysToJson(prev.filter((key) => /:(0)$/.test(key)));
    }

    const kept = [];
    for (const key of prev) {
        const m = String(key).match(/^(lawyer|client):(\d+)$/);
        if (!m) continue;
        const role = m[1];
        const off = Number(m[2]);
        if (off === 0) {
            if (role === 'lawyer' && hasLawyer0 && hadLawyer0) kept.push(key);
            if (role === 'client' && hasClient0 && hadClient0) kept.push(key);
        }
    }
    return sentKeysToJson(kept);
}

/** Fire offset=0 only when immediate reminder is newly enabled (not on drag/minor edits). */
function shouldFireImmediateReminderOnUpdate({
    currentLawyerOffsets = [],
    currentClientOffsets = [],
    nextLawyerOffsets = [],
    nextClientOffsets = [],
    currentTargets = null,
    nextTargets = null,
} = {}) {
    const prevT = parseReminderTargets(currentTargets);
    const nextT = parseReminderTargets(nextTargets);
    const lawyer0Was = prevT.managers && currentLawyerOffsets.includes(0);
    const client0Was = prevT.client && currentClientOffsets.includes(0);
    const lawyer0Now = nextT.managers && nextLawyerOffsets.includes(0);
    const client0Now = nextT.client && nextClientOffsets.includes(0);
    return (lawyer0Now && !lawyer0Was) || (client0Now && !client0Was);
}

function serializeRemindersSent(raw) {
    if (raw == null) return '[]';
    if (typeof raw === 'string') return raw;
    return JSON.stringify(raw);
}

function defaultReminderChannels() {
    return { push: false, sms: false, email: false };
}

function parseChannelsList(raw) {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) {
        return raw.map((v) => String(v).trim().toLowerCase()).filter((k) => VALID_CHANNEL_KEYS.has(k));
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('{')) {
            try {
                return parseChannelsList(JSON.parse(trimmed));
            } catch {
                return [];
            }
        }
        return trimmed
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter((k) => VALID_CHANNEL_KEYS.has(k));
    }
    if (typeof raw === 'object') {
        return Object.entries(raw)
            .filter(([k, v]) => VALID_CHANNEL_KEYS.has(k) && (v === true || v === 'true' || v === 1 || v === '1'))
            .map(([k]) => k);
    }
    return [];
}

function parseStoredChannels(raw) {
    if (!raw) return defaultReminderChannels();
    let parsed = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return defaultReminderChannels();
        }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return defaultReminderChannels();
    }
    return {
        push: parsed.push === true || parsed.push === 'true' || parsed.push === 1 || parsed.push === '1',
        sms: parsed.sms === true || parsed.sms === 'true' || parsed.sms === 1 || parsed.sms === '1',
        email: parsed.email === true || parsed.email === 'true' || parsed.email === 1 || parsed.email === '1',
    };
}

async function loadAllowedReminderChannels(settingsServiceArg) {
    const svc = settingsServiceArg || settingsService;
    const raw = await svc.getSetting(
        'calendar',
        'CALENDAR_REMINDER_CHANNELS',
        DEFAULT_ALLOWED_CHANNELS.join(',')
    );
    const parsed = [...new Set(parseChannelsList(raw))];
    return parsed.length ? parsed : DEFAULT_ALLOWED_CHANNELS;
}

function normalizeReminderChannels(input, allowedChannels) {
    const allowed = new Set(allowedChannels);
    const parsed = parseStoredChannels(input);
    return {
        push: allowed.has('push') && parsed.push,
        sms: allowed.has('sms') && parsed.sms,
        email: allowed.has('email') && parsed.email,
    };
}

function channelsToJson(channels) {
    const c = parseStoredChannels(channels);
    return JSON.stringify(c);
}

function hasAnyReminderChannel(channels) {
    const c = parseStoredChannels(channels);
    return c.push || c.sms || c.email;
}

/** Actual minutes remaining until event start (Asia/Jerusalem clock via Date). */
function minutesUntilStart(startTime, now = new Date()) {
    const startMs = new Date(startTime).getTime();
    if (!Number.isFinite(startMs)) return 0;
    return Math.max(0, Math.round((startMs - now.getTime()) / 60000));
}

const TENANT_TZ = 'Asia/Jerusalem';

/** YYYY-MM-DD in Asia/Jerusalem. */
function jerusalemYmdString(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TENANT_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

/** Whole calendar days from `now` to `startTime` in Asia/Jerusalem (can be 0). */
function calendarDayDiffJerusalem(startTime, now = new Date()) {
    const start = new Date(startTime);
    if (!Number.isFinite(start.getTime())) return 0;
    const [ay, am, ad] = jerusalemYmdString(now).split('-').map(Number);
    const [by, bm, bd] = jerusalemYmdString(start).split('-').map(Number);
    const aUtc = Date.UTC(ay, am - 1, ad);
    const bUtc = Date.UTC(by, bm - 1, bd);
    return Math.round((bUtc - aUtc) / 86400000);
}

function formatUnderOneHourHebrew(minutes) {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    if (m === 0) return 'עכשיו';
    if (m === 15) return 'בעוד רבע שעה';
    if (m === 30) return 'בעוד חצי שעה';
    return `בעוד כ-${m} דקות`;
}

function formatHoursHebrew(hours) {
    const h = Math.max(1, Math.round(Number(hours) || 0));
    if (h === 1) return 'בעוד שעה';
    if (h === 2) return 'בעוד שעתיים';
    return `בעוד ${h} שעות`;
}

function formatDaysHebrew(days) {
    const n = Math.max(1, Math.round(Number(days) || 0));
    if (n === 1) return 'מחר';
    if (n === 2) return 'מחרתיים';
    if (n % 7 === 0) {
        const weeks = n / 7;
        if (weeks === 1) return 'בעוד שבוע';
        if (weeks === 2) return 'בעוד שבועיים';
        return `בעוד ${weeks} שבועות`;
    }
    return `בעוד ${n} ימים`;
}

/**
 * Natural Hebrew relative label from an offset in minutes.
 * Single unit only — no "יום ו-N שעות" / "שעות ו-N דקות".
 */
function formatOffsetHebrew(minutes) {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    if (m === 0) return 'עכשיו';
    if (m < 60) return formatUnderOneHourHebrew(m);
    if (m < 1440) {
        const hours = Math.max(1, Math.round(m / 60));
        return formatHoursHebrew(hours);
    }
    const days = Math.max(1, Math.round(m / 1440));
    return formatDaysHebrew(days);
}

/**
 * Natural Hebrew relative label until event start (calendar-day aware in Asia/Jerusalem).
 */
function formatRemainingHebrew(startTime, now = new Date()) {
    const start = new Date(startTime);
    if (!Number.isFinite(start.getTime())) return formatOffsetHebrew(0);

    const dayDiff = calendarDayDiffJerusalem(start, now);
    if (dayDiff >= 1) return formatDaysHebrew(dayDiff);

    // Same calendar day (or past): hours / fuzzy minutes.
    return formatOffsetHebrew(minutesUntilStart(startTime, now));
}

function formatEventDate(startTime) {
    return new Date(startTime).toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: TENANT_TZ,
    });
}

function formatEventTime(startTime) {
    return new Date(startTime).toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: TENANT_TZ,
    });
}

async function resolveReminderMetaForEvent(eventId, fallbackKey = 'GENERAL') {
    const id = parseInt(eventId, 10);
    const empty = { templateKey: fallbackKey, subject: '', templateLabel: '' };
    if (!Number.isFinite(id)) return empty;
    try {
        const { rows } = await pool.query(
            `SELECT ser.template_key, ser.subject, rt.label AS template_label
             FROM scheduled_email_reminders ser
             LEFT JOIN reminder_templates rt ON rt.template_key = ser.template_key
             WHERE ser.calendar_event_id = $1
             LIMIT 1`,
            [id]
        );
        const row = rows[0];
        if (!row) return empty;
        const templateKey = String(row.template_key || fallbackKey).trim() || fallbackKey;
        let templateLabel = String(row.template_label || '').trim();
        if (!templateLabel) {
            try {
                const { getTemplateByKey } = require('../tasks/emailReminders/templates');
                const tpl = await getTemplateByKey(templateKey);
                templateLabel = String(tpl?.label || '').trim();
            } catch { /* ignore */ }
        }
        return {
            templateKey,
            subject: String(row.subject || '').trim(),
            templateLabel,
        };
    } catch {
        return empty;
    }
}

async function loadCalendarSmsContext(ev) {
    const officeAddress = String(
        await settingsService.getSetting('calendar', 'FIRM_OFFICE_ADDRESS', '') || ''
    ).trim();
    const firmWazeUrl = String(
        await settingsService.getSetting('calendar', 'FIRM_WAZE_URL', '') || ''
    ).trim();
    const firmMapsUrl = String(
        await settingsService.getSetting('calendar', 'FIRM_MAPS_URL', '') || ''
    ).trim();
    const meetingType = ev.meeting_type || ev.meetingType || '';
    const eventType = ev.event_type || ev.eventType || '';
    const placeMode = meetingPlaceMode(meetingType);
    const rawLocation = unwrapLocation(ev.location);
    // Phone: never location. Zoom: only explicit link (no office fallback).
    const locationForNav = placeMode === 'none' ? '' : rawLocation;
    const officeForNav = placeMode === 'place' ? officeAddress : '';
    const firmName = (await getFirmDisplayName()) || (await getLawFirmNameHe()) || 'המשרד';
    const firmPhone = String(
        await settingsService.getSetting('contact', 'WHATSAPP_PHONE', '')
        || process.env.FIRM_PHONE
        || ''
    ).trim();
    const domain = getWebsiteDomain();
    const websiteUrl = domain ? `https://${domain}` : (getPublicAppBase() || '');
    const nav = await buildShortNavUrls(locationForNav, {
        officeAddress: officeForNav,
        firmWazeUrl: placeMode === 'place' ? firmWazeUrl : '',
        firmMapsUrl: placeMode === 'place' ? firmMapsUrl : '',
        meetingType,
    });
    const rsvpUrl = ev.invite_token ? await buildShortRsvpUrl(ev.invite_token) : '';
    const isRemote = placeMode !== 'place' || Boolean(nav.isRemote);
    const locationLabel = placeMode === 'none'
        ? ''
        : (nav.label || remoteMeetingLabel(nav.address || locationForNav, meetingType));
    const eventTypeNorm = String(eventType || '').trim().toLowerCase();
    let reminderTemplateKey = String(ev.reminder_template_key || ev.reminderTemplateKey || '').trim();
    let reminderSubject = String(ev.reminder_subject || ev.reminderSubject || '').trim();
    let reminderTemplateLabel = String(ev.reminder_template_label || ev.reminderTemplateLabel || '').trim();
    if (eventTypeNorm === 'reminder' && ev.id && (!reminderTemplateKey || !reminderTemplateLabel)) {
        const meta = await resolveReminderMetaForEvent(ev.id);
        if (!reminderTemplateKey) reminderTemplateKey = meta.templateKey;
        if (!reminderSubject) reminderSubject = meta.subject;
        if (!reminderTemplateLabel) reminderTemplateLabel = meta.templateLabel;
    }
    const labelEventType = eventTypeNorm === 'reminder'
        ? 'reminder'
        : (usesHearingSmsTemplates(eventType) ? 'hearing' : eventType);
    const meetingTypeLabel = meetingTypeLabelHe(
        meetingType,
        labelEventType,
        ev.title || ev.event_title || '',
        reminderTemplateKey,
        reminderSubject,
        reminderTemplateLabel
    );
    const address = placeMode === 'none' ? '' : (nav.address || '');

    return {
        recipientName: String(ev.client_name || ev.lead_name || ev.recipient_name || '').trim() || 'לקוח/ה',
        clientsNames: formatClientsList(ev.clients_names || ev.client_names || ev.client_name || ev.lead_name),
        firmName,
        date: formatEventDate(ev.start_time),
        time: formatEventTime(ev.start_time),
        address,
        wazeUrl: placeMode === 'place' ? (nav.wazeUrl || '') : '',
        mapsUrl: placeMode === 'place' ? (nav.mapsUrl || '') : '',
        rsvpUrl,
        firmPhone,
        websiteUrl,
        lawyerName: String(ev.owner_name || '').trim() || 'עורך הדין',
        title: String(ev.title || 'פגישה').trim(),
        isRemoteMeeting: isRemote,
        locationLabel,
        meetingType: String(meetingType || '').trim(),
        meetingTypeLabel,
        placeMode,
    };
}

/** Strip place/nav lines that don't belong for the meeting type; fix Zoom wording. */
function polishCalendarSmsBody(body, ctx) {
    let out = String(body || '');
    const mt = String(ctx?.meetingType || '').toLowerCase();
    const placeMode = ctx?.placeMode || meetingPlaceMode(mt);
    const hasAddress = Boolean(String(ctx?.address || '').trim());

    if (placeMode === 'none' || !hasAddress) {
        out = out
            .replace(/כתובתנו\s+(?:הינה|היא)\s*[^\n]*/g, '')
            .replace(/^כתובת\s*:.*$/gm, '')
            .replace(/^מיקום\s*:.*$/gm, '')
            .replace(/^קישור לזום\s*:?\s*$/gm, '')
            .replace(/^קישור לפגישה\s*:?\s*$/gm, '')
            .replace(/^טלפון\s*:.*$/gm, '');
    } else if (placeMode === 'link' || ctx?.isRemoteMeeting) {
        const label = ctx.locationLabel || 'קישור לזום';
        if (ctx.address) {
            const esc = String(ctx.address).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            out = out.replace(
                new RegExp(`כתובתנו\\s+(?:הינה|היא)\\s+${esc}`, 'g'),
                `${label}: ${ctx.address}`
            );
        }
        out = out.replace(/כתובתנו\s+(?:הינה|היא)\s+/g, `${label}: `);
        out = out.replace(/^מיקום\s*:/gm, `${label}:`);
    }

    out = out
        .split('\n')
        .filter((line) => {
            const t = line.trim();
            if (!t) return true;
            if (/להוראות הגעה בוויז\s*:?\s*$/i.test(t)) return false;
            if ((placeMode !== 'place' || !hasAddress) && /להוראות הגעה בוויז/i.test(t)) return false;
            if ((placeMode !== 'place' || !hasAddress) && /^וויז\s*:/i.test(t)) return false;
            if ((placeMode !== 'place' || !hasAddress) && /^מפות\s*:/i.test(t)) return false;
            if (/^וויז\s*:?\s*$/i.test(t)) return false;
            if (/^מפות\s*:?\s*$/i.test(t)) return false;
            if (/^Waze\s*:?\s*$/i.test(t)) return false;
            if (/^Maps\s*:?\s*$/i.test(t)) return false;
            if (placeMode === 'none' && /^(מיקום|קישור לזום|קישור לפגישה|כתובת|כתובתנו)\b/i.test(t)) return false;
            // "כתובתנו הינה" / "כתובתנו היא" with nothing after
            if (/^כתובתנו\s+(?:הינה|היא)\s*\.?$/i.test(t)) return false;
            return true;
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');
    return out.trim();
}

async function getClientReminderTemplate(ev) {
    const eventType = String(ev.event_type || ev.eventType || '').toLowerCase();
    const override = upgradeLegacyCalendarSmsTemplate(String(ev.client_reminder_sms || '').trim());
    if (override) {
        return eventType === 'reminder'
            ? adaptClientReminderSmsForReminderEvent(override)
            : override;
    }
    if (eventType === 'reminder') {
        const stored = upgradeLegacyCalendarSmsTemplate(await settingsService.getSetting(
            'templates',
            'CALENDAR_CLIENT_REMINDER_SMS_REMINDER',
            ''
        ));
        const base = String(stored || '').trim() || DEFAULT_CLIENT_REMINDER_SMS_REMINDER;
        return adaptClientReminderSmsForReminderEvent(base);
    }
    if (usesHearingSmsTemplates(eventType)) {
        const hearingTpl = upgradeLegacyCalendarSmsTemplate(await settingsService.getSetting(
            'templates',
            'CALENDAR_CLIENT_REMINDER_SMS_HEARING',
            ''
        ));
        if (String(hearingTpl || '').trim()) return hearingTpl;
    }
    return upgradeLegacyCalendarSmsTemplate(await settingsService.getSetting(
        'templates',
        'CALENDAR_CLIENT_REMINDER_SMS',
        DEFAULT_CLIENT_REMINDER_SMS
    ));
}

async function getInviteSmsTemplate(ev) {
    const override = upgradeLegacyCalendarSmsTemplate(String(ev.invite_sms || '').trim());
    if (override) return override;
    const eventType = String(ev.event_type || ev.eventType || '').toLowerCase();
    if (usesHearingSmsTemplates(eventType)) {
        const hearingTpl = upgradeLegacyCalendarSmsTemplate(await settingsService.getSetting(
            'templates',
            'CALENDAR_INVITE_SMS_HEARING',
            ''
        ));
        if (String(hearingTpl || '').trim()) return hearingTpl;
    }
    return upgradeLegacyCalendarSmsTemplate(await settingsService.getSetting(
        'templates',
        'CALENDAR_INVITE_SMS',
        DEFAULT_INVITE_SMS
    ));
}

async function composeLawyerReminderMessage(offsetMinutes, ev) {
    const timeStr = formatEventTime(ev.start_time);
    // Prefer actual remaining time at send moment over the configured offset.
    const when = ev?.start_time
        ? formatRemainingHebrew(ev.start_time)
        : formatOffsetHebrew(offsetMinutes);
    const isReminderEvent = ev.event_type === 'reminder';
    const meetingType = ev.meeting_type || ev.meetingType || '';
    let reminderTemplateKey = String(ev.reminder_template_key || ev.reminderTemplateKey || '').trim();
    let reminderSubject = String(ev.reminder_subject || ev.reminderSubject || '').trim();
    let reminderTemplateLabel = String(ev.reminder_template_label || ev.reminderTemplateLabel || '').trim();
    if (isReminderEvent && ev.id && (!reminderTemplateKey || !reminderTemplateLabel)) {
        const meta = await resolveReminderMetaForEvent(ev.id);
        if (!reminderTemplateKey) reminderTemplateKey = meta.templateKey;
        if (!reminderSubject) reminderSubject = meta.subject;
        if (!reminderTemplateLabel) reminderTemplateLabel = meta.templateLabel;
    }
    const kind = meetingTypeLabelHe(
        meetingType,
        isReminderEvent ? 'reminder' : (ev.event_type || ev.eventType),
        ev.title || ev.event_title || '',
        reminderTemplateKey,
        reminderSubject,
        reminderTemplateLabel
    );
    const clientsLabel = formatClientsList(
        ev.clients_names
        || (ev.client_names ? String(ev.client_names) : null)
        || ev.client_name
    );
    const remainingMins = ev?.start_time ? minutesUntilStart(ev.start_time) : Number(offsetMinutes) || 0;
    const title = isReminderEvent
        ? 'תזכורת מהיומן'
        : (remainingMins >= 1440 ? `תזכורת ל${kind}` : `תזכורת ל${kind} קרובה`);
    const eventTitle = String(ev.title || '').trim();
    let body;
    if (isReminderEvent) {
        body = `${kind} — ${when} בשעה ${timeStr}`;
    } else if (clientsLabel) {
        const who = clientsLabel.includes(' ו-') || clientsLabel.includes(',') ? 'הלקוחות' : 'הלקוח';
        body = `${kind} עם ${who} ${clientsLabel} — ${when} בשעה ${timeStr}`;
    } else if (eventTitle) {
        body = `${kind}: ${eventTitle} — ${when} בשעה ${timeStr}`;
    } else {
        body = `${kind} — ${when} בשעה ${timeStr}`;
    }
    body += await buildShortNavLinksBlock(
        meetingPlaceMode(meetingType) === 'none' ? '' : ev.location,
        {
            officeAddress: meetingPlaceMode(meetingType) === 'place'
                ? String(await settingsService.getSetting('calendar', 'FIRM_OFFICE_ADDRESS', '') || '').trim()
                : '',
            firmWazeUrl: meetingPlaceMode(meetingType) === 'place'
                ? String(await settingsService.getSetting('calendar', 'FIRM_WAZE_URL', '') || '').trim()
                : '',
            firmMapsUrl: meetingPlaceMode(meetingType) === 'place'
                ? String(await settingsService.getSetting('calendar', 'FIRM_MAPS_URL', '') || '').trim()
                : '',
            meetingType,
        }
    );
    return { title, body, whenLabel: when, clientsLabel };
}

function formatClientsList(raw) {
    if (Array.isArray(raw)) {
        const list = [...new Set(raw.map((n) => String(n || '').trim()).filter(Boolean))];
        if (!list.length) return '';
        if (list.length === 1) return list[0];
        if (list.length === 2) return `${list[0]} ו-${list[1]}`;
        return `${list.slice(0, -1).join(', ')} ו-${list[list.length - 1]}`;
    }
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.includes(',') || s.includes(' ו-')) return s;
    return s;
}

async function composeClientReminderMessage(offsetMinutes, ev) {
    const ctx = await loadCalendarSmsContext(ev);
    const remainingMins = ev?.start_time ? minutesUntilStart(ev.start_time) : Number(offsetMinutes) || 0;
    ctx.when = ev?.start_time
        ? formatRemainingHebrew(ev.start_time)
        : formatOffsetHebrew(offsetMinutes);
    const template = await getClientReminderTemplate(ev);
    const body = polishCalendarSmsBody(renderTemplate(template, ctx).trim(), ctx);
    const kind = ctx.meetingTypeLabel || 'אירוע';
    const isReminderEvent = String(ev.event_type || ev.eventType || '').toLowerCase() === 'reminder';
    const title = isReminderEvent
        ? (remainingMins >= 1440 ? kind : `${kind} קרובה`)
        : (remainingMins >= 1440 ? `תזכורת ל${kind}` : `תזכורת ל${kind} קרובה`);
    const fallbackBody = isReminderEvent
        ? `${kind} בתאריך ${ctx.date} בשעה ${ctx.time}`
        : `תזכורת ל${kind} בתאריך ${ctx.date} בשעה ${ctx.time}`;
    return {
        title,
        body: body || fallbackBody,
        whenLabel: ctx.when,
    };
}

async function composeInviteSmsMessage(ev) {
    if (String(ev.event_type || ev.eventType || '').toLowerCase() === 'reminder') {
        return '';
    }
    const ctx = await loadCalendarSmsContext(ev);
    const template = await getInviteSmsTemplate(ev);
    const body = polishCalendarSmsBody(renderTemplate(template, ctx).trim(), ctx);
    return body || `הזמנה לפגישה בתאריך ${ctx.date} בשעה ${ctx.time}`;
}

module.exports = {
    DEFAULT_ALLOWED_OFFSETS,
    DEFAULT_ALLOWED_CHANNELS,
    REMINDABLE_EVENT_TYPES,
    MAX_OFFSETS_PER_EVENT,
    DEFAULT_CLIENT_REMINDER_SMS,
    DEFAULT_INVITE_SMS,
    parseOffsetsList,
    uniqueSortedDesc,
    loadAllowedReminderOffsets,
    loadAllowedReminderChannels,
    normalizeReminderOffsets,
    normalizeReminderChannels,
    offsetsToJson,
    channelsToJson,
    parseStoredOffsets,
    parseStoredSentOffsets,
    parseStoredSentKeys,
    sentKeysToJson,
    computeRemindersSentOnUpdate,
    shouldFireImmediateReminderOnUpdate,
    serializeRemindersSent,
    parseStoredChannels,
    defaultReminderChannels,
    defaultReminderTargets,
    parseReminderTargets,
    targetsToJson,
    hasAnyReminderChannel,
    formatOffsetHebrew,
    formatRemainingHebrew,
    minutesUntilStart,
    buildNavLinks,
    composeLawyerReminderMessage,
    composeClientReminderMessage,
    composeInviteSmsMessage,
    loadCalendarSmsContext,
    getClientReminderTemplate,
    getInviteSmsTemplate,
    formatClientsList,
};
