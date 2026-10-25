'use strict';
const {createHash} = require('node:crypto');

const CONSENT_VERSION = 'melamedia-transactional-whatsapp-v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(new Error(code),{code}); };

function getConfig(env=process.env) {
    const captureEnabled=env.CENTRAL_SYSTEM_MESSAGES_CAPTURE_ENABLED==='true';
    const dispatchEnabled=env.CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED==='true';
    const mode=env.CENTRAL_SYSTEM_MESSAGES_MODE || '';
    const deploymentId=env.CENTRAL_SYSTEM_MESSAGES_DEPLOYMENT_ID || '';
    const ownerUserId=Number(env.CENTRAL_SYSTEM_MESSAGES_OWNER_USER_ID || 0);
    const shared=String(env.MULTI_TENANT_MODE || '').trim().toLowerCase()==='true';
    if (!captureEnabled) return Object.freeze({captureEnabled:false,dispatchEnabled:false,configured:false,mode,deploymentId,ownerUserId:null});
    if (!/^[a-z][a-z0-9-]{2,63}$/.test(deploymentId) ||
        (shared ? mode!=='sharedsignup'||env.TENANT_DB_ISOLATION_ENABLED!=='1' : mode!=='dedicated') ||
        (!shared && (!Number.isSafeInteger(ownerUserId)||ownerUserId<=0))) fail('SYSTEM_MESSAGES_CONFIGURATION_REQUIRED');
    // No endpoint override: the pinned SDK permits only the Central intake.
    const fingerprint=hash(JSON.stringify({deploymentId,mode,ownerUserId:shared?null:ownerUserId,productId:'layerwebsites'}));
    return Object.freeze({captureEnabled,dispatchEnabled,configured:true,mode,deploymentId,ownerUserId:shared?null:ownerUserId,fingerprint});
}

function normalizeRecipient(raw) {
    if (typeof raw!=='string') return null;
    const phone=raw.replace(/[\s()-]/g,'');
    if (/^0\d{8,9}$/.test(phone)) return '+972'+phone.slice(1);
    if (/^972\d{8,9}$/.test(phone)) return '+'+phone;
    return /^\+[1-9]\d{7,14}$/.test(phone)?phone:null;
}

function officeKey(officeId,config) {
    if (config.mode==='dedicated') {
        if (officeId!=null) fail('SYSTEM_MESSAGES_OFFICE_MISMATCH');
        return 'dedicated';
    }
    if (!UUID.test(String(officeId || ''))) fail('SYSTEM_MESSAGES_OFFICE_REQUIRED');
    return String(officeId).toLowerCase();
}
module.exports={CONSENT_VERSION,UUID,hash,fail,getConfig,normalizeRecipient,officeKey};
