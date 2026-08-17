const express = require('express');
const router = express.Router();
const billing = require('../lib/billing/firmBillingService');

async function handle(req, res) {
    const uniqId = String(
        req.query?.uniqId ||
        req.query?.orderUniqId ||
        req.body?.uniqId ||
        req.body?.UniqId ||
        ''
    ).trim();

    try {
        const result = await billing.handleTakbullNotification({
            uniqId,
            query: { ...req.query, ...req.body },
        });
        return res.status(200).json({ ok: true, ...result });
    } catch (e) {
        console.error('[takbull-webhook]', e?.message || e);
        return res.status(200).json({ ok: false, error: 'handler_failed' });
    }
}

router.get('/takbull', handle);
router.post('/takbull', handle);

module.exports = router;
