const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');
const { createRateLimitMiddleware, getClientIp } = require('../utils/rateLimiter');

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
