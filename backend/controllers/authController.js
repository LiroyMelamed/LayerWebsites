const pool = require("../config/db"); // pg pool
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { formatPhoneNumber } = require("../utils/phoneUtils");
const { sendMessage } = require("../utils/sendMessage");
const { isLocked, recordFailure, recordSuccess } = require("../utils/otpBruteForce");
const { logSecurityEvent, extractIp } = require("../utils/securityAuditLogger");
require("dotenv").config();

if (!process.env.JWT_SECRET) {
    throw new Error("FATAL: JWT_SECRET env variable is not set. Server cannot start.");
}
const SECRET_KEY = process.env.JWT_SECRET;
const FORCE_SEND_SMS_ALL = process.env.FORCE_SEND_SMS_ALL === "true";

const ACCESS_TOKEN_TTL = String(process.env.ACCESS_TOKEN_TTL || "15m");

const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 90);
const REFRESH_TOKEN_PEPPER = String(process.env.REFRESH_TOKEN_PEPPER || "");

const ANDROID_SMS_RETRIEVER_HASH = String(process.env.ANDROID_SMS_RETRIEVER_HASH || "").trim();
const WEBSITE_DOMAIN_FALLBACK = String(process.env.WEBSITE_DOMAIN || "").trim();

// Hash OTP before storing in DB (ISO 27001 A.10 — never store secrets in plaintext)
const OTP_PEPPER = String(process.env.SIGNING_OTP_PEPPER || "");
function hashOtp(otp) {
    return crypto.createHmac("sha256", OTP_PEPPER).update(String(otp)).digest("hex");
}

function getClientPlatform(req) {
    const raw = req?.headers?.["x-client-platform"];
    return String(raw || "").trim().toLowerCase();
}

function getBearerToken(req) {
    const auth = String(req?.headers?.authorization || req?.headers?.Authorization || "").trim();
    if (!auth) return "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    return m ? String(m[1] || "").trim() : "";
}

function base64UrlFromBuffer(buffer) {
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function generateRefreshToken() {
    // 48 bytes -> 64 chars-ish base64url. High entropy, URL-safe.
    return base64UrlFromBuffer(crypto.randomBytes(48));
}

function hashRefreshToken(rawToken) {
    const token = String(rawToken || "").trim();
    // Pepper is optional; token is already high entropy.
    return crypto.createHash("sha256").update(token).update(REFRESH_TOKEN_PEPPER).digest("hex");
}

function computeRefreshTokenExpiryDate() {
    const days = Number.isFinite(REFRESH_TOKEN_TTL_DAYS) && REFRESH_TOKEN_TTL_DAYS > 0 ? REFRESH_TOKEN_TTL_DAYS : 90;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function signAccessToken({ userid, role, phonenumber }) {
    return jwt.sign({ userid, phonenumber, role }, SECRET_KEY, { expiresIn: ACCESS_TOKEN_TTL });
}

async function createRefreshTokenRow({ client, userid, userAgent, ipAddress }) {
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = computeRefreshTokenExpiryDate();

    await client.query(
        `
        INSERT INTO refresh_tokens (userid, token_hash, expires_at, user_agent, ip_address)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [userid, tokenHash, expiresAt, userAgent || null, ipAddress || null]
    );

    return { refreshToken, tokenHash, expiresAt };
}

function buildOtpSmsBody(otp, options = {}) {
    const otpStr = String(otp || "").trim();
    const baseHebrew = `קוד האימות שלך הוא ${otpStr}`;

    const platform = String(options?.platform || "").toLowerCase();
    const androidHash = String(options?.androidHash || "").trim();

    if (platform === "android" && androidHash) {
        return `<#> ${baseHebrew}\n${androidHash}`.trimEnd();
    }

    if (platform === "web") {
        return `${baseHebrew}\n\n@${WEBSITE_DOMAIN_FALLBACK} #${otpStr}`.trimEnd();
    }

    return baseHebrew.trimEnd();
}

function buildOtpSmsBodyForRequest(req, otp) {
    const platform = getClientPlatform(req);
    if (platform === "android") {

        return buildOtpSmsBody(otp, { platform: "android", androidHash: ANDROID_SMS_RETRIEVER_HASH });
    }

    if (platform === "web") {
        return buildOtpSmsBody(otp, { platform: "web", webDomain: WEBSITE_DOMAIN_FALLBACK });
    }

    return buildOtpSmsBody(otp);
}

const requestOtp = async (req, res) => {
    let { phoneNumber } = req.body;

    if (!phoneNumber) {
        console.log("RequestOtp-!phoneNumber");
        return res.status(400).json({ message: "נא להזין מספר פלאפון תקין" });
    }

    try {
        let formatedPhoneNumber = formatPhoneNumber(phoneNumber);

        const testUser = phoneNumber === "0501234567";
        const managerUser = phoneNumber === "0507299064";

        const isSuperUser = (process.env.NODE_ENV !== 'production') && (testUser || managerUser);

        const otp = isSuperUser
            ? "123456"
            : crypto.randomInt(100000, 999999).toString();

        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        const userResult = await pool.query(
            `SELECT userid FROM users WHERE phonenumber = $1`,
            [phoneNumber]
        );
        if (userResult.rows.length === 0) {
            console.log("משתמש אינו קיים");
            return res.status(404).json({ message: "משתמש אינו קיים" });
        }
        const userId = userResult.rows[0].userid;

        await pool.query(
            `
            INSERT INTO otps (phonenumber, otp, expiry, userid)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (phonenumber) DO UPDATE
            SET otp = EXCLUDED.otp, expiry = EXCLUDED.expiry, userid = EXCLUDED.userid;
            `,
            [phoneNumber, hashOtp(otp), expiry, userId]
        );

        if (FORCE_SEND_SMS_ALL || !isSuperUser) {
            try {
                sendMessage(buildOtpSmsBodyForRequest(req, otp), formatedPhoneNumber);
            } catch (e) {
                console.warn("SMS send failed:", e?.message);
            }
        }

        return res.status(200).json({ message: "קוד נשלח בהצלחה", otpSent: true });
    } catch (error) {
        console.error("שגיאה בשליחת הקוד:", error);
        logSecurityEvent({ type: 'OTP_REQUEST_ERROR', phone: phoneNumber, ip: extractIp(req), success: false });
        return res.status(500).json({ message: "שגיאה בשליחת הקוד", error: error.message });
    }
};

const verifyOtp = async (req, res) => {
    let { phoneNumber, otp } = req.body;

    // ── Brute-force lockout check (ISO 27001 A.9.4.2) ──
    const lockStatus = isLocked(phoneNumber);
    if (lockStatus.locked) {
        logSecurityEvent({
            type: 'OTP_VERIFY_BLOCKED_LOCKOUT',
            phone: phoneNumber,
            ip: extractIp(req),
            userAgent: req.headers?.['user-agent'],
            success: false,
            meta: { retryAfterMs: lockStatus.retryAfterMs },
        });
        const retryMinutes = Math.ceil((lockStatus.retryAfterMs || 0) / 60000);
        return res.status(429).json({
            message: `יותר מדי ניסיונות. נסה שוב בעוד ${retryMinutes} דקות`,
        });
    }

    try {
        const otpHash = hashOtp(otp);
        const result = await pool.query(
            `
            SELECT U.userid, U.role, U.phonenumber
            FROM otps O
            JOIN users U ON O.userid = U.userid
            WHERE O.phonenumber = $1
              AND O.otp = $2
              AND O.expiry > NOW()
            `,
            [phoneNumber, otpHash]
        );

        if (result.rows.length === 0) {
            recordFailure(phoneNumber);
            logSecurityEvent({
                type: 'OTP_VERIFY_FAIL',
                phone: phoneNumber,
                ip: extractIp(req),
                userAgent: req.headers?.['user-agent'],
                success: false,
            });
            return res.status(401).json({ message: "קוד לא תקין" });
        }

        recordSuccess(phoneNumber);
        const { userid, role, phonenumber } = result.rows[0];
        const token = signAccessToken({ userid, role, phonenumber });

        logSecurityEvent({
            type: 'OTP_VERIFY_SUCCESS',
            phone: phoneNumber,
            userId: userid,
            ip: extractIp(req),
            userAgent: req.headers?.['user-agent'],
            success: true,
        });

        // Invalidate the OTP after successful verification to prevent replay
        try {
            await pool.query(
                `DELETE FROM otps WHERE phonenumber = $1 AND otp = $2`,
                [phoneNumber, otpHash]
            );
        } catch (delErr) {
            console.warn('Warning: failed to delete OTP after verification', delErr?.message);
        }

        // Issue refresh token (for long-lived sessions / biometrics). If DB migration isn't applied yet,
        // fall back gracefully to avoid taking login down during rollout.
        let refreshToken = null;
        try {
            const client = await pool.connect();
            try {
                const userAgent = String(req?.headers?.['user-agent'] || "").slice(0, 400) || null;
                const ipAddress = String(req?.ip || "").slice(0, 200) || null;
                const row = await createRefreshTokenRow({ client, userid, userAgent, ipAddress });
                refreshToken = row.refreshToken;
            } finally {
                client.release();
            }
        } catch (rtErr) {
            // 42P01 = undefined_table (migration not applied yet)
            if (rtErr?.code === '42P01') {
                console.warn('refresh_tokens table missing; skipping refresh token issuance');
            } else {
                console.warn('failed to issue refresh token:', rtErr?.message);
            }
        }

        // Check if user is a platform admin (for frontend nav visibility)
        const platformAdminIds = String(process.env.PLATFORM_ADMIN_USER_IDS || '').trim();
        let isPlatformAdmin = false;
        if (role === 'Admin') {
            if (platformAdminIds) {
                const allowSet = new Set(platformAdminIds.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0));
                isPlatformAdmin = allowSet.has(userid);
            } else if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
                isPlatformAdmin = true;
            }
        }

        return res.status(200).json({ message: "קוד אומת בהצלחה", token, role, refreshToken, isPlatformAdmin });
    } catch (error) {
        console.error("שגיאה בתהליך האימות:", error);
        return res.status(500).json({ message: "שגיאה בתהליך האימות" });
    }
};

const refreshToken = async (req, res) => {
    const rawRefreshToken = String(req?.body?.refreshToken || "").trim();
    if (!rawRefreshToken) {
        return res.status(400).json({ message: 'Missing refreshToken' });
    }

    const tokenHash = hashRefreshToken(rawRefreshToken);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const found = await client.query(
            `
            SELECT rt.refresh_token_id, rt.userid, rt.expires_at, rt.revoked_at,
                   u.role, u.phonenumber
            FROM refresh_tokens rt
            JOIN users u ON u.userid = rt.userid
            WHERE rt.token_hash = $1
            LIMIT 1
            `,
            [tokenHash]
        );

        if (found.rows.length === 0) {
            await client.query('ROLLBACK');
            logSecurityEvent({ type: 'TOKEN_REFRESH_FAIL', ip: extractIp(req), userAgent: req.headers?.['user-agent'], success: false, meta: { reason: 'invalid_token' } });
            return res.status(401).json({ message: 'Invalid refresh token' });
        }

        const row = found.rows[0];

        if (row.revoked_at) {
            await client.query('ROLLBACK');
            logSecurityEvent({ type: 'TOKEN_REFRESH_FAIL', userId: row.userid, ip: extractIp(req), success: false, meta: { reason: 'revoked' } });
            return res.status(401).json({ message: 'Refresh token revoked' });
        }

        if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
            await client.query('ROLLBACK');
            logSecurityEvent({ type: 'TOKEN_REFRESH_FAIL', userId: row.userid, ip: extractIp(req), success: false, meta: { reason: 'expired' } });
            return res.status(401).json({ message: 'Refresh token expired' });
        }

        // Rotate refresh token on each refresh.
        const userAgent = String(req?.headers?.['user-agent'] || "").slice(0, 400) || null;
        const ipAddress = String(req?.ip || "").slice(0, 200) || null;
        const newTokenRow = await createRefreshTokenRow({ client, userid: row.userid, userAgent, ipAddress });

        await client.query(
            `
            UPDATE refresh_tokens
            SET revoked_at = NOW(), replaced_by_token_hash = $2
            WHERE refresh_token_id = $1
            `,
            [row.refresh_token_id, newTokenRow.tokenHash]
        );

        await client.query('COMMIT');

        const token = signAccessToken({ userid: row.userid, role: row.role, phonenumber: row.phonenumber });

        // Check if user is a platform admin (for frontend nav visibility)
        const platformAdminIds = String(process.env.PLATFORM_ADMIN_USER_IDS || '').trim();
        let isPlatformAdmin = false;
        if (row.role === 'Admin') {
            if (platformAdminIds) {
                const allowSet = new Set(platformAdminIds.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0));
                isPlatformAdmin = allowSet.has(row.userid);
            } else if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
                isPlatformAdmin = true;
            }
        }

        return res.status(200).json({ token, role: row.role, refreshToken: newTokenRow.refreshToken, isPlatformAdmin });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // ignore
        }
        logSecurityEvent({ type: 'TOKEN_REFRESH_ERROR', ip: extractIp(req), success: false });

        if (error?.code === '42P01') {
            return res.status(501).json({ message: 'Refresh tokens not available (migration not applied)' });
        }

        console.error('refreshToken error:', error);
        return res.status(500).json({ message: 'Failed to refresh token' });
    } finally {
        client.release();
    }
};

const logout = async (req, res) => {
    const rawRefreshToken = String(req?.body?.refreshToken || "").trim();

    // Option A: revoke the provided refresh token.
    if (rawRefreshToken) {
        const tokenHash = hashRefreshToken(rawRefreshToken);
        try {
            await pool.query(
                `
                UPDATE refresh_tokens
                SET revoked_at = NOW()
                WHERE token_hash = $1 AND revoked_at IS NULL
                `,
                [tokenHash]
            );
            return res.status(200).json({ ok: true });
        } catch (error) {
            if (error?.code === '42P01') {
                return res.status(501).json({ message: 'Refresh tokens not available (migration not applied)' });
            }
            console.error('logout error:', error);
            return res.status(500).json({ message: 'Failed to logout' });
        }
    }

    // Option B: if caller has an access token, revoke all refresh tokens for that user.
    const bearer = getBearerToken(req);
    if (bearer) {
        try {
            const decoded = jwt.verify(bearer, SECRET_KEY, { algorithms: ['HS256'] });
            const userid = decoded?.userid;
            if (!userid) {
                return res.status(401).json({ message: 'Invalid access token' });
            }

            await pool.query(
                `
                UPDATE refresh_tokens
                SET revoked_at = NOW()
                WHERE userid = $1 AND revoked_at IS NULL
                `,
                [userid]
            );
            return res.status(200).json({ ok: true });
        } catch (error) {
            if (error?.code === '42P01') {
                return res.status(501).json({ message: 'Refresh tokens not available (migration not applied)' });
            }
            return res.status(401).json({ message: 'Invalid access token' });
        }
    }

    return res.status(400).json({ message: 'Provide refreshToken or Authorization bearer token' });
};

const register = async (req, res) => {
    try {
        let { name, phoneNumber } = req.body || {};

        if (!name || !phoneNumber) {
            return res.status(400).json({ message: "נא להזין שם ומספר פלאפון" });
        }

        let formatedPhoneNumber = formatPhoneNumber(phoneNumber);

        const exists = await pool.query(
            `SELECT userid FROM users WHERE phonenumber = $1`,
            [phoneNumber]
        );
        if (exists.rows.length > 0) {
            return res.status(409).json({ message: "משתמש עם המספר הזה כבר קיים" });
        }

        await pool.query(
            `
      INSERT INTO users (name, email, phonenumber, passwordhash, role, companyname, createdat)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
            [name, null, phoneNumber, null, "User", null, new Date()]
        );

        const testUser = phoneNumber === "0501234567";
        const managerUser = phoneNumber === "0507299064";

        const isSuperUser = (process.env.NODE_ENV !== 'production') && (testUser || managerUser);

        const otp = isSuperUser
            ? "123456"
            : crypto.randomInt(100000, 999999).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000);

        const ures = await pool.query(
            `SELECT userid FROM users WHERE phonenumber = $1`,
            [phoneNumber]
        );
        const userId = ures.rows[0]?.userid;

        await pool.query(
            `
            INSERT INTO otps (phonenumber, otp, expiry, userid)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (phonenumber) DO UPDATE
            SET otp = EXCLUDED.otp, expiry = EXCLUDED.expiry, userid = EXCLUDED.userid
            `,
            [phoneNumber, hashOtp(otp), expiry, userId]
        );

        if (FORCE_SEND_SMS_ALL || !isSuperUser) {
            try {
                sendMessage(buildOtpSmsBodyForRequest(req, otp), formatedPhoneNumber);
            } catch (e) {
                console.warn("כשל בשליחת SMS לאחר הרשמה:", e?.message);
            }
        }

        return res.status(201).json({ otpSent: true });
    } catch (error) {
        console.error("שגיאה בהרשמה:", error);
        return res.status(500).json({ message: "אירעה שגיאה בהרשמה" });
    }
};

module.exports = {
    requestOtp,
    verifyOtp,
    refreshToken,
    logout,
    register,
};
