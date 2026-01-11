const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = require("./config/db");

const authRoutes = require("./routes/auth");
const customerRoutes = require("./routes/customerRoutes");
const caseRoutes = require("./routes/caseRoutes");
const adminRoutes = require("./routes/adminRoutes");
const caseTypeRoutes = require("./routes/caseTypeRoutes");
const dataRoutes = require("./routes/dataRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const filesRoutes = require("./routes/filesRoutes");
const signingFileRoutes = require("./routes/signingFileRoutes");

const authMiddleware = require("./middlewares/authMiddleware");
const { createRateLimitMiddleware, getClientIp } = require("./utils/rateLimiter");
const errorHandler = require('./middlewares/errorHandler');
const { sendError } = require('./utils/appError');

const app = express();

// Only trust proxy headers when explicitly enabled (prevents spoofing x-forwarded-for)
app.set('trust proxy', process.env.TRUST_PROXY === 'true');

const API_JSON_LIMIT = process.env.API_JSON_LIMIT || '50mb';
const API_URLENCODED_LIMIT = process.env.API_URLENCODED_LIMIT || '50mb';
const API_REQUEST_TIMEOUT_MS = Number(process.env.API_REQUEST_TIMEOUT_MS || 30_000);

app.use(bodyParser.json({ limit: API_JSON_LIMIT }));
app.use(bodyParser.urlencoded({ limit: API_URLENCODED_LIMIT, extended: true }));

const isProduction = process.env.IS_PRODUCTION === 'true';

function selectMode(forProduction, forStage) {
    return isProduction ? forProduction : forStage;
}

const productionOrigin = [
    "https://client.melamedlaw.co.il/",
    "https://client.melamedlaw.co.il",
];
const stageOrigin = [
    "http://localhost:3000",
    "https://client.melamedlaw.co.il",
];

const allowedOrigins = selectMode(productionOrigin, stageOrigin);

app.use(
    cors({
        // Allow only configured origins. If no origin (e.g. same-origin or curl), allow it.
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            // Reject unknown origin
            return callback(new Error('Not allowed by CORS'));
        },
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    })
);

// Request timeout guard (server-side). This protects expensive PDF operations from hanging.
app.use((req, res, next) => {
    if (!Number.isFinite(API_REQUEST_TIMEOUT_MS) || API_REQUEST_TIMEOUT_MS <= 0) {
        return next();
    }

    res.setTimeout(API_REQUEST_TIMEOUT_MS, () => {
        if (res.headersSent) return;
        return sendError(res, {
            httpStatus: 504,
            errorCode: 'REQUEST_TIMEOUT',
        });
    });

    // If the client disconnects (mobile app backgrounded, network lost), avoid extra work.
    req.on('aborted', () => {
        req.__aborted = true;
    });

    return next();
});

// Backend Phase: anti-flood (per-IP)
const trustProxy = process.env.TRUST_PROXY === 'true';
app.use(
    '/api',
    createRateLimitMiddleware({
        name: 'ip',
        windowMs: process.env.RATE_LIMIT_IP_WINDOW_MS,
        max: process.env.RATE_LIMIT_IP_MAX,
        message: 'יותר מדי בקשות. נסה שוב מאוחר יותר.',
        trustProxy,
        keyFn: (req) => getClientIp(req, { trustProxy }),
        // allow health checks without consuming budget
        skip: (req) => req.path === '/health',
    })
);

// Stricter anti-flood for auth endpoints
app.use(
    "/api/Auth",
    createRateLimitMiddleware({
        name: 'auth-ip',
        windowMs: process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS || String(10 * 60 * 1000),
        max: process.env.RATE_LIMIT_AUTH_IP_MAX || '40',
        message: 'יותר מדי ניסיונות התחברות. נסה שוב מאוחר יותר.',
        trustProxy,
        keyFn: (req) => getClientIp(req, { trustProxy }),
    }),
    authRoutes
);

app.use("/api/Customers", customerRoutes);
app.use("/api/Cases", caseRoutes);
app.use("/api/Admins", adminRoutes);
app.use("/api/CaseTypes", caseTypeRoutes);
app.use("/api/Data", dataRoutes);
app.use("/api/Notifications", notificationRoutes);
app.use("/api/Files", filesRoutes);
app.use("/api/SigningFiles", signingFileRoutes);

// Lightweight health endpoint for prereq checks
app.get("/health", (req, res) => {
    res.status(200).json({ ok: true });
});

// DB-backed endpoint for prereq checks (expects 401/403 when auth fails)
app.get("/api/cases", authMiddleware, async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error('DB sanity check failed:', e?.message);
        return sendError(res, {
            httpStatus: 500,
            errorCode: 'INTERNAL_ERROR',
            details: { check: 'db_sanity' },
            legacyAliases: { ok: false },
        });
    }
});

app.get("/", (req, res) => {
    res.send("MelamedLaw API is running!");
});

// Centralized error handler (must be last)
app.use(errorHandler);

process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await pool.end();
    console.log('Database pool closed.');
    process.exit(0);
});

module.exports = app;
