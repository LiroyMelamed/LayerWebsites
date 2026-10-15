const { optionalInt } = require('./paramValidation');

function hasQueryValue(req, key) {
    const value = req?.query?.[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
}

/**
 * Parses optional pagination query params.
 *
 * Backwards-compat: pagination is only enabled when the client supplies
 * either `limit` or `offset`.
 */
function getPagination(req, res, {
    limitName = 'limit',
    offsetName = 'offset',
    defaultLimit = 50,
    maxLimit = 200,
    defaultOffset = 0,
} = {}) {
    const enabled = hasQueryValue(req, limitName) || hasQueryValue(req, offsetName);
    if (!enabled) {
        return { enabled: false };
    }

    const limit = optionalInt(req, res, {
        source: 'query',
        name: limitName,
        min: 1,
        max: maxLimit,
        defaultValue: defaultLimit,
    });
    if (limit === null) return null;

    const offset = optionalInt(req, res, {
        source: 'query',
        name: offsetName,
        min: 0,
        defaultValue: defaultOffset,
    });
    if (offset === null) return null;

    return {
        enabled: true,
        limit,
        offset,
    };
}

module.exports = {
    getPagination,
};
