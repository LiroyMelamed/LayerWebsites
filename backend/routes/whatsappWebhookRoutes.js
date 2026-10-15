'use strict';
const express = require('express');
const crypto = require('node:crypto');
const scope = require('../lib/tenant/databaseScope');
const pool = require('../config/db');
const { worker, runOffice } = require('../services/integrations/runtime');
const { appSyncStatus } = require('../services/integrations/appSyncStatus');
const router = express.Router();
function equals(a, b) {
    const left = Buffer.from(String(a || '')), right = Buffer.from(String(b || ''));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}
router.get('/', (req, res) => {
    const secret = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (!secret || req.query['hub.mode'] !== 'subscribe' || !equals(req.query['hub.verify_token'], secret)) return res.sendStatus(403);
    res.type('text/plain').send(String(req.query['hub.challenge'] || ''));
});
router.post('/', express.raw({ type: 'application/json', limit: '20mb' }), async (req, res) => {
    const secret = process.env.WHATSAPP_META_APP_SECRET;
    if (!secret || !Buffer.isBuffer(req.body)) return res.sendStatus(403);
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    if (!equals(req.headers['x-hub-signature-256'], expected)) return res.sendStatus(403);
    let body;
    try { body = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
    if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return res.sendStatus(400);
    try {
        for (const entry of body.entry) for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
            const value = change.value, phoneId = String(value?.metadata?.phone_number_id || ''), wabaId = String(entry.id || '');
            if (change?.field === 'account_update' && value?.event === 'PARTNER_REMOVED') {
                const matches = await scope.withSystem(() => pool.query(`SELECT id,law_firm_tenant_id FROM office_integrations WHERE provider='whatsapp' AND waba_id=$1 AND secret_ciphertext IS NOT NULL`, [wabaId]));
                for (const c of matches.rows) await runOffice(c.law_firm_tenant_id, () => pool.query(`UPDATE office_integrations SET enabled=false,status='reauthorization_required',secret_ciphertext=NULL,updated_at=now() WHERE id=$1 AND waba_id=$2 AND law_firm_tenant_id IS NOT DISTINCT FROM $3`, [c.id, wabaId, c.law_firm_tenant_id]));
                continue;
            }
            const sync = appSyncStatus(change?.field, value);
            if (sync && phoneId && wabaId) {
                const matches = await scope.withSystem(() => pool.query(`SELECT id,law_firm_tenant_id FROM office_integrations WHERE provider='whatsapp' AND phone_number_id=$1 AND waba_id=$2 AND secret_ciphertext IS NOT NULL`, [phoneId, wabaId]));
                for (const c of matches.rows) await runOffice(c.law_firm_tenant_id, () => pool.query(`UPDATE office_integrations SET settings=jsonb_set(settings,'{appSync}',$4::jsonb),updated_at=now() WHERE id=$1 AND phone_number_id=$2 AND waba_id=$3 AND law_firm_tenant_id IS NOT DISTINCT FROM $5 AND secret_ciphertext IS NOT NULL AND settings->>'connectionType'='business_app'`, [c.id, phoneId, wabaId, JSON.stringify(sync), c.law_firm_tenant_id]));
            }
            // Contacts, echoes and other conversation data are acknowledged and discarded.
            if (change?.field !== 'group_lifecycle_update') continue;
            if (!Array.isArray(value?.groups) || value.groups.length > 100) continue;
            const connection = await scope.withSystem(() => pool.query(`SELECT id,law_firm_tenant_id FROM office_integrations WHERE provider='whatsapp' AND phone_number_id=$1 AND waba_id=$2 AND secret_ciphertext IS NOT NULL`, [phoneId, wabaId]));
            const c = connection.rows[0];
            if (c) await runOffice(c.law_firm_tenant_id, () => worker.receiveLifecycle(c.law_firm_tenant_id, c.id, wabaId, phoneId, value.groups));
        }
        res.sendStatus(200);
    } catch { res.sendStatus(503); } // Meta may retry; lifecycle handling is idempotent.
});
module.exports = router;
module.exports.equals = equals;
