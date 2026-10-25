'use strict';

const { createHash, createHmac } = require('node:crypto');

const CENTRAL_ORIGIN = 'https://central-api.mela-media.co.il';
const MESSAGE_PATH = '/api/v1/intake/system-messages';
const CONSENT_PATH = MESSAGE_PATH + '/consent';
const MESSAGE_ENDPOINT = CENTRAL_ORIGIN + MESSAGE_PATH;
const PATHS = new Set([MESSAGE_PATH, CONSENT_PATH]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PRODUCT_IDS = new Set(['barberbooking', 'flygift', 'layerwebsites', 'lawyerapp', 'melamotion', 'contractor-monitor', 'mela-media', 'melamatch', 'ironman', 'central-platform']);
const MESSAGE_FIELDS = ['version', 'eventId', 'productId', 'occurredAt', 'expiresAt', 'recipient', 'recipientName', 'consent', 'message'];
const CONSENT_FIELDS = ['version', 'eventId', 'productId', 'recipient', 'optedIn', 'capturedAt', 'proofRef', 'scope'];
const MAX_BODY_BYTES = 16_384;
const MESSAGE_STATUSES = new Set(['pending', 'sending', 'accepted', 'sent', 'delivered', 'read', 'failed', 'uncertain', 'expired', 'cancelled']);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value, allowed, required = allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail('SYSTEM_MESSAGE_PAYLOAD_INVALID');
}
function dateTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function label(value, max) {
  return typeof value === 'string' && value === value.trim() && value.length >= 1 && value.length <= max && !/[\p{Cc}\p{Cf}<>]|(?:https?:|www\.|@)/iu.test(value);
}
function reference(value) {
  return typeof value === 'string' && /^[\p{L}\p{N} _./:#-]{1,80}$/u.test(value) && !/(?:https?:|www\.)/i.test(value);
}
function validatePayload(value, path) {
  keys(value, path === CONSENT_PATH ? CONSENT_FIELDS : MESSAGE_FIELDS);
  if (value.version !== 1 || !UUID.test(value.eventId) || !PRODUCT_IDS.has(value.productId) || typeof value.recipient !== 'string' || !/^\+[1-9]\d{7,14}$/.test(value.recipient)) fail('SYSTEM_MESSAGE_PAYLOAD_INVALID');
  if (path === CONSENT_PATH) {
    if (typeof value.optedIn !== 'boolean' || !dateTime(value.capturedAt) || !reference(value.proofRef) || value.scope !== 'transactional') fail('SYSTEM_MESSAGE_PAYLOAD_INVALID');
    return;
  }
  if (!dateTime(value.occurredAt) || !dateTime(value.expiresAt) || !label(value.recipientName, 96)) fail('SYSTEM_MESSAGE_PAYLOAD_INVALID');
  if (Date.parse(value.expiresAt) <= Date.parse(value.occurredAt) || Date.parse(value.expiresAt) > Date.parse(value.occurredAt) + 86_400_000) fail('SYSTEM_MESSAGE_PAYLOAD_INVALID');
  keys(value.consent, ['optedIn', 'capturedAt', 'proofRef', 'scope']);
  if (value.consent.optedIn !== true || !dateTime(value.consent.capturedAt) || !reference(value.consent.proofRef) || value.consent.scope !== 'transactional') fail('SYSTEM_MESSAGE_CONSENT_REQUIRED');
  const message = value.message;
  if (!object(message)) fail('SYSTEM_MESSAGE_PAYLOAD_INVALID');
  if (message.kind === 'payment_received' || message.kind === 'payment_due') {
    keys(message, ['kind', 'amountCents', 'currency', 'reference', ...(message.kind === 'payment_due' ? ['dueOn'] : [])]);
    if (!Number.isSafeInteger(message.amountCents) || message.amountCents <= 0 || message.amountCents > 100_000_000 || !['ILS', 'USD'].includes(message.currency) || !reference(message.reference) || (message.kind === 'payment_due' && !date(message.dueOn))) fail('SYSTEM_MESSAGE_PAYLOAD_INVALID');
  } else if (message.kind === 'subscription_update') {
    keys(message, ['kind', 'status', 'planLabel', 'periodEndsOn']);
    if (!['active', 'paused', 'cancelled', 'renewal_due'].includes(message.status) || !label(message.planLabel, 64) || !date(message.periodEndsOn)) fail('SYSTEM_MESSAGE_PAYLOAD_INVALID');
  } else if (message.kind === 'system_notice') {
    keys(message, ['kind', 'notice', 'reference', 'effectiveAt'], ['kind', 'notice', 'reference']);
    if (!['support_received', 'support_updated', 'maintenance_scheduled', 'service_restored'].includes(message.notice) || !reference(message.reference)) fail('SYSTEM_MESSAGE_PAYLOAD_INVALID');
    if (message.notice === 'maintenance_scheduled' ? !dateTime(message.effectiveAt) : Object.hasOwn(message, 'effectiveAt')) fail('SYSTEM_MESSAGE_PAYLOAD_INVALID');
  } else fail('SYSTEM_MESSAGE_PAYLOAD_INVALID');
}
const sha256 = body => createHash('sha256').update(body, 'utf8').digest('hex');

/** Snapshot immutable UTF-8 bytes before storing the producer's own durable outbox row. */
function prepare(value, path) {
  let body, parsed;
  try { body = JSON.stringify(value); parsed = JSON.parse(body); } catch { fail('SYSTEM_MESSAGE_PAYLOAD_INVALID'); }
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) fail('SYSTEM_MESSAGE_PAYLOAD_TOO_LARGE');
  validatePayload(parsed, path);
  return Object.freeze({ version: 1, path, eventId: parsed.eventId, body, bodySha256: sha256(body) });
}
const prepareMessage = value => prepare(value, MESSAGE_PATH);
const prepareConsent = value => prepare(value, CONSENT_PATH);

/** Restore bytes exactly; never regenerate an event ID, timestamp or payment value on retry. */
function restorePreparedEvent(value) {
  keys(value, ['version', 'path', 'eventId', 'body', 'bodySha256']);
  if (value.version !== 1 || !PATHS.has(value.path) || !UUID.test(value.eventId) || typeof value.body !== 'string' || Buffer.byteLength(value.body, 'utf8') > MAX_BODY_BYTES || !/^[a-f0-9]{64}$/.test(value.bodySha256) || sha256(value.body) !== value.bodySha256) fail('SYSTEM_MESSAGE_STORED_EVENT_INVALID');
  let parsed;
  try { parsed = JSON.parse(value.body); } catch { fail('SYSTEM_MESSAGE_STORED_EVENT_INVALID'); }
  validatePayload(parsed, value.path);
  if (parsed.eventId !== value.eventId) fail('SYSTEM_MESSAGE_STORED_EVENT_INVALID');
  return Object.freeze({ ...value });
}

function validateConfig({ deployment, secret, endpoint = MESSAGE_ENDPOINT }) {
  if (typeof deployment !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(deployment)) fail('SYSTEM_MESSAGE_DEPLOYMENT_INVALID');
  if (typeof secret !== 'string' || secret.length < 32 || secret.length > 8192) fail('SYSTEM_MESSAGE_KEY_INVALID');
  // A producer token must never be sent to arbitrary origins, redirects or URLs.
  if (endpoint !== MESSAGE_ENDPOINT) fail('SYSTEM_MESSAGE_ENDPOINT_INVALID');
}

function signRequest({ deployment, secret, timestamp, path = MESSAGE_PATH, body }) {
  validateConfig({ deployment, secret });
  if (!PATHS.has(path) || typeof timestamp !== 'string' || !/^\d{13}$/.test(timestamp) || typeof body !== 'string' || Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) fail('SYSTEM_MESSAGE_SIGNING_INPUT_INVALID');
  return 'sha256=' + createHmac('sha256', secret).update(`central-system-v1\n${deployment}\n${timestamp}\nPOST\n${path}\n`, 'utf8').update(body, 'utf8').digest('hex');
}

/** A single enqueue attempt only; persistence, retry scheduling and payment verification belong to the producer. */
function createSystemMessagesClient(options) {
  validateConfig(options ?? {});
  const { deployment, secret, timeoutMs = 10_000, fetchImpl = globalThis.fetch, now = Date.now } = options;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000 || typeof fetchImpl !== 'function' || typeof now !== 'function') fail('SYSTEM_MESSAGE_CLIENT_CONFIG_INVALID');
  async function attempt(storedEvent) {
    const prepared = restorePreparedEvent(storedEvent);
    const timestamp = String(now());
    const signature = signRequest({ deployment, secret, timestamp, path: prepared.path, body: prepared.body });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(CENTRAL_ORIGIN + prepared.path, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-system-deployment': deployment, 'x-system-timestamp': timestamp, 'x-system-signature': signature },
        body: prepared.body,
      });
    } catch {
      clearTimeout(timer);
      // The request may have committed. Only the identical event may be manually retried.
      return Object.freeze({ state: 'acceptance_unknown', eventId: prepared.eventId, canRetrySameEvent: true, code: 'CENTRAL_ENQUEUE_OUTCOME_UNKNOWN' });
    }
    try {
    const httpStatus = Number(response?.status);
    // Never expose or log provider response bodies, phone numbers or request secrets.
    if (httpStatus === 200 || httpStatus === 202) {
      let receipt;
      try { receipt = await response.json(); } catch { /* A successful commit may have an unreadable response. */ }
      if (prepared.path === MESSAGE_PATH && receipt && typeof receipt.id === 'string' && UUID.test(receipt.id) && MESSAGE_STATUSES.has(receipt.status) && typeof receipt.replayed === 'boolean') {
        return Object.freeze({ state: 'accepted', eventId: prepared.eventId, id: receipt.id, status: receipt.status, replayed: receipt.replayed, httpStatus, canRetrySameEvent: false });
      }
      if (prepared.path === CONSENT_PATH && receipt?.ok === true && typeof receipt.replayed === 'boolean') return Object.freeze({ state: 'accepted', eventId: prepared.eventId, replayed: receipt.replayed, httpStatus, canRetrySameEvent: false });
      return Object.freeze({ state: 'acceptance_unknown', eventId: prepared.eventId, httpStatus, canRetrySameEvent: true, code: 'CENTRAL_RECEIPT_INVALID' });
    }
    // 408/5xx may be emitted by a gateway after Central has already committed.
    const uncertain = httpStatus === 408 || httpStatus >= 500 || !Number.isInteger(httpStatus);
    return Object.freeze({ state: uncertain ? 'acceptance_unknown' : 'rejected', eventId: prepared.eventId, httpStatus: Number.isInteger(httpStatus) ? httpStatus : 0, canRetrySameEvent: uncertain || httpStatus === 429, code: uncertain ? 'CENTRAL_ENQUEUE_OUTCOME_UNKNOWN' : `CENTRAL_ENQUEUE_REJECTED_${httpStatus}` });
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({ attempt });
}

module.exports = { CENTRAL_ORIGIN, MESSAGE_PATH, CONSENT_PATH, MESSAGE_ENDPOINT, prepareMessage, prepareConsent, restorePreparedEvent, signRequest, createSystemMessagesClient };
