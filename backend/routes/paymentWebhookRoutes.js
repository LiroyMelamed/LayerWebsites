const express = require('express');
const router = express.Router();
const billing = require('../lib/billing/firmBillingService');
const { assertBillingOperationsEnabled, respondIfBillingPaused } = require('../lib/billing/billingOperations');

async function handle(req, res) {
    const uniqId = String(
        req.query?.uniqId ||
        req.query?.orderUniqId ||
        req.body?.uniqId ||
        req.body?.UniqId ||
        ''
    ).trim();

    try {
        assertBillingOperationsEnabled();
        const result = await require('../lib/tenant/databaseScope').withSystem(() => billing.handleTakbullNotification({
            uniqId,
            query: { ...req.query, ...req.body },
        }));
        return res.status(200).json({ ok: true, ...result });
    } catch (e) {
        if (respondIfBillingPaused(res, e)) return;
        console.error('[takbull-webhook]', e?.message || e);
        return res.status(200).json({ ok: false, error: 'handler_failed' });
    }
}

router.get('/takbull', handle);
router.post('/takbull', handle);

module.exports = router;
