const express = require('express');
const controller = require('../controllers/publicSignupController');
const { createRateLimitMiddleware, getClientIp } = require('../utils/rateLimiter');

const router = express.Router();
const trustProxy = process.env.TRUST_PROXY === 'true';

router.use(
    createRateLimitMiddleware({
        name: 'signup-ip',
        windowMs: process.env.RATE_LIMIT_SIGNUP_WINDOW_MS || String(60 * 60 * 1000),
        max: process.env.RATE_LIMIT_SIGNUP_MAX || '20',
        message: 'יותר מדי ניסיונות הרשמה. נסו שוב מאוחר יותר.',
        trustProxy,
        keyFn: (req) => getClientIp(req, { trustProxy }),
    })
);

router.post('/start', controller.startSignup);
router.post('/:intentId/checkout', controller.checkoutSignup);
router.get('/:intentId/status', controller.getSignupStatus);
router.get('/takbull/return', controller.takbullReturn);
router.get('/takbull/cancel', controller.takbullCancel);

module.exports = router;
