const signupService = require('../lib/tenant/signupService');
const { getFrontendBaseUrl } = require('../lib/billing/tenantBillingDefaults');

async function startSignup(req, res) {
    try {
        const intent = await signupService.createSignupIntent(req.body || {});
        return res.status(201).json({
            intentId: intent.id,
            slug: intent.slug,
            priceMonthlyIls: intent.priceMonthlyIls,
            trialDays: signupService.TRIAL_DAYS,
        });
    } catch (e) {
        const code = e?.code || 'SIGNUP_FAILED';
        const status = code === 'SLUG_TAKEN' ? 409 : code === 'INVALID_SLUG' || code === 'MISSING_FIELDS' ? 400 : 500;
        return res.status(status).json({ error: code, message: e?.message || 'Signup failed' });
    }
}

async function checkoutSignup(req, res) {
    try {
        const intentId = req.params.intentId;
        const checkout = await signupService.createSignupCheckout(intentId);
        return res.json(checkout);
    } catch (e) {
        const code = e?.code || 'CHECKOUT_FAILED';
        const status = code === 'SIGNUP_NOT_FOUND' ? 404 : code === 'TAKBULL_NOT_CONFIGURED' ? 503 : 400;
        return res.status(status).json({ error: code, message: e?.message });
    }
}

async function getSignupStatus(req, res) {
    try {
        const intent = await signupService.getSignupIntent(req.params.intentId);
        if (!intent) return res.status(404).json({ error: 'SIGNUP_NOT_FOUND' });
        return res.json({
            ...intent,
            loginUrl: intent.status === 'completed' && intent.slug
                ? `${getFrontendBaseUrl()}/${intent.slug}/admin`
                : null,
        });
    } catch (e) {
        return res.status(500).json({ error: 'STATUS_FAILED' });
    }
}

async function completeSignup(req, res) {
    try {
        const result = await signupService.completeSignupWithoutPayment(req.params.intentId);
        return res.json({
            status: 'completed',
            slug: result.slug,
            tenantId: result.tenantId,
            loginUrl: result.slug
                ? `${getFrontendBaseUrl()}/${result.slug}/LoginStack/LoginScreen`
                : null,
        });
    } catch (e) {
        const code = e?.code || 'COMPLETE_FAILED';
        const status = code === 'SIGNUP_NOT_FOUND' ? 404
            : code === 'SIGNUP_INVALID_STATUS' ? 409
                : 500;
        return res.status(status).json({ error: code, message: e?.message || 'Signup completion failed' });
    }
}

async function takbullReturn(req, res) {
    const intentId = String(req.query.intentId || '').trim();
    const frontend = getFrontendBaseUrl();
    if (!intentId) {
        return res.redirect(`${frontend}/signup?error=missing_intent`);
    }
    return res.redirect(`${frontend}/signup/complete?intentId=${encodeURIComponent(intentId)}`);
}

async function takbullCancel(req, res) {
    const intentId = String(req.query.intentId || '').trim();
    const frontend = getFrontendBaseUrl();
    return res.redirect(`${frontend}/signup?cancelled=1${intentId ? `&intentId=${encodeURIComponent(intentId)}` : ''}`);
}

module.exports = {
    startSignup,
    checkoutSignup,
    completeSignup,
    getSignupStatus,
    takbullReturn,
    takbullCancel,
};
