'use strict';
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const scope = require('../lib/tenant/databaseScope');
const { runWithTenant } = require('../lib/tenant/tenantContext');
const { getTenantById } = require('../lib/tenant/tenantService');
const { createAppError } = require('../utils/appError');

async function continueInOffice(row, req, next) {
    if (!row) throw createAppError('NOT_FOUND',404);
    if (req.tenant?.id && String(req.tenant.id) !== String(row.law_firm_tenant_id || '')) throw createAppError('NOT_FOUND',404);
    req.publicOfficeResolved = true;
    if (!row.law_firm_tenant_id) return scope.withLegacyOffice(next);
    const tenant = await getTenantById(row.law_firm_tenant_id);
    if (!tenant?.isActive) throw createAppError('NOT_FOUND',404);
    req.tenant=tenant;req.tenantSlug=tenant.slug;
    return runWithTenant(tenant,next);
}
const point = async (sql,args) => (await scope.withSystem(()=>pool.query(sql,args))).rows[0];
function capabilityScope(resolve) {
    return async (req,_res,next) => {
        if (!scope.enabled()) return next();
        try { return await continueInOffice(await resolve(req),req,next); }
        catch(error) { return next(error?.httpStatus ? error : createAppError('NOT_FOUND',404)); }
    };
}
const signing = type => capabilityScope(async req => {
    const decoded=jwt.verify(String(req.params.token||''),process.env.JWT_SECRET,{algorithms:['HS256']});
    if (decoded.typ!==type || !Number.isSafeInteger(Number(decoded.signingFileId)) || Number(decoded.signingFileId)<=0) throw Error('invalid capability');
    return point('SELECT law_firm_tenant_id FROM signingfiles WHERE signingfileid=$1',[decoded.signingFileId]);
});
const signingShort=capabilityScope(req=>point('SELECT law_firm_tenant_id FROM signing_short_links WHERE slug=$1 AND expires_at>now()',[req.params.slug]));
const invite=capabilityScope(req=>point(`SELECT law_firm_tenant_id FROM calendar_events WHERE invite_token=$1
    UNION ALL SELECT law_firm_tenant_id FROM calendar_event_clients WHERE invite_token=$1 LIMIT 1`,[req.params.token]));
const calendarFeed=capabilityScope(req=>point('SELECT law_firm_tenant_id FROM user_calendar_tokens WHERE ical_feed_token=$1',[String(req.params.token||'').replace(/\.ics$/i,'').trim()]));
const calendarShort=capabilityScope(req=>point('SELECT law_firm_tenant_id FROM public_short_links WHERE slug=$1 AND (expires_at IS NULL OR expires_at>now())',[req.params.slug]));
const calendarOAuth=capabilityScope(req=>{
    const {userId}=require('../lib/calendarOAuthState').verifyOAuthState(String(req.query.state||''));
    return point('SELECT law_firm_tenant_id FROM users WHERE userid=$1',[userId]);
});
const refresh=capabilityScope(req=>{
    const raw=String(req.body?.refreshToken||'').trim();
    if (!raw || raw.length>4096) throw Error('invalid capability');
    const hash=crypto.createHash('sha256').update(raw).update(String(process.env.REFRESH_TOKEN_PEPPER||'')).digest('hex');
    return point(`SELECT u.law_firm_tenant_id FROM refresh_tokens rt JOIN users u USING(userid)
        WHERE rt.token_hash=$1 AND rt.revoked_at IS NULL AND rt.expires_at>now()`,[hash]);
});
const logout=capabilityScope(req=>{
    if (req.body?.refreshToken) {
        const raw=String(req.body.refreshToken).trim();if(raw.length>4096)throw Error('invalid capability');
        const hash=crypto.createHash('sha256').update(raw).update(String(process.env.REFRESH_TOKEN_PEPPER||'')).digest('hex');
        return point('SELECT u.law_firm_tenant_id FROM refresh_tokens rt JOIN users u USING(userid) WHERE rt.token_hash=$1',[hash]);
    }
    const decoded=jwt.verify(String(req.headers.authorization||'').split(' ')[1],process.env.JWT_SECRET,{algorithms:['HS256']});
    return point('SELECT law_firm_tenant_id FROM users WHERE userid=$1',[decoded.userid]);
});
const signingBatch=capabilityScope(req=>{
    const decoded=jwt.verify(String(req.params.token||''),process.env.JWT_SECRET,{algorithms:['HS256']});
    if(decoded.typ!=='signing_batch'||!/^[a-f0-9-]{36}$/i.test(String(decoded.recipientId||'')))throw Error('invalid capability');
    return point('SELECT law_firm_tenant_id FROM signing_batch_recipients WHERE id=$1',[decoded.recipientId]);
});
const signingGrant=capabilityScope(req=>{
    const token=String(req.get('X-Signing-Grant')||'');
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('invalid capability');
    return point(`SELECT law_firm_tenant_id FROM signing_public_grants WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`,[crypto.createHash('sha256').update(token).digest('hex')]);
});
const signingPackage=capabilityScope(req=>{
    const decoded=jwt.verify(String(req.params.token||''),process.env.JWT_SECRET,{algorithms:['HS256']});
    if(decoded.typ!=='signing_package_view'||!/^[a-f0-9-]{36}$/i.test(String(decoded.batchId||'')))throw Error('invalid capability');
    return point('SELECT law_firm_tenant_id FROM signing_batches WHERE id=$1',[decoded.batchId]);
});
const paymentReturn=capabilityScope(req=>{
    const uniq=String(req.query?.uniqId||req.query?.orderUniqId||'').trim();
    const id=String(req.query?.intentId||'').trim();
    if(uniq && uniq.length<=200) return point('SELECT law_firm_tenant_id FROM firm_payment_intents WHERE takbull_uniq_id=$1',[uniq]);
    if(/^[a-f0-9-]{36}$/i.test(id)) return point('SELECT law_firm_tenant_id FROM firm_payment_intents WHERE id=$1',[id]);
    throw Error('invalid capability');
});
module.exports={signing,signingShort,signingBatch,signingGrant,signingPackage,paymentReturn,invite,calendarFeed,calendarShort,calendarOAuth,refresh,logout};
