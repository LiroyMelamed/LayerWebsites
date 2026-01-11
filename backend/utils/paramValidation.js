function isDigitsOnly(value) {
    return typeof value === 'string' && /^[0-9]+$/.test(value);
}

function parsePositiveIntStrict(raw, { min = 1, max } = {}) {
    if (raw === undefined || raw === null) return null;

    const asString = String(raw).trim();
    if (!isDigitsOnly(asString)) return null;

    const parsed = Number.parseInt(asString, 10);
    if (!Number.isSafeInteger(parsed)) return null;
    if (parsed < min) return null;
    if (max !== undefined && parsed > max) return null;

    return parsed;
}

function getFromSource(req, source, key) {
    if (source === 'params') return req.params?.[key];
    if (source === 'query') return req.query?.[key];
    if (source === 'body') return req.body?.[key];
    throw new Error(`paramValidation: unknown source '${source}'`);
}

function requireInt(req, res, {
    source = 'params',
    name,
    aliases = [],
    min = 1,
    max,
    message,
} = {}) {
    if (!name) throw new Error('requireInt: name is required');

    const keys = [name, ...aliases];
    let raw;
    for (const key of keys) {
        raw = getFromSource(req, source, key);
        if (raw !== undefined) break;
    }

    const parsed = parsePositiveIntStrict(raw, { min, max });
    if (parsed === null) {
        const { sendError } = require('./appError');
        const { getHebrewMessage } = require('./errors.he');
        sendError(res, {
            httpStatus: 422,
            errorCode: 'INVALID_PARAMETER',
            message: getHebrewMessage('INVALID_PARAMETER'),
            details: { name },
        });
        return null;
    }

    return parsed;
}

function optionalInt(req, res, {
    source = 'query',
    name,
    aliases = [],
    min = 0,
    max,
    defaultValue,
    message,
} = {}) {
    if (!name) throw new Error('optionalInt: name is required');

    const keys = [name, ...aliases];
    let raw;
    for (const key of keys) {
        raw = getFromSource(req, source, key);
        if (raw !== undefined) break;
    }

    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return defaultValue;
    }

    const parsed = parsePositiveIntStrict(raw, { min, max });
    if (parsed === null) {
        const { sendError } = require('./appError');
        const { getHebrewMessage } = require('./errors.he');
        sendError(res, {
            httpStatus: 422,
            errorCode: 'INVALID_PARAMETER',
            message: getHebrewMessage('INVALID_PARAMETER'),
            details: { name },
        });
        return null;
    }

    return parsed;
}

module.exports = {
    parsePositiveIntStrict,
    requireInt,
    optionalInt,
};
