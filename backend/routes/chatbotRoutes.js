const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');
const { createRateLimitMiddleware, getClientIp } = require('../utils/rateLimiter');
const { getSetting } = require('../services/settingsService');

// Enforce the runtime switch before every public endpoint, including old sessions.
router.use(async (_req, res, next) => {
    try {
        const enabled = await getSetting('chatbot', 'AI_CHATBOT_ENABLED', false);
        if (![true, 'true', 1, '1'].includes(enabled)) {
            return res.status(403).json({ success: false, errorCode: 'CHATBOT_DISABLED', message: 'הצ׳אטבוט אינו פעיל כרגע' });
        }
        return next();
    } catch (error) {
        return next(error);
    }
});

const trustProxy = process.env.TRUST_PROXY === 'true';

// Chatbot-specific rate limiter: 10 requests/minute per IP
const chatbotRateLimit = createRateLimitMiddleware({
    name: 'chatbot-ip',
    windowMs: String(60 * 1000),      // 1 minute
    max: '10',
    message: 'יותר מדי בקשות לצ׳אט. נסה שוב בעוד דקה.',
    trustProxy,
    keyFn: (req) => getClientIp(req, { trustProxy }),
});

// OTP rate limiter: 5 requests/minute per IP
const chatbotOtpRateLimit = createRateLimitMiddleware({
    name: 'chatbot-otp-ip',
    windowMs: String(60 * 1000),
    max: '5',
    message: 'יותר מדי בקשות אימות. נסה שוב בעוד דקה.',
    trustProxy,
    keyFn: (req) => getClientIp(req, { trustProxy }),
});

// All chatbot endpoints are public (no authMiddleware) — verification is via OTP session
router.post('/message',     chatbotRateLimit,    chatbotController.sendChatMessage);
router.post('/request-otp', chatbotOtpRateLimit, chatbotController.requestOtp);
router.post('/verify-otp',  chatbotOtpRateLimit, chatbotController.verifyOtp);
router.get('/context',      chatbotRateLimit,    chatbotController.getContext);

module.exports = router;
