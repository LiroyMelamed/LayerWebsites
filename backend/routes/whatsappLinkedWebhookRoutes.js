'use strict';
const express = require('express');
const crypto = require('node:crypto');
const { optOutPhone } = require('../services/integrations/whatsappContactPermissions');

const SESSION = /^off_[a-f0-9]{32}_[a-f0-9]{16}$/;
const STATUSES = new Set(['STOPPED', 'STARTING', 'SCAN_QR_CODE', 'WORKING', 'FAILED']);
function authenticated(raw, headers, secret) {
    if (!Buffer.isBuffer(raw) || typeof secret !== 'string' || Buffer.byteLength(secret) < 32 || headers['x-webhook-hmac-algorithm'] !== 'sha512') return false;
    const signature = headers['x-webhook-hmac'];
    if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/.test(signature)) return false;
    const expected = crypto.createHmac('sha512', secret).update(raw).digest();
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}
function validateLinkedEvent(body, now = Date.now()) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || !SESSION.test(body.session || '') ||
        typeof body.id !== 'string' || !/^[A-Za-z0-9_-]{4,128}$/.test(body.id) ||
        !Number.isSafeInteger(body.timestamp)) return { invalid: true };
    if (body.timestamp < now - 600000 || body.timestamp > now + 60000) return { expired: true };
    const base = { event: body.event, id: body.id, session: body.session, timestamp: body.timestamp };
    if (body.event === 'session.status') {
        if (!STATUSES.has(body.payload?.status)) return { invalid: true };
        if (body.payload.name !== undefined && body.payload.name !== body.session) return { invalid: true };
        const capping = body.payload.data?.messageCapping;
        const restricted = body.payload.restricted === true || body.payload.data?.reachoutTimelock?.isActive === true ||
            capping && typeof capping === 'object' && !Array.isArray(capping) && capping.cappingStatus !== 'NONE';
        return { body: { ...base, payload: { status: body.payload.status, ...(restricted ? { restricted: true } : {}) } } };
    }
    if (body.event === 'message') {
        const normalized = optOutPhone(body);
        // All chat content except a direct opt-out is acknowledged and discarded.
        if (!normalized) return { ignored: true };
        return { body: { ...base, payload: { from: normalized.slice(1) + '@c.us', fromMe: false, body: 'STOP' } } };
    }
    return { ignored: true };
}
function createWhatsappLinkedWebhookRouter(options = {}) {
    const env = options.env || process.env;
    const pool = options.pool || require('../config/db');
    const scope = options.scope || require('../lib/tenant/databaseScope');
    const runtime = options.service && options.runOffice ? options : require('../services/integrations/runtime');
    const service = options.service || runtime.service;
    const runOffice = options.runOffice || runtime.runOffice;
    const now = options.now || Date.now;
    const router = express.Router();
    router.post('/', express.raw({ type: 'application/json', limit: '64kb' }), async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!authenticated(req.body, req.headers, env.WHATSAPP_WAHA_WEBHOOK_SECRET)) return res.sendStatus(403);
        let body;
        try { body = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
        const validated = validateLinkedEvent(body, now());
        if (validated.invalid) return res.sendStatus(400);
        if (!validated.body) return res.sendStatus(200);
        try {
            // Callback headers/URL never select an office. Resolve only the exact
            // server-generated session currently held by a connected grant.
            const matches = await scope.withSystem(() => pool.query(`SELECT id,law_firm_tenant_id FROM office_integrations
                WHERE provider='whatsapp' AND settings->>'gateway'='waha' AND settings->>'sessionName'=$1
                AND secret_ciphertext IS NOT NULL`, [validated.body.session]));
            if (matches.rows.length !== 1) return res.sendStatus(200);
            const c = matches.rows[0];
            await runOffice(c.law_firm_tenant_id, () => service.receiveLinkedDeviceEvent(c.law_firm_tenant_id, c.id, validated.body, {
                payloadHash: crypto.createHash('sha256').update(req.body).digest('hex'),
            }));
            return res.sendStatus(200);
        } catch {
            // Retriable response; the service commits dedupe and effects together.
            return res.sendStatus(503);
        }
    });
    return router;
}
module.exports = { createWhatsappLinkedWebhookRouter, authenticated, validateLinkedEvent };
