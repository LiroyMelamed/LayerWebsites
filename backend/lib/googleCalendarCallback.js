'use strict';
/** A copied development .env must never send a live customer's consent to localhost. */
module.exports = function googleCalendarCallback(env = process.env) {
    const api = env.PUBLIC_API_BASE_URL || env.API_PUBLIC_ORIGIN;
    if (api) {
        const url = new URL(api);
        if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('GOOGLE_CALLBACK_HTTPS_REQUIRED');
        if ((env.NODE_ENV === 'production' || env.IS_PRODUCTION === 'true') && ['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('GOOGLE_CALLBACK_PUBLIC_ORIGIN_REQUIRED');
        return url.origin + '/api/calendar/google/callback';
    }
    const url = new URL(env.GOOGLE_OAUTH_REDIRECT_URI);
    if ((env.NODE_ENV === 'production' || env.IS_PRODUCTION === 'true') && (url.protocol !== 'https:' || ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('GOOGLE_CALLBACK_PUBLIC_ORIGIN_REQUIRED');
    return url.toString();
};
