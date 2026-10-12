'use strict';
// Shared-database signup remains disabled until tenant isolation is verified.
// Existing offices and their billing recovery routes are not controlled by this flag.
function signupAvailable() {
    return process.env.SELF_SERVICE_SIGNUP_ENABLED === '1' &&
        (!require('./tenantContext').isMultiTenantMode() || require('./databaseScope').enabled());
}
function assertSignupAvailable() {
    if (!signupAvailable()) throw Object.assign(new Error('הרשמה אוטומטית למשרדים חדשים אינה זמינה כרגע. לא יבוצע חיוב.'), { code: 'SIGNUP_NOT_AVAILABLE' });
}
module.exports = { signupAvailable, assertSignupAvailable };
