const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

test('saved signing SMS templates control invitation, reminder, completion and rejection workflows', {
    skip: process.env.LEGAL_DB_QA !== 'true', timeout: 60000,
}, async (t) => {
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_PORT, '55439'); // Explicitly owned candidate cluster.
    assert.equal(process.env.DB_NAME, 'codex_settings_20261006');
    process.env.SIGNING_ENABLED = 'true';
    process.env.SIGNING_CLIENT_OTP_REQUIRED = 'true';
    process.env.SIGNING_OTP_ENABLED = 'true';
    process.env.SIGNING_OTP_PEPPER = 'synthetic-signing-otp-only';
    process.env.JWT_SECRET = 'synthetic-pdf-qa-only';
    process.env.WEBSITE_DOMAIN = 'qa.example.invalid';
    process.env.S3_ENDPOINT = 'http://127.0.0.1:9';
    process.env.S3_KEY = 'synthetic-qa';
    process.env.S3_SECRET = 'synthetic-qa';
    process.env.S3_BUCKET = 'qa';
    const pool = require('../config/db');
    const settings = require('../services/settingsService');
    for (const table of ['users','signingfiles','platform_settings','signing_file_reminders']) assert.equal(Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count),0);
    const settingKeys=[];
    const saveSetting=async(category,key,value)=>{if(!settingKeys.some(x=>x[0]===category&&x[1]===key))settingKeys.push([category,key]);await settings.upsertSetting(category,key,value,{valueType:'string'});};
    for(const key of ['SIGN_INVITE_SMS','SIGN_REMINDER_SMS','DOC_SIGNED_SMS','DOC_SIGNED_SIGNER_SMS','DOC_REJECTED_SMS'])await saveSetting('templates',key,key+' {{recipientName}} {{documentName}} {{websiteUrl}} {{rejectionReason}}');
    await saveSetting('signing','SIGN_REMINDER_AUTO_ENABLED','true');
    // Own all identities: shared QA fixture IDs can have their roles changed
    // by permission tests, which must not turn signing coverage into a 401.
    const userIds = [];
    for (const role of ['Admin', 'Client', 'Client', 'Client']) {
        const id = crypto.randomUUID();
        const { rows } = await pool.query(
            `INSERT INTO users (name,email,phonenumber,passwordhash,role)
             VALUES ($1,$2,$3,'synthetic-test-only',$4) RETURNING userid`,
            ['Synthetic PDF QA', `${id}@example.invalid`, `+1999${crypto.randomInt(10000000, 99999999)}`, role],
        );
        userIds.push(rows[0].userid);
    }
    const [authorId, firstSignerId, secondSignerId, unrelatedId] = userIds;
    const { r2 } = require('../utils/r2');
    const { PDFDocument } = require('pdf-lib');
    const request = require('supertest');
    const jwt = require('jsonwebtoken');
    const token = (userid, role = 'Client') => jwt.sign({ userid, role }, process.env.JWT_SECRET);
    const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]).drawText('SYNTHETIC QA - NO LEGAL VALIDITY', { x: 40, y: 790, size: 15 });
    const unsigned = Buffer.from(await pdf.save());
    const key = `users/${authorId}/qa-${crypto.randomUUID()}.pdf`;
    const objects = new Map([[key, { bytes: unsigned, type: 'application/pdf' }]]);
    const originalSend = r2.send;
    t.after(() => { r2.send = originalSend; });
    r2.send = async (command) => {
        const { Key, Body, ContentType } = command.input;
        if (command.constructor.name === 'PutObjectCommand') {
            objects.set(Key, { bytes: Buffer.from(Body), type: ContentType });
            return { ETag: hash(Buffer.from(Body)) };
        }
        if (command.constructor.name === 'DeleteObjectCommand') { objects.delete(Key); return {}; }
        const object = objects.get(Key);
        assert.ok(object, 'The requested synthetic storage object must exist');
        if (command.constructor.name === 'HeadObjectCommand') return { ContentLength: object.bytes.length, ContentType: object.type, ETag: hash(object.bytes) };
        assert.equal(command.constructor.name, 'GetObjectCommand');
        return { Body: Readable.from(object.bytes), ContentType: object.type, ETag: hash(object.bytes) };
    };
    // Providers remain isolated; opt in to the actual certificate renderer separately.
    const notifications = require('../services/notifications/notificationOrchestrator');
    const messages = require('../utils/sendMessage');
    const emails = require('../utils/smooveEmailCampaignService');
    const originalEmail = emails.sendEmailCampaign;
    const originalMessage = messages.sendMessage;
    const otpMessages = [];
    messages.sendMessage = async (message) => { otpMessages.push(message); return { ok: true }; };
    emails.sendEmailCampaign = async ({ campaignKey, contactFields }) => {
        assert.equal(campaignKey, 'SIGNING_OTP');
        otpMessages.push(String(contactFields.otp_code));
        return { ok: true };
    };
    t.after(() => { messages.sendMessage = originalMessage; });
    t.after(() => { emails.sendEmailCampaign = originalEmail; });
    const originalNotify = notifications.notifyRecipient;
    const delivered = [];
    notifications.notifyRecipient = async (payload) => {
        delivered.push(payload);
        return { ok: true, outcomes: { sms: { attempted: true, ok: true }, email: { attempted: true, ok: true } } };
    };
    const evidence = require('../lib/renderEvidencePdf');
    const originalRender = evidence.renderEvidencePdf;
    evidence.renderEvidencePdf = async () => unsigned;
    t.after(() => { notifications.notifyRecipient = originalNotify; evidence.renderEvidencePdf = originalRender; });
    // These checks exercise consumers; access-control has its separate HTTP suite.
    const express=require('express'),controller=require('../controllers/signingFileController');
    const app=express();app.use(express.json());app.use((req,res,next)=>{const payload=jwt.verify(String(req.headers.authorization||'').replace(/^Bearer /,''),process.env.JWT_SECRET);req.user={UserId:payload.userid,Role:payload.role};req.firmPermissionMode='legacy';next();});
    app.post('/api/SigningFiles/upload',controller.uploadFileForSigning);
    app.post('/api/SigningFiles/:signingFileId/otp/request',controller.requestSigningOtp);
    app.post('/api/SigningFiles/:signingFileId/otp/verify',controller.verifySigningOtp);
    app.post('/api/SigningFiles/:signingFileId/sign',controller.signFile);
    app.post('/api/SigningFiles/:signingFileId/reject',controller.rejectSigning);
    app.post('/api/SigningFiles/:signingFileId/resend',controller.resendSigningInvite);
    app.use(require('../middlewares/errorHandler'));
    const checkSms=(type,mark,start=0)=>{const found=delivered.slice(start).filter(d=>d.notificationType===type);assert.ok(found.length,type);for(const d of found){assert.ok(d.sms.messageBody.startsWith((type==='DOC_SIGNED'&&d.recipientUserId!==authorId?'DOC_SIGNED_SIGNER_SMS':mark)+' '),d.sms.messageBody);assert.match(d.sms.messageBody,/Synthetic QA - no legal validity\.pdf/);assert.ok(!d.sms.messageBody.includes('{{'));}return found;};
    const extraFileIds=[];
    let fileId;
    t.after(async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("SET LOCAL app.audit_events_allow_delete = 'true'");
            await client.query('DELETE FROM audit_events WHERE signingfileid=ANY($1::int[])', [[fileId,...extraFileIds]]);
            await client.query('DELETE FROM signingfiles WHERE signingfileid=ANY($1::int[])', [[fileId,...extraFileIds]]);
            const slugs = delivered.flatMap((item) => Object.values(item.email?.contactFields || {}))
                .filter((value) => typeof value === 'string' && value.startsWith('https://qa.example.invalid/s/'))
                .map((value) => new URL(value).pathname.split('/').at(-1));
            await client.query('DELETE FROM signing_short_links WHERE slug = ANY($1::text[])', [slugs]);
            await client.query('DELETE FROM audit_events WHERE actor_userid = ANY($1::int[])', [userIds]);
            await client.query('DELETE FROM users WHERE userid = ANY($1::int[])', [userIds]);
            for(const [category,key] of settingKeys)await client.query('DELETE FROM platform_settings WHERE category=$1 AND setting_key=$2',[category,key]);
            await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); settings.invalidateCache(); await pool.end(); }
    });
    const upload = await request(app).post('/api/SigningFiles/upload')
        .set('Authorization', `Bearer ${token(authorId, 'Admin')}`).send({
            fileName: 'Synthetic QA - no legal validity.pdf', fileKey: key,
            signers: [{ userId: firstSignerId, name: 'Synthetic A', deliveryMethod: 'both' }, { userId: secondSignerId, name: 'Synthetic B', deliveryMethod: 'both' }],
            signatureLocations: [firstSignerId, secondSignerId].map((id, index) => ({ pageNum: 1, x: 80 + index * 260, y: 350,
                width: 180, height: 75, signerUserId: id, signerIndex: index, fieldType: 'signature', isRequired: true })),
            requireOtp: true,
        });
    fileId = upload.body.signingFileId;
    assert.equal(upload.status, 200, JSON.stringify(upload.body));
    assert.ok(fileId);
    const { rows: spots } = await pool.query('SELECT signaturespotid,signeruserid FROM signaturespots WHERE signingfileid=$1 ORDER BY signerindex', [fileId]);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const sign = async (spot) => {
        const signingSessionId = crypto.randomUUID();
        const auth = `Bearer ${token(spot.signeruserid)}`;
        const base = `/api/SigningFiles/${fileId}`;
        const post = (suffix, payload) => {
            const call = request(app).post(base + suffix);
            call.set('Authorization', auth);
            return call.send(payload);
        };
        const body = { signatureSpotId: spot.signaturespotid, signatureImage: png, signingSessionId,
            consentAccepted: true, consentVersion: '2026-01-11' };
        const blocked = await post('/sign', body);
        assert.equal(blocked.status, 403);
        assert.equal(blocked.body.errorCode, 'OTP_REQUIRED');
        const beforeCount = otpMessages.length;
        const otpRequest = await post('/otp/request', { signingSessionId });
        assert.equal(otpRequest.status, 200, JSON.stringify(otpRequest.body));
        assert.equal(otpMessages.length, beforeCount + 1);
        const reused = await post('/otp/request', { signingSessionId });
        assert.equal(reused.body.reused, true);
        assert.equal(otpMessages.length, beforeCount + 1, 'Repeated request reuses the challenge without another provider message');
        const otp = otpMessages.at(-1).match(/\b\d{6}\b/)[0];
        const wrongOtp = String((Number(otp) + 1) % 1000000).padStart(6, '0');
        const wrong = await post('/otp/verify', { signingSessionId, otp: wrongOtp });
        assert.equal(wrong.body.verified, false);
        const verified = await post('/otp/verify', { signingSessionId, otp });
        assert.equal(verified.body.verified, true);
        return post('/sign', body);
    };
    await t.test('SIGN_INVITE_SMS and updated resend template reach captured messages',async()=>{
        checkSms('SIGN_INVITE','SIGN_INVITE_SMS');
        await saveSetting('templates','SIGN_INVITE_SMS','UPDATED_INVITE {{recipientName}} {{documentName}} {{websiteUrl}}');const start=delivered.length;
        const r=await request(app).post(`/api/SigningFiles/${fileId}/resend`).set('Authorization',`Bearer ${token(authorId,'Admin')}`).send({signerUserIds:[firstSignerId,secondSignerId]});assert.equal(r.status,200,JSON.stringify(r.body));checkSms('SIGN_INVITE','UPDATED_INVITE',start);
    });
    await t.test('SIGN_REMINDER_SMS reaches due-reminder dispatcher',async()=>{
        await pool.query("UPDATE signing_file_reminders SET scheduled_for=NOW()-interval '1 minute' WHERE signing_file_id=$1",[fileId]);const start=delivered.length;
        const result=await require('../lib/signingFileReminders').processDueSignReminders();assert.equal(result.sent,2);checkSms('SIGN_REMINDER','SIGN_REMINDER_SMS',start);
    });
    await t.test('DOC_SIGNED_SMS reaches finalization after OTP and both signatures',async()=>{
        const start=delivered.length;for(const spot of spots){const result=await sign(spot);assert.equal(result.status,200,JSON.stringify(result.body));}
        const deadline=Date.now()+15000;while(delivered.slice(start).filter(d=>d.notificationType==='DOC_SIGNED').length<2&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));checkSms('DOC_SIGNED','DOC_SIGNED_SMS',start);
    });
    await t.test('DOC_REJECTED_SMS renders configured rejection reason',async()=>{
        const r=await request(app).post('/api/SigningFiles/upload').set('Authorization',`Bearer ${token(authorId,'Admin')}`).send({fileName:'Synthetic QA - no legal validity.pdf',fileKey:key,signers:[{userId:firstSignerId,name:'Synthetic A',deliveryMethod:'both'}],signatureLocations:[{pageNum:1,x:80,y:350,width:180,height:75,signerUserId:firstSignerId,signerIndex:0,fieldType:'signature',isRequired:true}],requireOtp:true});
        if(r.body.signingFileId)extraFileIds.push(r.body.signingFileId);assert.equal(r.status,200,JSON.stringify(r.body));const start=delivered.length;
        const rejected=await request(app).post(`/api/SigningFiles/${r.body.signingFileId}/reject`).set('Authorization',`Bearer ${token(firstSignerId)}`).send({rejectionReason:'Synthetic rejection only'});assert.equal(rejected.status,200,JSON.stringify(rejected.body));for(const d of checkSms('DOC_REJECTED','DOC_REJECTED_SMS',start))assert.match(d.sms.messageBody,/Synthetic rejection only/);
    });
});
