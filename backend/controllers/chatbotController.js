const pool = require('../config/db');
const crypto = require('crypto');
const { formatPhoneNumber } = require('../utils/phoneUtils');
const { sendMessage } = require('../utils/sendMessage');
const { isLocked, recordFailure, recordSuccess } = require('../utils/otpBruteForce');
const { logSecurityEvent, extractIp } = require('../utils/securityAuditLogger');
const { sendError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const { processMessage } = require('../services/aiChatService');
require('dotenv').config();

const OTP_PEPPER = String(process.env.SIGNING_OTP_PEPPER || '');
const SESSION_TTL_MINUTES = Number(process.env.CHATBOT_SESSION_TTL_MINUTES) || 30;
const MAX_MESSAGE_LENGTH = 2000;

const DEMO_OTP_PHONES = (process.env.DEMO_OTP_PHONES || '').split(',').map(s => s.trim()).filter(Boolean);
const FORCE_SEND_SMS_ALL = process.env.FORCE_SEND_SMS_ALL === 'true';

function hashOtp(otp) {
    return crypto.createHmac('sha256', OTP_PEPPER).update(String(otp)).digest('hex');
}

// ── POST /api/chatbot/message ─────────────────────────────────────────
const sendChatMessage = async (req, res) => {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return sendError(res, { httpStatus: 400, errorCode: 'VALIDATION_ERROR', message: getHebrewMessage('VALIDATION_ERROR') });
    }

    const sanitizedMessage = String(message).slice(0, MAX_MESSAGE_LENGTH).trim();
    const ip = extractIp(req);

    let verified = false;
    let userId = null;
    let resolvedSessionId = sessionId ? Number(sessionId) : null;

    // Check session validity
    if (resolvedSessionId) {
        try {
            const sessionResult = await pool.query(
                `SELECT id, verified, user_id, expires_at FROM chatbot_sessions WHERE id = $1`,
                [resolvedSessionId]
            );
            if (sessionResult.rows.length > 0) {
                const session = sessionResult.rows[0];
                if (session.expires_at && new Date(session.expires_at) < new Date()) {
                    return sendError(res, { httpStatus: 401, errorCode: 'CHATBOT_SESSION_EXPIRED', message: getHebrewMessage('CHATBOT_SESSION_EXPIRED') });
                }
                verified = session.verified;
                userId = session.user_id;
            } else {
                resolvedSessionId = null;
            }
        } catch (err) {
            console.error('[chatbot] Session lookup failed:', err?.message);
            resolvedSessionId = null;
        }
    }

    // Create session if none exists
    if (!resolvedSessionId) {
        try {
            const result = await pool.query(
                `INSERT INTO chatbot_sessions (ip_address) VALUES ($1) RETURNING id`,
                [ip]
            );
            resolvedSessionId = result.rows[0].id;
        } catch (err) {
            console.error('[chatbot] Session creation failed:', err?.message);
            return sendError(res, { httpStatus: 500, errorCode: 'INTERNAL_ERROR', message: getHebrewMessage('INTERNAL_ERROR') });
        }
    }

    // Retrieve conversation history for context
    let history = [];
    try {
        const histResult = await pool.query(
            `SELECT role, message AS content FROM chatbot_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT 20`,
            [resolvedSessionId]
        );
        history = histResult.rows;
    } catch {
        // Conversation history is optional
    }

    try {
        const aiResult = await processMessage({
            message: sanitizedMessage,
            verified,
            userId,
            history,
            sessionId: resolvedSessionId,
            ip: req.ip,
        });

        // Store messages
        try {
            await pool.query(
                `INSERT INTO chatbot_messages (session_id, role, message) VALUES ($1, 'user', $2)`,
                [resolvedSessionId, sanitizedMessage]
            );
            await pool.query(
                `INSERT INTO chatbot_messages (session_id, role, message, response) VALUES ($1, 'assistant', $2, $3)`,
                [resolvedSessionId, aiResult.response, aiResult.response]
            );
        } catch (storeErr) {
            console.warn('[chatbot] Failed to store messages:', storeErr?.message);
        }

        // Audit log
        logSecurityEvent({
            type: 'AI_CHATBOT_MESSAGE',
            ip,
            userId: userId || undefined,
            userAgent: req.headers?.['user-agent'],
            success: true,
            meta: { sessionId: resolvedSessionId, verified, messageLength: sanitizedMessage.length },
        });

        return res.status(200).json({
            success: true,
            sessionId: resolvedSessionId,
            response: aiResult.response,
            requiresVerification: aiResult.requiresVerification,
            verified,
        });
    } catch (err) {
        console.error('[chatbot] AI processing error:', err?.message);
        logSecurityEvent({
            type: 'AI_CHATBOT_MESSAGE',
            ip,
            userId: userId || undefined,
            success: false,
            meta: { error: err?.message?.slice(0, 200) },
        });
        return sendError(res, { httpStatus: 500, errorCode: 'INTERNAL_ERROR', message: getHebrewMessage('INTERNAL_ERROR') });
    }
};

// ── POST /api/chatbot/request-otp ─────────────────────────────────────
const requestOtp = async (req, res) => {
    const { phoneNumber, sessionId } = req.body;
    const ip = extractIp(req);

    if (!phoneNumber || typeof phoneNumber !== 'string') {
        return sendError(res, { httpStatus: 400, errorCode: 'MISSING_PHONE', message: getHebrewMessage('MISSING_PHONE') });
    }

    try {
        const formattedPhone = formatPhoneNumber(phoneNumber);
        const isDemoPhone = DEMO_OTP_PHONES.includes(phoneNumber);

        // Check if user exists
        const userResult = await pool.query(
            `SELECT userid FROM users WHERE phonenumber = $1`,
            [phoneNumber]
        );

        if (userResult.rows.length === 0) {
            logSecurityEvent({
                type: 'CHATBOT_OTP_REQUEST_UNKNOWN_USER',
                phone: phoneNumber,
                ip,
                success: false,
            });
            return sendError(res, { httpStatus: 404, errorCode: 'NOT_FOUND', message: 'מספר הטלפון לא נמצא במערכת.' });
        }

        // Generate and store OTP
        const otp = isDemoPhone ? '123456' : crypto.randomInt(100000, 999999).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Dev mode: log OTP to console instead of sending SMS
        if (process.env.NODE_ENV === 'development') {
            console.log('\n[CHATBOT OTP DEV MODE]');
            console.log(`phone: ${phoneNumber}`);
            console.log(`code: ${otp}\n`);
        }

        await pool.query(
            `INSERT INTO otps (phonenumber, otp, expiry, userid)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (phonenumber) DO UPDATE
             SET otp = EXCLUDED.otp, expiry = EXCLUDED.expiry, userid = EXCLUDED.userid`,
            [phoneNumber, hashOtp(otp), expiry, userResult.rows[0].userid]
        );

        // Send SMS
        if (FORCE_SEND_SMS_ALL || !isDemoPhone) {
            try {
                const smsBody = `קוד האימות שלך לצ׳אט הוא ${otp}`;
                sendMessage(smsBody, formattedPhone);
            } catch (smsErr) {
                console.warn('[chatbot] SMS send failed:', smsErr?.message);
            }
        }

        logSecurityEvent({
            type: 'CHATBOT_OTP_REQUEST',
            phone: phoneNumber,
            ip,
            success: true,
        });

        return res.status(200).json({ success: true, message: 'קוד אימות נשלח בהצלחה.' });
    } catch (err) {
        console.error('[chatbot] OTP request error:', err?.message);
        logSecurityEvent({
            type: 'CHATBOT_OTP_REQUEST',
            phone: phoneNumber,
            ip,
            success: false,
            meta: { error: err?.message?.slice(0, 200) },
        });
        return sendError(res, { httpStatus: 500, errorCode: 'INTERNAL_ERROR', message: getHebrewMessage('INTERNAL_ERROR') });
    }
};

// ── POST /api/chatbot/verify-otp ──────────────────────────────────────
const verifyOtp = async (req, res) => {
    const { phoneNumber, otp, sessionId } = req.body;
    const ip = extractIp(req);

    if (!phoneNumber || !otp) {
        return sendError(res, { httpStatus: 400, errorCode: 'VALIDATION_ERROR', message: getHebrewMessage('VALIDATION_ERROR') });
    }

    // Brute-force check
    const lockStatus = isLocked(phoneNumber);
    if (lockStatus.locked) {
        logSecurityEvent({
            type: 'CHATBOT_OTP_VERIFY_BLOCKED',
            phone: phoneNumber,
            ip,
            success: false,
            meta: { retryAfterMs: lockStatus.retryAfterMs },
        });
        const retryMinutes = Math.ceil((lockStatus.retryAfterMs || 0) / 60000);
        return sendError(res, {
            httpStatus: 429,
            errorCode: 'OTP_LOCKED',
            message: `יותר מדי ניסיונות. נסה שוב בעוד ${retryMinutes} דקות`,
        });
    }

    try {
        const otpHash = hashOtp(otp);
        const result = await pool.query(
            `SELECT U.userid, U.role, U.phonenumber
             FROM otps O
             JOIN users U ON O.userid = U.userid
             WHERE O.phonenumber = $1 AND O.otp = $2 AND O.expiry > NOW()`,
            [phoneNumber, otpHash]
        );

        if (result.rows.length === 0) {
            recordFailure(phoneNumber);
            logSecurityEvent({
                type: 'CHATBOT_OTP_VERIFY_FAIL',
                phone: phoneNumber,
                ip,
                userAgent: req.headers?.['user-agent'],
                success: false,
            });
            return sendError(res, { httpStatus: 401, errorCode: 'OTP_INVALID', message: getHebrewMessage('OTP_INVALID') });
        }

        recordSuccess(phoneNumber);
        const { userid } = result.rows[0];

        // Delete OTP to prevent replay
        try {
            await pool.query(
                `DELETE FROM otps WHERE phonenumber = $1 AND otp = $2`,
                [phoneNumber, otpHash]
            );
        } catch {
            // Non-critical
        }

        // Create or update chatbot session
        const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);

        let resolvedSessionId = sessionId ? Number(sessionId) : null;

        if (resolvedSessionId) {
            // Update existing session
            await pool.query(
                `UPDATE chatbot_sessions SET phone = $1, verified = true, user_id = $2, expires_at = $3 WHERE id = $4`,
                [phoneNumber, userid, expiresAt, resolvedSessionId]
            );
        } else {
            // Create new verified session
            const sessionResult = await pool.query(
                `INSERT INTO chatbot_sessions (phone, verified, user_id, ip_address, expires_at)
                 VALUES ($1, true, $2, $3, $4) RETURNING id`,
                [phoneNumber, userid, ip, expiresAt]
            );
            resolvedSessionId = sessionResult.rows[0].id;
        }

        logSecurityEvent({
            type: 'CHATBOT_OTP_VERIFY_SUCCESS',
            phone: phoneNumber,
            userId: userid,
            ip,
            userAgent: req.headers?.['user-agent'],
            success: true,
            meta: { sessionId: resolvedSessionId },
        });

        return res.status(200).json({
            success: true,
            sessionId: resolvedSessionId,
            verified: true,
            expiresAt: expiresAt.toISOString(),
        });
    } catch (err) {
        console.error('[chatbot] OTP verify error:', err?.message);
        logSecurityEvent({
            type: 'CHATBOT_OTP_VERIFY_FAIL',
            phone: phoneNumber,
            ip,
            success: false,
            meta: { error: err?.message?.slice(0, 200) },
        });
        return sendError(res, { httpStatus: 500, errorCode: 'INTERNAL_ERROR', message: getHebrewMessage('INTERNAL_ERROR') });
    }
};

// ── GET /api/chatbot/context ──────────────────────────────────────────
const getContext = async (req, res) => {
    const sessionId = Number(req.query.sessionId);

    if (!sessionId) {
        return sendError(res, { httpStatus: 400, errorCode: 'VALIDATION_ERROR', message: getHebrewMessage('VALIDATION_ERROR') });
    }

    try {
        const sessionResult = await pool.query(
            `SELECT id, verified, user_id, expires_at FROM chatbot_sessions WHERE id = $1`,
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return sendError(res, { httpStatus: 404, errorCode: 'NOT_FOUND', message: getHebrewMessage('NOT_FOUND') });
        }

        const session = sessionResult.rows[0];

        if (session.expires_at && new Date(session.expires_at) < new Date()) {
            return sendError(res, { httpStatus: 401, errorCode: 'CHATBOT_SESSION_EXPIRED', message: getHebrewMessage('CHATBOT_SESSION_EXPIRED') });
        }

        return res.status(200).json({
            success: true,
            sessionId: session.id,
            verified: session.verified,
            expiresAt: session.expires_at,
        });
    } catch (err) {
        console.error('[chatbot] Context fetch error:', err?.message);
        return sendError(res, { httpStatus: 500, errorCode: 'INTERNAL_ERROR', message: getHebrewMessage('INTERNAL_ERROR') });
    }
};

module.exports = {
    sendChatMessage,
    requestOtp,
    verifyOtp,
    getContext,
};
