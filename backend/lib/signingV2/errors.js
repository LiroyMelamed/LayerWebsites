const { createAppError } = require('../../utils/appError');

function fail(code, status = 422, fieldErrors = []) {
    throw createAppError(code, status, code, undefined, {
        messageKey: `signingV2.errors.${code}`,
        fieldErrors,
        retryable: false,
    });
}

function expect(condition, code, path) {
    if (!condition) fail(code, 422, path ? [{ path, code }] : []);
}

module.exports = { fail, expect };
