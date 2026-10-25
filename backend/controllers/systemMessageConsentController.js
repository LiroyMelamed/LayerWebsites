'use strict';

const ACTION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const consentError = (code, status = 400) => require('../utils/appError').createAppError(code, status,
    code === 'FORBIDDEN' ? 'אין הרשאה לשנות את העדפת ההודעות.' :
        status === 503 ? 'הגדרת הודעות המנוי אינה זמינה כרגע. אפשר לנסות שוב מאוחר יותר.' :
            'העדפת ההודעות לא נשמרה. יש לרענן את העמוד ולנסות שוב.');

// The authenticated owner's current database contact is authoritative. Neither
// a browser-supplied recipient nor a JWT's stale phone is a consent recipient.
function createSystemMessageConsentController({
    database = require('../config/db'),
    messages = require('../lib/systemMessages'),
} = {}) {
    async function owner(req, client, config) {
        const id = Number(req.user?.UserId);
        if (!Number.isSafeInteger(id) || id <= 0 || !req.firmPermissionContextValidated) throw consentError('FORBIDDEN', 403);
        const officeId = req.firmTenantId || null;
        if (config.mode === 'dedicated') {
            if (officeId || config.ownerUserId !== id) throw consentError('FORBIDDEN', 403);
        } else if (config.mode === 'sharedsignup') {
            if (!officeId || req.isOfficeOwner !== true || req.user?.Role !== 'Admin') throw consentError('FORBIDDEN', 403);
        } else throw consentError('SYSTEM_MESSAGES_UNAVAILABLE', 503);
        const result = await client.query(`SELECT u.userid,u.name,u.phonenumber,u.law_firm_tenant_id
            FROM users u WHERE u.userid=$1 AND u.role='Admin'
            AND u.law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid
            AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM law_firm_tenants t
                WHERE t.id=$2 AND t.owner_user_id=u.userid AND t.is_active=true))`, [id, officeId]);
        const user = result.rows[0];
        if (!user) throw consentError('FORBIDDEN', 403);
        return { officeId, ownerUserId: id, recipient: messages.normalizeRecipient(user.phonenumber), recipientName: user.name };
    }
    function unavailable(res, config) {
        res.setHeader?.('Cache-Control', 'no-store');
        if (!config.captureEnabled || !config.configured) {
            res.status(200).json({ available: false, version: messages.CONSENT_VERSION });
            return true;
        }
        return false;
    }
    const get = async (req, res, next) => {
        try {
            const config = messages.getConfig();
            if (unavailable(res, config)) return;
            const identity = await owner(req, database, config);
            return res.status(200).json(await messages.getConsent(identity));
        } catch (error) { return next(error); }
    };
    const save = async (req, res, next) => {
        let client;
        try {
            const config = messages.getConfig();
            res.setHeader?.('Cache-Control', 'no-store');
            if (!config.captureEnabled || !config.configured) throw consentError('SYSTEM_MESSAGES_UNAVAILABLE', 503);
            const body = req.body;
            if (!body || Array.isArray(body) || typeof body !== 'object' ||
                Object.keys(body).some(key => !['optedIn', 'consentVersion', 'actionId'].includes(key)) ||
                typeof body.optedIn !== 'boolean' || body.consentVersion !== messages.CONSENT_VERSION || !ACTION_ID.test(body.actionId || '')) {
                throw consentError('INVALID_SYSTEM_MESSAGE_CONSENT');
            }
            client = await database.connect();
            await client.query('BEGIN');
            const identity = await owner(req, client, config);
            await messages.setConsent(client, { ...identity, optedIn: body.optedIn,
                version: body.consentVersion, sourceRef: 'settings:' + body.actionId, actionId: body.actionId });
            await client.query('COMMIT');
            return res.status(200).json(await messages.getConsent(identity));
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            return next(error);
        } finally { client?.release(); }
    };
    return { get, save };
}

module.exports = { createSystemMessageConsentController };
