const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { createRateLimitMiddleware, getClientIp } = require("../utils/rateLimiter");

// Rate limiter for OTP endpoints — 5 requests per 60 seconds per IP
const otpLimiter = createRateLimitMiddleware({
    name: 'otp',
    windowMs: 60 * 1000,
    max: 5,
    keyFn: (req, opts) => getClientIp(req, opts),
    trustProxy: process.env.TRUST_PROXY === 'true',
});

// Rate limiter for verify — 10 attempts per 60 seconds per IP (brute-force protection)
const verifyLimiter = createRateLimitMiddleware({
    name: 'otp_verify',
    windowMs: 60 * 1000,
    max: 10,
    keyFn: (req, opts) => getClientIp(req, opts),
    trustProxy: process.env.TRUST_PROXY === 'true',
});

router.post("/RequestOtp", otpLimiter, authController.requestOtp);

router.post("/VerifyOtp", verifyLimiter, authController.verifyOtp);

router.post("/Refresh", authController.refreshToken);

router.post("/Logout", authController.logout);

router.post("/Register", authController.register);

module.exports = router;
