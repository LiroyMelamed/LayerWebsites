/** Per-event calendar reminder presets (minutes before start). */

export const REMINDER_CHANNEL_OPTIONS = [
    { key: "push", labelKey: "calendar.reminderChannelPush" },
    { key: "sms", labelKey: "calendar.reminderChannelSms" },
    { key: "email", labelKey: "calendar.reminderChannelEmail" },
];

const DEFAULT_ALLOWED_CHANNELS = ["push", "sms", "email"];

export const REMINDER_PRESETS = [
    { minutes: 0, labelKey: "calendar.reminderImmediate" },
    { minutes: 15, labelKey: "calendar.reminder15m" },
    { minutes: 30, labelKey: "calendar.reminder30m" },
    { minutes: 60, labelKey: "calendar.reminder1h" },
    { minutes: 120, labelKey: "calendar.reminder2h" },
    { minutes: 1440, labelKey: "calendar.reminder1d" },
    { minutes: 2880, labelKey: "calendar.reminder2d" },
    { minutes: 10080, labelKey: "calendar.reminder1w" },
];

const DEFAULT_ALLOWED = [0, 15, 30, 60, 120, 1440, 2880, 10080];

/** Yellow-marked create defaults: 30m, 1h, 2h, 1d, 2d (not 15m / 1w). */
export const DEFAULT_CREATE_REMINDER_OFFSETS = [30, 60, 120, 1440, 2880];

/** Default offsets selected on new appointment/hearing create. */
export function defaultReminderOffsets(allowedMinutes = DEFAULT_ALLOWED) {
    return normalizeSelectedOffsets(DEFAULT_CREATE_REMINDER_OFFSETS, allowedMinutes);
}

/** Default channels on new create — push + SMS (managers get notified even without a client). */
export function defaultReminderChannels(allowedKeys = DEFAULT_ALLOWED_CHANNELS) {
    return normalizeSelectedChannels({ push: true, sms: true, email: false }, allowedKeys);
}

export function defaultReminderTargets() {
    return { client: true, managers: true };
}

export function parseReminderTargets(raw) {
    if (!raw || typeof raw !== 'object') return defaultReminderTargets();
    return {
        client: raw.client !== false && raw.client !== 'false' && raw.client !== 0,
        managers: raw.managers !== false && raw.managers !== 'false' && raw.managers !== 0,
    };
}

export function parseOffsetsList(raw) {
    if (raw == null || raw === "") return [];
    if (Array.isArray(raw)) {
        return raw.map((v) => parseInt(v, 10)).filter((n) => Number.isInteger(n) && n >= 0);
    }
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith("[")) {
            try {
                return parseOffsetsList(JSON.parse(trimmed));
            } catch {
                return [];
            }
        }
        return trimmed
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => Number.isInteger(n) && n >= 0);
    }
    return [];
}

export function parseAllowedOptionsFromSettings(calSettings = {}) {
    const raw = calSettings?.CALENDAR_REMINDER_OPTIONS?.effectiveValue;
    const parsed = parseOffsetsList(raw);
    return parsed.length ? parsed : DEFAULT_ALLOWED;
}

export function presetsForAllowedMinutes(allowedMinutes) {
    const allowed = new Set(parseOffsetsList(allowedMinutes));
    return REMINDER_PRESETS.filter((p) => allowed.has(p.minutes));
}

export function normalizeSelectedOffsets(selected, allowedMinutes) {
    const allowed = new Set(parseOffsetsList(allowedMinutes));
    return [...new Set(parseOffsetsList(selected))]
        .filter((n) => allowed.has(n))
        .sort((a, b) => b - a);
}

export function parseChannelsList(raw) {
    if (raw == null || raw === "") return [];
    if (Array.isArray(raw)) {
        return raw.map((v) => String(v).trim().toLowerCase()).filter((k) => DEFAULT_ALLOWED_CHANNELS.includes(k));
    }
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith("{")) {
            try {
                const parsed = JSON.parse(trimmed);
                return Object.entries(parsed)
                    .filter(([k, v]) => DEFAULT_ALLOWED_CHANNELS.includes(k) && (v === true || v === "true" || v === 1))
                    .map(([k]) => k);
            } catch {
                return [];
            }
        }
        return trimmed
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter((k) => DEFAULT_ALLOWED_CHANNELS.includes(k));
    }
    if (typeof raw === "object") {
        return Object.entries(raw)
            .filter(([k, v]) => DEFAULT_ALLOWED_CHANNELS.includes(k) && (v === true || v === "true" || v === 1))
            .map(([k]) => k);
    }
    return [];
}

export function parseStoredChannels(raw) {
    if (!raw || typeof raw !== "object") {
        return { push: false, sms: false, email: false };
    }
    return {
        push: raw.push === true || raw.push === "true",
        sms: raw.sms === true || raw.sms === "true",
        email: raw.email === true || raw.email === "true",
    };
}

export function parseAllowedChannelsFromSettings(calSettings = {}) {
    const raw = calSettings?.CALENDAR_REMINDER_CHANNELS?.effectiveValue;
    const parsed = parseChannelsList(raw);
    return parsed.length ? parsed : DEFAULT_ALLOWED_CHANNELS;
}

export function channelsForAllowedKeys(allowedKeys) {
    const allowed = new Set(parseChannelsList(allowedKeys));
    return REMINDER_CHANNEL_OPTIONS.filter((c) => allowed.has(c.key));
}

/** Channel chips follow platform CALENDAR_REMINDER_CHANNELS for every event type. */
export function channelsForEventType(_eventType, allowedKeys) {
    return channelsForAllowedKeys(allowedKeys);
}

export function normalizeChannelsForEventType(_eventType, selected, allowedKeys) {
    return normalizeSelectedChannels(selected, allowedKeys);
}

export function normalizeSelectedChannels(selected, allowedKeys) {
    const allowed = new Set(parseChannelsList(allowedKeys));
    const src = parseStoredChannels(selected);
    return {
        push: allowed.has("push") && src.push,
        sms: allowed.has("sms") && src.sms,
        email: allowed.has("email") && src.email,
    };
}

export function hasAnyReminderChannel(channels) {
    const c = parseStoredChannels(channels);
    return c.push || c.sms || c.email;
}
