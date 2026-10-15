/**
 * Per-event calendar push reminders.
 * Lawyers pick offsets (minutes before start) when creating/editing an event.
 * Platform admins configure which preset offsets are available.
 */

const DEFAULT_ALLOWED_OFFSETS = [15, 30, 60, 120, 1440];
const DEFAULT_ALLOWED_CHANNELS = ['push', 'sms', 'email'];
const REMINDABLE_EVENT_TYPES = new Set(['appointment', 'hearing', 'reminder']);
const MAX_OFFSETS_PER_EVENT = 8;
const VALID_CHANNEL_KEYS = new Set(['push', 'sms', 'email']);

function parseOffsetsList(raw) {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) {
        return raw
            .map((v) => parseInt(v, 10))
            .filter((n) => Number.isInteger(n) && n > 0);
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
            .filter((n) => Number.isInteger(n) && n > 0);
    }
    return [];
}

function uniqueSortedDesc(offsets) {
    return [...new Set(offsets)].sort((a, b) => b - a);
}

async function loadAllowedReminderOffsets(settingsService) {
    const raw = await settingsService.getSetting(
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

async function loadAllowedReminderChannels(settingsService) {
    const raw = await settingsService.getSetting(
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

function composeLawyerReminderMessage(offsetMinutes, ev) {
    const timeStr = new Date(ev.start_time).toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const when = formatOffsetHebrew(offsetMinutes);
    const isReminderEvent = ev.event_type === 'reminder';
    const audience = ev.client_name || null;
    const title = isReminderEvent
        ? 'תזכורת מהיומן'
        : (offsetMinutes >= 1440 ? 'תזכורת לפגישה' : 'תזכורת לפגישה קרובה');
    const body = isReminderEvent
        ? `${ev.title || 'תזכורת'} — ${when} בשעה ${timeStr}`
        : (audience
            ? `פגישה עם הלקוח ${audience} — ${when} בשעה ${timeStr}`
            : `${ev.title} — ${when} בשעה ${timeStr}`);
    return { title, body };
}

function composeClientReminderMessage(offsetMinutes, ev) {
    const timeStr = new Date(ev.start_time).toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const when = formatOffsetHebrew(offsetMinutes);
    const lawyer = ev.owner_name || 'עורך הדין';
    return {
        title: offsetMinutes >= 1440 ? 'תזכורת לפגישה' : 'תזכורת לפגישה קרובה',
        body: `פגישתך עם עו״ד ${lawyer} ${when} בשעה ${timeStr}`,
    };
}

module.exports = {
    DEFAULT_ALLOWED_OFFSETS,
    DEFAULT_ALLOWED_CHANNELS,
    REMINDABLE_EVENT_TYPES,
    MAX_OFFSETS_PER_EVENT,
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
    hasAnyReminderChannel,
    formatOffsetHebrew,
    composeLawyerReminderMessage,
    composeClientReminderMessage,
};
