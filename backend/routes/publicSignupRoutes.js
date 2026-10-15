const { readSignupLogo } = require('../lib/tenant/signupLogo');
const express = require('express');
const controller = require('../controllers/publicSignupController');
const { createRateLimitMiddleware, getClientIp } = require('../utils/rateLimiter');
const router = express.Router();
const trustProxy = process.env.TRUST_PROXY === 'true';
const limit = (name, max, windowMs) => createRateLimitMiddleware({
    name, max: String(max), windowMs: String(windowMs), trustProxy,
    message: 'יותר מדי ניסיונות. המתינו ונסו שוב; אין צורך לבצע תשלום נוסף.',
    keyFn: req => getClientIp(req, { trustProxy }),
});
// Polling and returning from the provider must not consume the signup-creation budget.
const startLimit = limit('signup-create', process.env.RATE_LIMIT_SIGNUP_MAX || 20, process.env.RATE_LIMIT_SIGNUP_WINDOW_MS || 3600000);
const checkoutLimit = limit('signup-checkout', 30, 3600000);
const verifyLimit = limit('signup-verify', 60, 3600000);
const statusLimit = limit('signup-status', 120, 60000);
router.get('/logos/:id/:file', async(req,res)=>{try { const data=await readSignupLogo(req.params.id,req.params.file);res.set({'Content-Type':'image/png','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=86400'});return res.send(data); } catch {return res.status(404).end();} });
router.get('/branding/:slug/logo', async(req,res)=>{
    try {
        const tenant=await require('../lib/tenant/tenantService').getTenantBySlug(req.params.slug);
        const match=/^signup-logos\/([a-f0-9-]{36})\/([a-f0-9]{64}\.png)$/.exec(tenant?.branding?.logoAsset?.key || '');
        if (!match) return res.redirect(require('../lib/billing/tenantBillingDefaults').getFrontendBaseUrl() + '/firm-logo.png');
        const data=await readSignupLogo(match[1],match[2]);
        return res.set({'Content-Type':'image/png','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=300'}).send(data);
    } catch { return res.status(404).end(); }
});
router.get('/config', controller.getSignupConfiguration);

router.post('/start', startLimit, controller.startSignup);
router.post('/:intentId/complete', checkoutLimit, controller.completeSignup);
router.post('/:intentId/checkout', checkoutLimit, controller.checkoutSignup);
router.post('/:intentId/sync', verifyLimit, controller.syncSignup);
router.get('/:intentId/status', statusLimit, controller.getSignupStatus);
router.get('/takbull/return', verifyLimit, controller.takbullReturn);
router.get('/takbull/cancel', statusLimit, controller.takbullCancel);
module.exports = router;
