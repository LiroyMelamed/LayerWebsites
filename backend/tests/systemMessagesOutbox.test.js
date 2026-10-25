'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {createSystemMessagesService,CONSENT_VERSION,normalizeRecipient}=require('../lib/systemMessages');
const scope=require('../lib/tenant/databaseScope');

const OFFICE_A='11111111-1111-4111-8111-111111111111';
const OFFICE_B='22222222-2222-4222-8222-222222222222';
const PAYMENT='33333333-3333-4333-8333-333333333333';
const SIGNUP='44444444-4444-4444-8444-444444444444';

test('transactional legal system-message outbox (synthetic PostgreSQL only)',async t=>{
    const pg=new PGlite();
    await pg.exec(`
        CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY,owner_user_id integer);
        CREATE TABLE users(userid integer PRIMARY KEY,name text,phonenumber text,role text,law_firm_tenant_id uuid);
        CREATE TABLE platform_admins(user_id integer PRIMARY KEY,is_active boolean);
        CREATE TABLE firm_billing(id integer PRIMARY KEY,law_firm_tenant_id uuid,status text);
        CREATE TABLE firm_payment_intents(id uuid PRIMARY KEY,law_firm_tenant_id uuid,kind text,status text,
            amount_ils numeric,settled_at timestamptz,signup_intent_id uuid);
        CREATE TABLE signup_intents(id uuid PRIMARY KEY,law_firm_tenant_id uuid,status text);
        CREATE ROLE system_message_app NOSUPERUSER NOBYPASSRLS;
        GRANT SELECT,INSERT,UPDATE,DELETE ON firm_billing TO system_message_app;
        CREATE FUNCTION public.office_row_allowed(id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
            SELECT current_setting('app.office_mode',true)='system' OR
                (current_setting('app.office_mode',true)='office' AND id::text=current_setting('app.office_id',true)) $$;
        CREATE FUNCTION public.guard_office_owner() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF OLD.law_firm_tenant_id IS DISTINCT FROM NEW.law_firm_tenant_id THEN RAISE EXCEPTION 'office immutable'; END IF; RETURN NEW; END $$;
    `);
    await pg.exec(fs.readFileSync(path.join(__dirname,'../migrations/2026-10-25_system_messages.sql'),'utf8'));
    let when=new Date('2026-10-25T12:00:00.000Z'),calls=[],responses=[],failReceipt=false;
    const query=async(sql,params=[])=>{
        if(failReceipt&&sql.includes('SET attempt_count=attempt_count+1')) {failReceipt=false;throw Error('synthetic lost receipt commit');}
        const r=await pg.query(sql,params);return {...r,rowCount:r.affectedRows ?? r.rows.length};
    };
    const adapter={query,async connect(){return {query,release(){}};}};
    const env={CENTRAL_SYSTEM_MESSAGES_CAPTURE_ENABLED:'true',CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED:'true',
        CENTRAL_SYSTEM_MESSAGES_MODE:'dedicated',CENTRAL_SYSTEM_MESSAGES_DEPLOYMENT_ID:'legal-qa-platform',
        CENTRAL_SYSTEM_MESSAGES_OWNER_USER_ID:'1',CENTRAL_SYSTEM_MESSAGES_HMAC_KEY:'synthetic-test-only-key-not-a-provider-secret',BACKGROUND_JOBS_ENABLED:'true'};
    const service=createSystemMessagesService({database:adapter,env,now:()=>when,
        clientFactory:()=>({async attempt(prepared){calls.push(structuredClone(prepared));return responses.length?responses.shift():
            {state:'accepted',eventId:prepared.eventId,id:crypto.randomUUID(),status:'pending',replayed:false,canRetrySameEvent:false};}})});
    const tx=async fn=>{await query('BEGIN');try{const result=await fn(adapter);await query('COMMIT');return result;}catch(e){await query('ROLLBACK');throw e;}};
    const tick=(ms=100)=>{when=new Date(+when+ms);};
    const consent=async(optedIn=true,extra={})=>{
        tick();return tx(client=>service.setConsent(client,{ownerUserId:1,recipient:'+972501234567',recipientName:'בדיקת מנוי',optedIn,
            version:CONSENT_VERSION,sourceRef:'settings:'+crypto.randomUUID(),...extra}));
    };
    const insertPayment=async(extra={})=>query(`INSERT INTO firm_payment_intents(id,kind,status,amount_ils,settled_at,law_firm_tenant_id,signup_intent_id)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[extra.id || PAYMENT,extra.kind || 'renewal',extra.status || 'succeeded',extra.amount || 123.45,
        extra.at || when,extra.officeId || null,extra.signupId || null]);
    const reset=async()=>{
        await pg.exec('RESET ROLE; TRUNCATE central_system_message_outbox,central_system_message_consents,firm_payment_intents,signup_intents,platform_admins,users,law_firm_tenants,firm_billing;');
        await query("INSERT INTO users VALUES(1,'בדיקת מנוי','0501234567','Admin',null),(2,'מנהל נוסף','0501234568','Admin',null)");
        await query('INSERT INTO platform_admins VALUES(1,true),(2,true)');
        await query("INSERT INTO firm_billing VALUES(1,null,'active')");
        when=new Date('2026-10-25T12:00:00.000Z');calls=[];responses=[];failReceipt=false;
        env.CENTRAL_SYSTEM_MESSAGES_CAPTURE_ENABLED='true';env.CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED='true';
    };
    t.after(()=>pg.close());

    await t.test('off by default does not query schema or contact a provider',async()=>{
        const disabled=createSystemMessagesService({database:{connect(){throw Error('must not connect');}},env:{},clientFactory(){throw Error('must not send');}});
        assert.equal((await disabled.getConsent()).available,false);
        assert.equal((await disabled.setConsent(null)).skipped,true);
        assert.equal((await disabled.enqueuePaymentReceived(null)).reason,'disabled');
        assert.equal((await disabled.enqueueSubscriptionUpdate(null)).reason,'disabled');
        assert.deepEqual(await disabled.flush(),{disabled:true,processed:0});
        assert.equal(disabled.startWorker().started,false);
    });
    await t.test('trusted deployment, runtime mode and explicit owner configuration are mandatory',async()=>{
        assert.throws(()=>createSystemMessagesService({env:{...env,CENTRAL_SYSTEM_MESSAGES_DEPLOYMENT_ID:'bad/url'}}).getConfig(),/CONFIGURATION_REQUIRED/);
        assert.throws(()=>createSystemMessagesService({env:{...env,MULTI_TENANT_MODE:'true'}}).getConfig(),/CONFIGURATION_REQUIRED/);
        assert.throws(()=>createSystemMessagesService({env:{...env,MULTI_TENANT_MODE:' TRUE '}}).getConfig(),/CONFIGURATION_REQUIRED/);
        assert.equal(createSystemMessagesService({env:{...env,MULTI_TENANT_MODE:' TRUE ',TENANT_DB_ISOLATION_ENABLED:'1',CENTRAL_SYSTEM_MESSAGES_MODE:'sharedsignup'}}).getConfig().mode,'sharedsignup');
        assert.equal(normalizeRecipient('050-123-4567'),'+972501234567');
        assert.equal(normalizeRecipient('javascript:123'),null);
        await reset();await assert.rejects(service.getConsent({ownerUserId:2}),/OWNER_REQUIRED/);
    });
    await t.test('migration rejects NULL-office tricks and copies explicit private app grants',async()=>{
        await reset();
        await assert.rejects(query(`INSERT INTO central_system_message_consents VALUES
            ('legal-qa-platform','wrong-office',null,1,'+972501234567','בדיקה',true,$1,now(),'test',$2,now())`,[CONSENT_VERSION,crypto.randomUUID()]),/check constraint/i);
        const permissions=(await query("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='system_message_app' AND table_name='central_system_message_outbox'")).rows;
        assert.deepEqual(permissions.map(p=>p.privilege_type).sort(),['DELETE','INSERT','SELECT','UPDATE']);
        const publicGrants=(await query("SELECT privilege_type FROM information_schema.table_privileges WHERE grantee='PUBLIC' AND table_name='central_system_message_outbox'")).rows;
        assert.equal(publicGrants.length,0);
    });
    await t.test('no billing consent, platform-admin list or setup payment grants messaging',async()=>{
        await reset();await insertPayment();
        assert.equal((await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}))).reason,'explicit_consent_required');
        await consent();
        await query("UPDATE firm_payment_intents SET kind='setup' WHERE id=$1",[PAYMENT]);
        assert.equal((await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}))).reason,'card_verification');
        await query("UPDATE firm_payment_intents SET kind='renewal',signup_intent_id=$2 WHERE id=$1",[PAYMENT,SIGNUP]);
        assert.equal((await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}))).reason,'card_verification');
        assert.equal((await query("SELECT count(*)::int n FROM central_system_message_outbox WHERE event_family='payment_received'")).rows[0].n,0);
    });
    await t.test('settlement and exact prepared payment roll back together; pending cannot enqueue',async()=>{
        await reset();await consent();await insertPayment({status:'pending'});
        await assert.rejects(tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT,status:'succeeded',amount_ils:1}})),/PAYMENT_NOT_SETTLED/);
        await assert.rejects(tx(async c=>{
            await c.query("UPDATE firm_payment_intents SET status='succeeded' WHERE id=$1",[PAYMENT]);
            await service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}});
            throw Error('synthetic source rollback');
        }),/synthetic source rollback/);
        assert.equal((await query('SELECT status FROM firm_payment_intents WHERE id=$1',[PAYMENT])).rows[0].status,'pending');
        assert.equal((await query("SELECT count(*)::int n FROM central_system_message_outbox WHERE event_family='payment_received'")).rows[0].n,0);
    });
    await t.test('stable UUID/bytes/amount and source dedupe survive settlement replay',async()=>{
        await reset();await consent();await insertPayment();
        const first=await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT,amount_ils:1}}));
        const bytes=(await query('SELECT prepared FROM central_system_message_outbox WHERE id=$1',[first.eventId])).rows[0].prepared;
        tick(60_000);
        const replay=await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}));
        assert.equal(replay.eventId,first.eventId);assert.equal(replay.replayed,true);
        assert.deepEqual((await query('SELECT prepared FROM central_system_message_outbox WHERE id=$1',[first.eventId])).rows[0].prepared,bytes);
        assert.equal(JSON.parse(bytes.body).message.amountCents,12345);
        assert.equal(JSON.parse(bytes.body).recipient,'+972501234567');
        assert.equal(Object.hasOwn(JSON.parse(bytes.body),'officeId'),false);
        await assert.rejects(query("UPDATE central_system_message_outbox SET prepared='{}'::jsonb WHERE id=$1",[first.eventId]),/EVENT_IMMUTABLE/);
    });
    await t.test('withdrawal cancels pending and old grant/action replay never restores it',async()=>{
        await reset();const sourceRef='settings:'+crypto.randomUUID();
        const initial=await consent(true,{sourceRef});await insertPayment();
        const payment=await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}));
        await consent(false);
        const replay=await consent(true,{sourceRef});
        assert.equal(replay.eventId,initial.eventId);assert.equal(replay.replayed,true);
        assert.equal((await service.getConsent({ownerUserId:1})).optedIn,false);
        assert.equal((await query('SELECT status FROM central_system_message_outbox WHERE id=$1',[payment.eventId])).rows[0].status,'cancelled');
        await query("UPDATE users SET phonenumber='0501234569' WHERE userid=1");
        await assert.rejects(consent(true,{sourceRef,recipient:'+972501234569'}),/ACTION_CONFLICT/);
    });
    await t.test('old or future capture time cannot overwrite consent or become fresh on provision',async()=>{
        await reset();await consent();tick(60_000);
        await assert.rejects(consent(false,{capturedAt:'2026-10-25T11:00:00Z'}),/CONSENT_ORDER_CONFLICT/);
        await assert.rejects(consent(false,{capturedAt:'2026-10-26T12:00:00Z'}),/CONSENT_INVALID/);
        assert.equal((await service.getConsent({ownerUserId:1})).optedIn,true);
    });
    await t.test('missing optional owner/contact never rolls back a verified unconsented payment',async()=>{
        await reset();await insertPayment({status:'pending'});
        await query('UPDATE platform_admins SET is_active=false WHERE user_id=1');
        const skipped=await tx(async c=>{
            await c.query("UPDATE firm_payment_intents SET status='succeeded' WHERE id=$1",[PAYMENT]);
            return service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}});
        });
        assert.equal(skipped.reason,'explicit_consent_required');
        assert.equal((await query('SELECT status FROM firm_payment_intents WHERE id=$1',[PAYMENT])).rows[0].status,'succeeded');
        await reset();await consent();await insertPayment();
        await query('UPDATE platform_admins SET is_active=false WHERE user_id=1');
        assert.equal((await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}))).reason,'owner_contact_unavailable');
        assert.equal(calls.length,0);
    });
    await t.test('changed phone requires fresh consent and revokes former grant without transferring it',async()=>{
        await reset();await consent();await service.flush();
        await query("UPDATE users SET phonenumber='0501234569' WHERE userid=1");
        await insertPayment();
        assert.equal((await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}))).reason,'explicit_consent_required');
        await consent(true,{recipient:'+972501234569'});
        await service.flush();
        const revoke=calls.map(c=>JSON.parse(c.body)).find(c=>c.recipient==='+972501234567'&&c.optedIn===false);
        const grant=calls.map(c=>JSON.parse(c.body)).find(c=>c.recipient==='+972501234569'&&c.optedIn===true);
        assert.ok(revoke);assert.ok(grant);
        assert.equal(calls.filter(c=>!c.path.endsWith('/consent')).length,0);
    });
    await t.test('consent acknowledgement precedes payment; Central receipt is enqueue only',async()=>{
        await reset();await consent();await insertPayment();
        await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}));
        const result=await service.flush();
        assert.equal(result.accepted,2);assert.equal(calls.length,2);
        assert.match(calls[0].path,/consent$/);assert.equal(JSON.parse(calls[1].body).message.kind,'payment_received');
        assert.deepEqual((await query('SELECT DISTINCT status,central_status FROM central_system_message_outbox')).rows,[{status:'accepted',central_status:'pending'}]);
    });
    await t.test('timeout/429 retry retains exact same event and respects off switch',async()=>{
        await reset();await consent();await service.flush();await insertPayment();
        const payment=await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}));
        responses.push({state:'acceptance_unknown',code:'CENTRAL_ENQUEUE_OUTCOME_UNKNOWN',canRetrySameEvent:true});
        await service.flush();const before=calls.at(-1);
        env.CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED='false';tick(6000);
        assert.equal((await service.flush()).disabled,true);assert.equal(calls.length,2);
        env.CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED='true';
        responses.push({state:'rejected',code:'CENTRAL_ENQUEUE_REJECTED_429',canRetrySameEvent:true});
        await service.flush();tick(11_000);await service.flush();
        assert.equal(calls.length,4);assert.deepEqual(calls[2],before);assert.deepEqual(calls[3],before);
        assert.equal((await query('SELECT status FROM central_system_message_outbox WHERE id=$1',[payment.eventId])).rows[0].status,'accepted');
    });
    await t.test('lost receipt after Central acceptance recovers same UUID after five minutes',async()=>{
        await reset();await consent();await service.flush();await insertPayment();
        const payment=await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}));
        failReceipt=true;
        await assert.rejects(service.flush(),/synthetic lost receipt commit/);
        const before=calls.at(-1);
        assert.equal((await query('SELECT status FROM central_system_message_outbox WHERE id=$1',[payment.eventId])).rows[0].status,'sending');
        tick(360_000);await service.flush();
        assert.deepEqual(calls.at(-1),before);
        assert.equal((await query('SELECT status FROM central_system_message_outbox WHERE id=$1',[payment.eventId])).rows[0].status,'accepted');
    });
    await t.test('never-accepted stale source/consent is retained for reconciliation without rewriting',async()=>{
        await reset();await consent();const before=(await query('SELECT prepared FROM central_system_message_outbox')).rows[0].prepared;
        tick(360_000);await service.flush();
        assert.equal(calls.length,0);
        assert.equal((await query('SELECT status FROM central_system_message_outbox')).rows[0].status,'reconciliation');
        assert.deepEqual((await query('SELECT prepared FROM central_system_message_outbox')).rows[0].prepared,before);
    });
    await t.test('original settlement/capture time is not silently refreshed for an old source',async()=>{
        await reset();
        const oldCapture=new Date(+when-600_000).toISOString();
        await consent(true,{capturedAt:oldCapture});
        const saved=(await query('SELECT prepared FROM central_system_message_outbox')).rows[0].prepared;
        assert.equal(JSON.parse(saved.body).capturedAt,oldCapture);
        await service.flush();assert.equal(calls.length,0);
        await reset();await consent();await insertPayment({at:new Date(+when-600_000)});
        await assert.rejects(tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT},occurredAt:when})),/SOURCE_TIME_INVALID/);
        await query('UPDATE firm_payment_intents SET settled_at=null WHERE id=$1',[PAYMENT]);
        assert.equal((await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}))).reason,'verified_source_time_required');
    });
    await t.test('definite Central rejection is retained without a replacement event or automatic retry',async()=>{
        await reset();await consent();
        responses.push({state:'rejected',httpStatus:409,code:'CENTRAL_ENQUEUE_REJECTED_409',canRetrySameEvent:false});
        await service.flush();tick(60_000);await service.flush();
        assert.equal(calls.length,1);
        assert.equal((await query('SELECT status,last_code FROM central_system_message_outbox')).rows[0].status,'reconciliation');
    });
    await t.test('fresh explicit withdrawal bypasses an old stale withdrawal and reaches Central',async()=>{
        await reset();await consent();await service.flush();
        await consent(false);tick(360_000);await service.flush();
        const old=(await query("SELECT id,prepared,status FROM central_system_message_outbox WHERE status='reconciliation'")).rows[0];
        assert.ok(old);
        await consent(false);await service.flush();
        const acceptedWithdrawals=calls.map(c=>JSON.parse(c.body)).filter(c=>c.optedIn===false);
        assert.equal(acceptedWithdrawals.length,1);
        assert.equal(acceptedWithdrawals[0].capturedAt,when.toISOString());
        const retained=(await query('SELECT prepared,status FROM central_system_message_outbox WHERE id=$1',[old.id])).rows[0];
        assert.deepEqual(retained.prepared,old.prepared);assert.equal(retained.status,'reconciliation');
    });
    await t.test('stale signup consent requires a new owner action, without blocking real payment',async()=>{
        await reset();const original=await consent(true,{capturedAt:new Date(+when-600_000).toISOString()});
        const before=await service.getConsent({ownerUserId:1});
        assert.equal(before.confirmationRequired,true);assert.equal(before.optedIn,false);
        await insertPayment();
        assert.equal((await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}))).reason,'consent_confirmation_required');
        const fresh=await consent(true);assert.notEqual(fresh.eventId,original.eventId);
        await service.flush();
        const after=await service.getConsent({ownerUserId:1});
        assert.equal(after.confirmationRequired,false);assert.equal(after.optedIn,true);
        assert.equal((await query('SELECT status FROM firm_payment_intents WHERE id=$1',[PAYMENT])).rows[0].status,'succeeded');
        assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0].body).eventId,fresh.eventId);
    });
    await t.test('automatic worker requires explicit background/dispatch gates and has one unref timer',async()=>{
        await reset();env.BACKGROUND_JOBS_ENABLED='false';
        assert.equal(service.startWorker().started,false);
        env.BACKGROUND_JOBS_ENABLED='true';
        assert.equal(service.startWorker().started,true);
        assert.equal(service.startWorker().reason,'already_running');
        service.stopWorker();
        assert.equal(calls.length,0);
    });
    await t.test('phone change, owner removal and source change cancel without payment POST',async()=>{
        for(const mutation of ["UPDATE users SET phonenumber='0501234569' WHERE userid=1",
            'UPDATE platform_admins SET is_active=false WHERE user_id=1',"UPDATE firm_payment_intents SET amount_ils=999 WHERE id='"+PAYMENT+"'"]){
            await reset();await consent();await service.flush();await insertPayment();
            const payment=await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}));
            await query(mutation);await service.flush();
            assert.equal(calls.length,1);
            assert.equal((await query('SELECT status FROM central_system_message_outbox WHERE id=$1',[payment.eventId])).rows[0].status,'cancelled');
        }
    });
    await t.test('different deployment config cannot route an old prepared event',async()=>{
        await reset();await consent();await service.flush();await insertPayment();
        const payment=await tx(c=>service.enqueuePaymentReceived(c,{intent:{id:PAYMENT}}));
        env.CENTRAL_SYSTEM_MESSAGES_OWNER_USER_ID='2';await service.flush();
        assert.equal(calls.length,1);
        assert.equal((await query('SELECT status FROM central_system_message_outbox WHERE id=$1',[payment.eventId])).rows[0].status,'cancelled');
        env.CENTRAL_SYSTEM_MESSAGES_OWNER_USER_ID='1';
    });
    await t.test('shared office scope, owner binding and actual RLS isolate consent histories',async()=>{
        await reset();
        await query('INSERT INTO law_firm_tenants VALUES($1,11),($2,12)',[OFFICE_A,OFFICE_B]);
        await query("INSERT INTO users VALUES(11,'משרד א','0501111111','Admin',$1),(12,'משרד ב','0502222222','Admin',$2)",[OFFICE_A,OFFICE_B]);
        const shared=createSystemMessagesService({database:adapter,env:{...env,MULTI_TENANT_MODE:'true',TENANT_DB_ISOLATION_ENABLED:'1',
            CENTRAL_SYSTEM_MESSAGES_MODE:'sharedsignup',CENTRAL_SYSTEM_MESSAGES_DEPLOYMENT_ID:'legal-shared-signup'},now:()=>when});
        await assert.rejects(shared.getConsent({officeId:OFFICE_A,ownerUserId:11}),/SCOPE_REQUIRED/);
        for(const [officeId,ownerUserId,recipient,recipientName] of [[OFFICE_A,11,'+972501111111','משרד א'],[OFFICE_B,12,'+972502222222','משרד ב']]){
            await scope.withOffice(officeId,()=>tx(c=>shared.setConsent(c,{officeId,ownerUserId,recipient,recipientName,optedIn:true,
                version:CONSENT_VERSION,sourceRef:'signup:'+crypto.randomUUID()})));
        }
        await assert.rejects(scope.withOffice(OFFICE_A,()=>shared.getConsent({officeId:OFFICE_A,ownerUserId:12})),/OWNER_CONTACT_REQUIRED/);
        await query("SELECT set_config('app.office_mode','office',false),set_config('app.office_id',$1,false)",[OFFICE_A]);
        await pg.exec('SET ROLE system_message_app');
        const rows=(await query('SELECT law_firm_tenant_id FROM central_system_message_consents')).rows;
        assert.equal(rows.length,1);assert.equal(rows[0].law_firm_tenant_id,OFFICE_A);
        await assert.rejects(query('UPDATE central_system_message_consents SET law_firm_tenant_id=$1',[OFFICE_B]),/office immutable/);
        await pg.exec('RESET ROLE');
    });
});
