'use strict';

/**
 * Per-event calendar push reminders + SMS template composition.
 */

const settingsService = require('../services/settingsService');
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
} = require('./publicShortLinks');

const DEFAULT_ALLOWED_OFFSETS = [0, 15, 30, 60, 120, 1440, 2880, 10080];
const DEFAULT_ALLOWED_CHANNELS = ['push', 'sms', 'email'];
const REMINDABLE_EVENT_TYPES = new Set(['appointment', 'hearing', 'reminder']);
const MAX_OFFSETS_PER_EVENT = 8;
const VALID_CHANNEL_KEYS = new Set(['push', 'sms', 'email']);

const DEFAULT_CLIENT_REMINDER_SMS =
    'שלום {{recipientName}},\n'
    + 'זוהי תזכורת לפגישה שנקבעה עבורך ב{{firmName}}\n'
    + 'בתאריך {{date}} בשעה {{time}}.\n'
    + 'כתובתנו הינה {{address}}\n'
    + 'להוראות הגעה בוויז {{wazeUrl}}\n'
    + 'לבירור או שינוי נא להתקשר ל {{firmPhone}}\n'
    + 'מידע נוסף ניתן למצוא באתר שלנו\n'
    + '{{websiteUrl}}';

const DEFAULT_INVITE_SMS =
    'שלום {{recipientName}}, נקבעה לך פגישה, בתאריך {{date}} בשעה {{time}},\n'
    + 'כתובתנו היא {{address}}. בברכה, {{firmName}},\n'
    + 'לאישור הגעה, אנא לחץ/י על הקישור {{rsvpUrl}}\n'
    + 'להוראות הגעה בוויז: {{wazeUrl}}\n'
    + 'לבירור או שינוי נא להתקשר ל {{firmPhone}}';

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
function buildNavLinks(location) {
    const q = String(location || '').trim();
    if (!q) return '';
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

function formatOffsetHebrew(minutes) {
    if (Number(minutes) === 0) return 'עכשיו';
    if (minutes >= 1440 && minutes % 1440 === 0) {
        const days = minutes / 1440;
        if (days === 1) return 'מחר';
        return `בעוד ${days} ימים`;
    }
    if (minutes >= 60 && minutes % 60 === 0) {
        const hours = minutes / 60;
        if (hours === 1) return 'בעוד שעה';
        return `בעוד ${hours} שעות`;
    }
    return `בעוד ${minutes} דקות`;
}

function formatEventDate(startTime) {
    return new Date(startTime).toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

function formatEventTime(startTime) {
    return new Date(startTime).toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
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
    const address = String(ev.location || '').trim() || officeAddress;
    const firmName = (await getFirmDisplayName()) || (await getLawFirmNameHe()) || 'המשרד';
    const firmPhone = String(
        await settingsService.getSetting('contact', 'WHATSAPP_PHONE', '')
        || process.env.FIRM_PHONE
        || ''
    ).trim();
    const domain = getWebsiteDomain();
    const websiteUrl = domain ? `https://${domain}` : (getPublicAppBase() || '');
    const nav = await buildShortNavUrls(address, {
        officeAddress,
        firmWazeUrl,
        firmMapsUrl,
    });
    const rsvpUrl = ev.invite_token ? await buildShortRsvpUrl(ev.invite_token) : '';

    return {
        recipientName: String(ev.client_name || ev.lead_name || ev.recipient_name || '').trim() || 'לקוח/ה',
        clientsNames: formatClientsList(ev.clients_names || ev.client_names || ev.client_name || ev.lead_name),
        firmName,
        date: formatEventDate(ev.start_time),
        time: formatEventTime(ev.start_time),
        address: nav.address || address,
        wazeUrl: nav.wazeUrl || rawWazeUrl(address),
        mapsUrl: nav.mapsUrl || rawMapsUrl(address),
        rsvpUrl,
        firmPhone,
        websiteUrl,
        lawyerName: String(ev.owner_name || '').trim() || 'עורך הדין',
        title: String(ev.title || 'פגישה').trim(),
    };
}

async function getClientReminderTemplate(ev) {
    const override = String(ev.client_reminder_sms || '').trim();
    if (override) return override;
    const eventType = String(ev.event_type || ev.eventType || '').toLowerCase();
    if (eventType === 'hearing') {
        const hearingTpl = await settingsService.getSetting(
            'templates',
            'CALENDAR_CLIENT_REMINDER_SMS_HEARING',
            ''
        );
        if (String(hearingTpl || '').trim()) return hearingTpl;
    }
    return settingsService.getSetting(
        'templates',
        'CALENDAR_CLIENT_REMINDER_SMS',
        DEFAULT_CLIENT_REMINDER_SMS
    );
}

async function getInviteSmsTemplate(ev) {
    const override = String(ev.invite_sms || '').trim();
    if (override) return override;
    const eventType = String(ev.event_type || ev.eventType || '').toLowerCase();
    if (eventType === 'hearing') {
        const hearingTpl = await settingsService.getSetting(
            'templates',
            'CALENDAR_INVITE_SMS_HEARING',
            ''
        );
        if (String(hearingTpl || '').trim()) return hearingTpl;
    }
    return settingsService.getSetting(
        'templates',
        'CALENDAR_INVITE_SMS',
        DEFAULT_INVITE_SMS
    );
}

async function composeLawyerReminderMessage(offsetMinutes, ev) {
    const timeStr = formatEventTime(ev.start_time);
    const when = formatOffsetHebrew(offsetMinutes);
    const isReminderEvent = ev.event_type === 'reminder';
    const clientsLabel = formatClientsList(
        ev.clients_names
        || (ev.client_names ? String(ev.client_names) : null)
        || ev.client_name
    );
    const title = isReminderEvent
        ? 'תזכורת מהיומן'
        : (offsetMinutes >= 1440 ? 'תזכורת לפגישה' : 'תזכורת לפגישה קרובה');
    let body = isReminderEvent
        ? `${ev.title || 'תזכורת'} — ${when} בשעה ${timeStr}`
        : (clientsLabel
            ? `פגישה עם ${clientsLabel.includes(' ו-') || clientsLabel.includes(',') ? 'הלקוחות' : 'הלקוח'} ${clientsLabel} — ${when} בשעה ${timeStr}`
            : `${ev.title} — ${when} בשעה ${timeStr}`);
    body += await buildShortNavLinksBlock(ev.location, {
        officeAddress: String(await settingsService.getSetting('calendar', 'FIRM_OFFICE_ADDRESS', '') || '').trim(),
        firmWazeUrl: String(await settingsService.getSetting('calendar', 'FIRM_WAZE_URL', '') || '').trim(),
        firmMapsUrl: String(await settingsService.getSetting('calendar', 'FIRM_MAPS_URL', '') || '').trim(),
    });
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
    const template = await getClientReminderTemplate(ev);
    const body = renderTemplate(template, ctx).trim();
    return {
        title: offsetMinutes >= 1440 ? 'תזכורת לפגישה' : 'תזכורת לפגישה קרובה',
        body: body || `תזכורת לפגישה בתאריך ${ctx.date} בשעה ${ctx.time}`,
    };
}

async function composeInviteSmsMessage(ev) {
    const ctx = await loadCalendarSmsContext(ev);
    const template = await getInviteSmsTemplate(ev);
    const body = renderTemplate(template, ctx).trim();
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
    parseStoredChannels,
    defaultReminderChannels,
    defaultReminderTargets,
    parseReminderTargets,
    targetsToJson,
    hasAnyReminderChannel,
    formatOffsetHebrew,
    buildNavLinks,
    composeLawyerReminderMessage,
    composeClientReminderMessage,
    composeInviteSmsMessage,
    loadCalendarSmsContext,
    getClientReminderTemplate,
    getInviteSmsTemplate,
    formatClientsList,
};
