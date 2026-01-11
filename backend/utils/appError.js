const { getHebrewMessage } = require('./errors.he');

class AppError extends Error {
    constructor({ errorCode, httpStatus = 500, heMessage, meta, extras, legacyAliases }) {
        super(String(heMessage || getHebrewMessage(errorCode) || ''));
        this.name = 'AppError';
        this.errorCode = String(errorCode || 'INTERNAL_ERROR');
        this.httpStatus = Number(httpStatus) || 500;
        this.heMessage = String(heMessage || getHebrewMessage(this.errorCode));
        this.meta = meta;
        this.extras = extras;
        this.legacyAliases = legacyAliases;
    }
}

function createAppError(errorCode, httpStatus, heMessage, meta, extras, legacyAliases) {
    return new AppError({ errorCode, httpStatus, heMessage, meta, extras, legacyAliases });
}

function isProduction() {
    return String(process.env.IS_PRODUCTION || 'false').toLowerCase() === 'true';
}

function sanitizeDetails(details) {
    // No tokens/OTP/raw SQL/stack traces in production.
    if (details == null) return undefined;

    // Prefer object-only details.
    if (typeof details !== 'object') {
        return { info: String(details) };
    }

    // Shallow clone to avoid mutation.
    const safe = { ...details };
    if (safe.token) delete safe.token;
    if (safe.otp) delete safe.otp;
    if (safe.password) delete safe.password;
    if (safe.sql) delete safe.sql;
    if (safe.stack) delete safe.stack;
    return safe;
}

function sendError(res, { httpStatus, errorCode, message, details, legacy = true, extras, legacyAliases }) {
    const status = Number(httpStatus) || 500;
    const code = String(errorCode || 'INTERNAL_ERROR');
    const heMessage = String(message || getHebrewMessage(code));

    const payload = {
        success: false,
        errorCode: code,
        message: heMessage,
    };

    // Safe extra fields that some clients rely on (e.g., retryAfterSeconds).
    if (extras && typeof extras === 'object') {
        for (const [k, v] of Object.entries(extras)) {
            if (k in payload) continue;
            payload[k] = v;
        }
    }

    if (!isProduction()) {
        const safeDetails = sanitizeDetails(details);
        if (safeDetails && Object.keys(safeDetails).length > 0) {
            payload.details = safeDetails;
        }
    }

    // Backward compatibility: many existing consumers/tests use `code`.
    if (legacy) {
        payload.code = code;
    }

    // Optional legacy aliases used by some endpoints historically.
    if (legacyAliases && typeof legacyAliases === 'object') {
        for (const [k, v] of Object.entries(legacyAliases)) {
            if (k in payload) continue;
            payload[k] = v;
        }
    }

    return res.status(status).json(payload);
}

module.exports = {
    AppError,
    createAppError,
    sendError,
    isProduction,
};
