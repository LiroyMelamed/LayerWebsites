'use strict';
const { createHash } = require('node:crypto');

// These are conservative initial operational budgets for this application.
// They are not WhatsApp guarantees, published provider limits, or a safe-send SLA.
const SAFETY_POLICY = Object.freeze({
    stage: 'INITIAL',
    groupIntervalMs: 5 * 60 * 1000,
    mutationIntervalMs: 20 * 1000,
    rollingWindowMs: 24 * 60 * 60 * 1000,
    maxGroupsPerWindow: 10,
    maxInvitesPerWindow: 50,
    recipientInviteCooldownMs: 60 * 60 * 1000,
});
const PAUSE_REASONS = new Set(['MANUAL_PAUSE', 'RESULT_UNKNOWN', 'PROVIDER_RATE_LIMIT',
    'PROVIDER_AUTH', 'PROVIDER_DISCONNECTED', 'PROVIDER_REJECTED', 'INVALID_SAFETY_STATE']);
const RATE_CODES = new Set([4, 17, 32, 613, 130429, 131048, 131056]);
const MAX_TIME = 8640000000000000 - SAFETY_POLICY.rollingWindowMs;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const record = value => object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const iso = value => new Date(value).toISOString();

function clockValue(value) {
    const ms = value === undefined ? Date.now() : value instanceof Date ? value.getTime() : value;
    return Number.isSafeInteger(ms) && ms >= 0 && ms <= MAX_TIME ? ms : null;
}
function timestamp(value) {
    if (typeof value !== 'string') return null;
    const ms = Date.parse(value);
    return Number.isSafeInteger(ms) && ms >= 0 && ms <= MAX_TIME && iso(ms) === value ? ms : null;
}
function emptyState() {
    return { version: 1, groups: [], invites: [], lastMutationAt: null, lastObservedAt: null,
        paused: false, reason: null, pausedAt: null };
}
const nullableTime = value => value === null || timestamp(value) !== null;
const sorted = values => values.every((value, i) => i === 0 || value >= values[i - 1]);

function readState(raw) {
    if (!record(raw)) return null;
    if (Object.keys(raw).length === 0) return emptyState();
    if (raw.version !== 1 || !Array.isArray(raw.groups) || !Array.isArray(raw.invites) ||
        raw.groups.length > SAFETY_POLICY.maxGroupsPerWindow || raw.invites.length > SAFETY_POLICY.maxInvitesPerWindow ||
        !nullableTime(raw.lastMutationAt) || !nullableTime(raw.lastObservedAt) ||
        typeof raw.paused !== 'boolean' || !nullableTime(raw.pausedAt)) return null;
    const groups = raw.groups.map(timestamp);
    const invites = raw.invites.map(entry => object(entry) && timestamp(entry.at) !== null &&
        typeof entry.recipientHash === 'string' && /^[a-f0-9]{64}$/.test(entry.recipientHash)
        ? { at: entry.at, recipientHash: entry.recipientHash } : null);
    if (groups.some(value => value === null) || invites.some(value => value === null) ||
        !sorted(groups) || !sorted(invites.map(entry => timestamp(entry.at)))) return null;
    if (raw.paused ? !PAUSE_REASONS.has(raw.reason) || raw.pausedAt === null : raw.reason !== null || raw.pausedAt !== null) return null;
    const eventTimes = [...groups, ...invites.map(entry => timestamp(entry.at))];
    const mutation = raw.lastMutationAt === null ? null : timestamp(raw.lastMutationAt);
    const observed = raw.lastObservedAt === null ? null : timestamp(raw.lastObservedAt);
    const pausedAt = raw.pausedAt === null ? null : timestamp(raw.pausedAt);
    if (eventTimes.length ? mutation === null || mutation !== Math.max(...eventTimes) : mutation !== null) return null;
    if ((mutation !== null || pausedAt !== null) && (observed === null || observed < Math.max(mutation ?? 0, pausedAt ?? 0))) return null;
    // Rebuild only known, validated fields. Provider metadata is never retained.
    return { version: 1, groups: raw.groups.slice(), invites, lastMutationAt: raw.lastMutationAt,
        lastObservedAt: raw.lastObservedAt, paused: raw.paused, reason: raw.reason, pausedAt: raw.pausedAt };
}

function invalidState(raw, now) {
    // Keep bounded trustworthy fragments for diagnosis. Missing/malformed history
    // cannot be reconstructed; INVALID_SAFETY_STATE is therefore not resumable.
    const state = emptyState();
    if (object(raw)) {
        if (Array.isArray(raw.groups)) state.groups = raw.groups.filter(value => timestamp(value) !== null)
            .sort((a, b) => timestamp(a) - timestamp(b)).slice(-SAFETY_POLICY.maxGroupsPerWindow);
        if (Array.isArray(raw.invites)) state.invites = raw.invites.filter(entry => object(entry) &&
            timestamp(entry.at) !== null && typeof entry.recipientHash === 'string' && /^[a-f0-9]{64}$/.test(entry.recipientHash))
            .map(entry => ({ at: entry.at, recipientHash: entry.recipientHash }))
            .sort((a, b) => timestamp(a.at) - timestamp(b.at)).slice(-SAFETY_POLICY.maxInvitesPerWindow);
    }
    const times = [...state.groups.map(timestamp), ...state.invites.map(entry => timestamp(entry.at))];
    if (object(raw) && timestamp(raw.lastMutationAt) !== null) times.push(timestamp(raw.lastMutationAt));
    if (times.length) state.lastMutationAt = iso(Math.max(...times));
    const observed = object(raw) ? timestamp(raw.lastObservedAt) : null;
    state.lastObservedAt = iso(Math.max(now, observed ?? 0, ...times));
    state.paused = true;
    state.reason = 'INVALID_SAFETY_STATE';
    state.pausedAt = iso(now);
    return state;
}
function loadState(raw, now) {
    return now === null ? invalidState(raw, Date.now()) : readState(raw) || invalidState(raw, now);
}
function activeHistory(state, now) {
    const cutoff = now - SAFETY_POLICY.rollingWindowMs;
    return { groups: state.groups.filter(value => timestamp(value) > cutoff),
        invites: state.invites.filter(entry => timestamp(entry.at) > cutoff) };
}
function recipientHash(phone) {
    if (typeof phone !== 'string') return null;
    let value = phone.normalize('NFKC').trim().replace(/[\s()-]/g, '');
    if (/^0[2-9]\d{7,8}$/.test(value)) value = '+972' + value.slice(1);
    if (/^972[2-9]\d{7,8}$/.test(value)) value = '+' + value;
    if (/^00[1-9]\d{7,14}$/.test(value)) value = '+' + value.slice(2);
    if (!/^\+[1-9]\d{7,14}$/.test(value)) return null;
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
function nextConstraint(state, kind, now, hash) {
    const { groups, invites } = activeHistory(state, now);
    const constraints = [];
    if (state.lastObservedAt !== null) constraints.push({ reason: 'CLOCK_ROLLBACK', at: timestamp(state.lastObservedAt) });
    if (state.lastMutationAt !== null) constraints.push({ reason: 'MUTATION_INTERVAL', at: timestamp(state.lastMutationAt) + SAFETY_POLICY.mutationIntervalMs });
    if (kind === 'group') {
        if (groups.length) constraints.push({ reason: 'GROUP_INTERVAL', at: timestamp(groups[groups.length - 1]) + SAFETY_POLICY.groupIntervalMs });
        if (groups.length >= SAFETY_POLICY.maxGroupsPerWindow) constraints.push({ reason: 'GROUP_BUDGET', at: timestamp(groups[0]) + SAFETY_POLICY.rollingWindowMs });
    } else {
        if (invites.length >= SAFETY_POLICY.maxInvitesPerWindow) constraints.push({ reason: 'INVITE_BUDGET', at: timestamp(invites[0].at) + SAFETY_POLICY.rollingWindowMs });
        const previous = hash && invites.filter(entry => entry.recipientHash === hash).at(-1);
        if (previous) constraints.push({ reason: 'RECIPIENT_COOLDOWN', at: timestamp(previous.at) + SAFETY_POLICY.recipientInviteCooldownMs });
    }
    return constraints.filter(item => item.at > now).reduce((latest, item) => !latest || item.at > latest.at ? item : latest, null);
}

// Call under the shared connection's database lock, and persist state before the
// provider call. A reservation is consumed even when the result is rejected or
// unknown; there is deliberately no refund or automatic retry operation.
function reserveSafety(rawState, { kind, phone, now: suppliedNow } = {}) {
    const now = clockValue(suppliedNow);
    const state = loadState(rawState, now);
    const denied = (reason, retryAt = null) => ({ allowed: false, state, reason, retryAt });
    if (state.paused) return denied(state.reason);
    const hash = kind === 'invite' ? recipientHash(phone) : null;
    if (!['group', 'invite'].includes(kind) || (kind === 'invite' && !hash)) return denied('INVALID_SAFETY_OPERATION');
    const constraint = nextConstraint(state, kind, now, hash);
    state.lastObservedAt = iso(Math.max(now, timestamp(state.lastObservedAt) ?? 0));
    if (constraint) return denied(constraint.reason, iso(constraint.at));
    const history = activeHistory(state, now);
    state.groups = history.groups;
    state.invites = history.invites;
    if (kind === 'group') state.groups.push(iso(now));
    else state.invites.push({ at: iso(now), recipientHash: hash });
    state.lastMutationAt = iso(now);
    return { allowed: true, state, reason: null, retryAt: null };
}

// Extend the already-counted reservation to the actual dispatch time. The
// connection's durable dispatch claim fences other reservations until completion.
function markDispatchSafety(rawState, { kind, phone, reservedAt, now: suppliedNow } = {}) {
    const now = clockValue(suppliedNow);
    const state = loadState(rawState, now);
    const result = (allowed, reason = null, retryAt = null) => ({ allowed, state, reason, retryAt });
    if (state.paused) return result(false, state.reason);
    const hash = kind === 'invite' ? recipientHash(phone) : null;
    const event = kind === 'group' ? state.groups.at(-1) : state.invites.at(-1);
    if (timestamp(reservedAt) === null || state.lastMutationAt !== reservedAt ||
        !['group', 'invite'].includes(kind) ||
        (kind === 'group' ? event !== reservedAt : !hash || event?.at !== reservedAt || event.recipientHash !== hash)) {
        const invalid = invalidState(state, now);
        return { allowed: false, state: invalid, reason: invalid.reason, retryAt: null };
    }
    const highWater = timestamp(state.lastObservedAt);
    if (now < highWater) return result(false, 'CLOCK_ROLLBACK', iso(highWater));
    if (kind === 'group') state.groups[state.groups.length - 1] = iso(now);
    else event.at = iso(now);
    state.lastMutationAt = iso(now);
    state.lastObservedAt = iso(now);
    return result(true);
}

function pauseSafety(rawState, reason = 'MANUAL_PAUSE', suppliedNow) {
    const now = clockValue(suppliedNow);
    const state = loadState(rawState, now);
    if (state.paused) return state;
    state.paused = true;
    state.reason = PAUSE_REASONS.has(reason) ? reason : 'RESULT_UNKNOWN';
    state.pausedAt = iso(now);
    state.lastObservedAt = iso(Math.max(now, timestamp(state.lastObservedAt) ?? 0));
    return state;
}
function resumeSafety(rawState, suppliedNow) {
    const state = loadState(rawState, clockValue(suppliedNow));
    if (state.reason === 'INVALID_SAFETY_STATE') return state;
    state.paused = false;
    state.reason = null;
    state.pausedAt = null;
    return state;
}
function publicSafety(rawState, suppliedNow) {
    const now = clockValue(suppliedNow);
    const state = loadState(rawState, now);
    const history = activeHistory(state, now ?? Date.now());
    const nextAt = kind => state.paused ? null : nextConstraint(state, kind, now)?.at;
    const group = nextAt('group'), invite = nextAt('invite');
    return { paused: state.paused, reason: state.reason, pausedAt: state.pausedAt,
        counts: { groups: history.groups.length, invites: history.invites.length },
        // null means available now (or manual intervention when paused).
        // Without a recipient, nextInviteAt excludes recipient-specific cooldown.
        nextGroupAt: group === undefined || group === null ? null : iso(group),
        nextInviteAt: invite === undefined || invite === null ? null : iso(invite),
        policy: SAFETY_POLICY };
}

function integer(value) {
    return (typeof value === 'number' || typeof value === 'string' && /^\d{1,9}$/.test(value)) &&
        Number.isSafeInteger(Number(value)) ? Number(value) : null;
}
function normalizeFailure(error) {
    if (!object(error)) return { reason: 'RESULT_UNKNOWN', uncertain: true };
    const status = integer(error.providerStatus ?? error.statusCode ?? error.status ?? error.response?.status);
    const code = integer(error.providerCode ?? error.response?.data?.error?.code ?? error.code);
    const uncertain = error.uncertain === true || (status !== null && status >= 500);
    const typed = PAUSE_REASONS.has(error.safetyReason) && error.safetyReason !== 'INVALID_SAFETY_STATE' ? error.safetyReason : null;
    if (typed) return { reason: typed, uncertain: uncertain || typed === 'RESULT_UNKNOWN' };
    if (error.connected === false || error.connectionStatus === 'disconnected') return { reason: 'PROVIDER_DISCONNECTED', uncertain };
    if (RATE_CODES.has(code) || status === 429) return { reason: 'PROVIDER_RATE_LIMIT', uncertain };
    if (code === 190 || status === 401) return { reason: 'PROVIDER_AUTH', uncertain };
    if (uncertain) return { reason: 'RESULT_UNKNOWN', uncertain: true };
    if ((status !== null && status >= 400 && status < 500) || (code !== null && code >= 0)) return { reason: 'PROVIDER_REJECTED', uncertain: false };
    // A timeout, transport failure, or arbitrary error message does not establish
    // that the remote mutation failed. Never classify by provider message text.
    return { reason: 'RESULT_UNKNOWN', uncertain: true };
}

module.exports = { SAFETY_POLICY, reserveSafety, markDispatchSafety, pauseSafety, resumeSafety, publicSafety, normalizeFailure };
