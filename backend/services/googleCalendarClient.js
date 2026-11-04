'use strict';
const crypto = require('crypto');
function key() {
    const value = process.env.CALENDAR_ENCRYPTION_KEY || '';
    if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('CALENDAR_ENCRYPTION_KEY_INVALID');
    return Buffer.from(value, 'hex');
}
function encrypt(value) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    return [iv, Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]), cipher.getAuthTag()].map(b => b.toString('base64')).join(':');
}
function decrypt(value) {
    if (!value) return undefined;
    const [iv, body, tag] = value.split(':').map(s => Buffer.from(s, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
function createClient(row, db) {
    const { google } = require('googleapis');
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, require('../lib/googleCalendarCallback')(process.env));
    auth.setCredentials({ access_token: decrypt(row.google_access_token), refresh_token: decrypt(row.google_refresh_token),
        expiry_date: row.google_token_expiry ? new Date(row.google_token_expiry).getTime() : undefined });
    let persistence = Promise.resolve();
    let persistenceError;
    auth.on('tokens', tokens => {
        persistence = persistence.then(() => db.query(`UPDATE user_calendar_tokens SET
            google_access_token=COALESCE($3,google_access_token),google_refresh_token=COALESCE($4,google_refresh_token),
            google_token_expiry=COALESCE($5,google_token_expiry) WHERE user_id=$1 AND google_email=$2 AND google_connected=true`,
        [row.user_id, row.google_email, tokens.access_token ? encrypt(tokens.access_token) : null,
            tokens.refresh_token ? encrypt(tokens.refresh_token) : null, tokens.expiry_date ? new Date(tokens.expiry_date) : null])).catch(error => { persistenceError = error; });
    });
    const api = google.calendar({ version: 'v3', auth });
    return { events: api.events, flush: async () => { await persistence; if (persistenceError) throw persistenceError; } };
}
module.exports = { createClient };
