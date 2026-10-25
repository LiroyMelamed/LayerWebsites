'use strict';
const crypto=require('node:crypto');
const sdk=require('./vendor/index.cjs');
const scope=require('../tenant/databaseScope');
const {CONSENT_VERSION,UUID,hash,fail,getConfig:readConfig,normalizeRecipient,officeKey}=require('./config');

// No database or provider is opened by importing this module. Disabled releases
// can run before the additive migration without touching a new table.
function createSystemMessagesService({database,env=process.env,now=()=>new Date(),randomUUID=crypto.randomUUID,clientFactory=sdk.createSystemMessagesClient}={}) {
    const db=()=>database || require('../../config/db');
    const getConfig=()=>readConfig(env);
    const clock=()=>new Date(now());
    const identity=(officeId,config)=>{
        const key=officeKey(officeId,config);
        if (config.mode==='sharedsignup') {
            const selected=scope.current();
            if (selected.mode!=='system' && (selected.mode!=='office'||selected.tenantId!==key)) fail('SYSTEM_MESSAGES_SCOPE_REQUIRED');
        }
        return key;
    };
    const lock=(client,config,key)=>client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['central-system:'+config.deploymentId+':'+key]);
    async function owner(client,config,officeId,ownerUserId) {
        identity(officeId,config);
        let row;
        if (config.mode==='sharedsignup') {
            row=(await client.query(`SELECT u.userid,u.name,u.phonenumber FROM law_firm_tenants t
                JOIN users u ON u.userid=t.owner_user_id AND u.law_firm_tenant_id=t.id
                WHERE t.id=$1 AND u.userid=$2 AND u.role='Admin' FOR SHARE OF t,u`,[officeId,ownerUserId])).rows[0];
        } else {
            if (Number(ownerUserId)!==config.ownerUserId) fail('SYSTEM_MESSAGES_OWNER_REQUIRED');
            row=(await client.query(`SELECT u.userid,u.name,u.phonenumber FROM users u
                JOIN platform_admins pa ON pa.user_id=u.userid AND pa.is_active=TRUE
                WHERE u.userid=$1 AND u.law_firm_tenant_id IS NULL AND u.role='Admin' FOR SHARE OF u,pa`,[config.ownerUserId])).rows[0];
        }
        const recipient=normalizeRecipient(row?.phonenumber);
        if (!row||!recipient) fail('SYSTEM_MESSAGES_OWNER_CONTACT_REQUIRED');
        return {ownerUserId:Number(row.userid),recipient,recipientName:String(row.name || '').trim()};
    }
    async function accountOwner(client,config,officeId) {
        const ownerUserId=config.mode==='dedicated'?config.ownerUserId:
            (await client.query('SELECT owner_user_id FROM law_firm_tenants WHERE id=$1 FOR SHARE',[officeId])).rows[0]?.owner_user_id;
        return owner(client,config,officeId,ownerUserId);
    }
    async function currentConsent(client,config,key,ownerUserId) {
        return (await client.query(`SELECT * FROM central_system_message_consents
            WHERE deployment_id=$1 AND office_key=$2 AND owner_user_id=$3 FOR UPDATE`,[config.deploymentId,key,ownerUserId])).rows[0];
    }
    async function confirmationRequired(client,consent) {
        const grant=(await client.query('SELECT status FROM central_system_message_outbox WHERE id=$1',[consent.consent_event_id])).rows[0];
        return !grant||['blocked','reconciliation','cancelled'].includes(grant.status)||
            (grant.status!=='accepted'&&+clock()>+new Date(consent.captured_at)+300_000);
    }
    async function existing(client,config,key,family,sourceKey,recipient) {
        return (await client.query(`SELECT * FROM central_system_message_outbox
            WHERE deployment_id=$1 AND office_key=$2 AND event_family=$3 AND source_key=$4 AND recipient=$5`,
        [config.deploymentId,key,family,sourceKey,recipient])).rows[0];
    }
    async function consentAction(client,config,key,sourceKey) {
        return (await client.query(`SELECT * FROM central_system_message_outbox WHERE deployment_id=$1
            AND office_key=$2 AND event_family='consent' AND source_key=$3 LIMIT 1`,[config.deploymentId,key,sourceKey])).rows[0];
    }
    async function insert(client,config,{officeId,key,ownerUserId,recipient,family,sourceKey,semanticHash,consentEventId,prepared,occurredAt,expiresAt}) {
        const result=await client.query(`INSERT INTO central_system_message_outbox
            (id,deployment_id,config_fingerprint,office_key,law_firm_tenant_id,owner_user_id,recipient,event_family,
             source_key,semantic_hash,consent_event_id,prepared,occurred_at,expires_at,next_attempt_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$13)
            ON CONFLICT(deployment_id,office_key,event_family,source_key,recipient) DO NOTHING RETURNING id`,
        [prepared.eventId,config.deploymentId,config.fingerprint,key,officeId || null,ownerUserId,recipient,family,sourceKey,
            semanticHash,consentEventId || null,JSON.stringify(prepared),occurredAt,expiresAt]);
        return {queued:Boolean(result.rowCount),eventId:result.rows[0]?.id || (await existing(client,config,key,family,sourceKey,recipient))?.id};
    }
    async function getConsent({officeId=null,ownerUserId}={}) {
        const config=getConfig();
        if (!config.captureEnabled) return {available:false,version:CONSENT_VERSION,optedIn:false};
        const key=identity(officeId,config);
        const client=await db().connect();
        try {
            await client.query('BEGIN');
            const contact=await owner(client,config,officeId,ownerUserId);
            const consent=await currentConsent(client,config,key,contact.ownerUserId);
            const eligible=Boolean(consent?.opted_in&&consent.recipient===contact.recipient&&consent.consent_version===CONSENT_VERSION);
            const needsConfirmation=eligible?await confirmationRequired(client,consent):false;
            await client.query('COMMIT');
            return {available:true,version:CONSENT_VERSION,optedIn:eligible&&!needsConfirmation,confirmationRequired:needsConfirmation,
                recipient:contact.recipient,recipientName:contact.recipientName,capturedAt:consent?.captured_at || null};
        } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
    }
    /** Caller owns BEGIN/COMMIT together with the authenticated source action. */
    async function setConsent(client,{officeId=null,ownerUserId,recipient,recipientName,optedIn,version,sourceRef,actionId,capturedAt}={}) {
        const config=getConfig();
        if (!config.captureEnabled) return {available:false,skipped:true};
        if (typeof optedIn!=='boolean'||version!==CONSENT_VERSION || typeof sourceRef!=='string'||
            !/^[\p{L}\p{N} _./:#-]{1,80}$/u.test(sourceRef)||!/(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i.test(sourceRef)) fail('SYSTEM_MESSAGES_CONSENT_INVALID');
        if (actionId!=null&&!UUID.test(actionId)) fail('SYSTEM_MESSAGES_CONSENT_INVALID');
        const key=identity(officeId,config);
        await lock(client,config,key);
        const contact=await owner(client,config,officeId,ownerUserId);
        if (normalizeRecipient(recipient)!==contact.recipient) fail('SYSTEM_MESSAGES_OWNER_CONTACT_CHANGED');
        // The UI never chooses an alternate contact/name. Use the verified row.
        if (recipientName!=null&&String(recipientName).trim()!==contact.recipientName) fail('SYSTEM_MESSAGES_OWNER_CONTACT_CHANGED');
        const sourceKey=actionId?'action:'+actionId:sourceRef;
        const semanticHash=hash(JSON.stringify({officeId:officeId || null,ownerUserId:contact.ownerUserId,recipient:contact.recipient,optedIn,version,sourceRef}));
        const previous=await consentAction(client,config,key,sourceKey);
        if (previous) {
            if (previous.semantic_hash!==semanticHash) fail('SYSTEM_MESSAGES_ACTION_CONFLICT');
            // An old opt-in replay must never replace a subsequent withdrawal.
            return {available:true,queued:false,replayed:true,eventId:previous.id};
        }
        const timestamp=capturedAt==null?clock():new Date(capturedAt);
        if (!Number.isFinite(+timestamp)||+timestamp>+clock()+60_000) fail('SYSTEM_MESSAGES_CONSENT_INVALID');
        const current=await currentConsent(client,config,key,contact.ownerUserId);
        if (current&&+new Date(current.captured_at)>=+timestamp) fail('SYSTEM_MESSAGES_CONSENT_ORDER_CONFLICT');
        const changedPhone=Boolean(current&&current.recipient!==contact.recipient);
        if (changedPhone&&current.opted_in&&optedIn) {
            // Explicit consent for a new number does not transfer the old grant.
            // Queue a withdrawal for the formerly verified number in this action.
            const withdrawalId=randomUUID();
            const withdrawal=sdk.prepareConsent({version:1,eventId:withdrawalId,productId:'layerwebsites',recipient:current.recipient,optedIn:false,
                capturedAt:timestamp.toISOString(),proofRef:'legal-consent:'+withdrawalId,scope:'transactional'});
            await insert(client,config,{officeId,key,ownerUserId:contact.ownerUserId,recipient:current.recipient,family:'consent',
                sourceKey:'withdraw-contact:'+sourceKey,semanticHash:hash(semanticHash+':'+current.recipient+':withdraw'),prepared:withdrawal,
                occurredAt:timestamp,expiresAt:new Date(+timestamp+300_000)});
        }
        const id=randomUUID();
        const proofRef='legal-consent:'+id;
        const targetRecipient=!optedIn&&changedPhone?current.recipient:contact.recipient;
        const prepared=sdk.prepareConsent({version:1,eventId:id,productId:'layerwebsites',recipient:targetRecipient,optedIn,
            capturedAt:timestamp.toISOString(),proofRef,scope:'transactional'});
        await insert(client,config,{officeId,key,ownerUserId:contact.ownerUserId,recipient:targetRecipient,family:'consent',sourceKey,
            semanticHash,prepared,occurredAt:timestamp,expiresAt:new Date(+timestamp+300_000)});
        await client.query(`INSERT INTO central_system_message_consents
            (deployment_id,office_key,law_firm_tenant_id,owner_user_id,recipient,recipient_name,opted_in,consent_version,captured_at,proof_ref,consent_event_id)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT(deployment_id,office_key,owner_user_id) DO UPDATE SET
            recipient=EXCLUDED.recipient,recipient_name=EXCLUDED.recipient_name,opted_in=EXCLUDED.opted_in,
            consent_version=EXCLUDED.consent_version,captured_at=EXCLUDED.captured_at,proof_ref=EXCLUDED.proof_ref,
            consent_event_id=EXCLUDED.consent_event_id,updated_at=now()`,
        [config.deploymentId,key,officeId || null,contact.ownerUserId,contact.recipient,contact.recipientName,optedIn,version,timestamp,proofRef,id]);
        if (!optedIn||changedPhone) await client.query(`UPDATE central_system_message_outbox SET status='cancelled',last_code='CONSENT_WITHDRAWN',updated_at=now()
            WHERE deployment_id=$1 AND recipient=$2 AND event_family<>'consent' AND status IN ('pending','sending')`,[config.deploymentId,changedPhone?current.recipient:contact.recipient]);
        return {available:true,queued:true,replayed:false,eventId:id,optedIn,capturedAt:timestamp.toISOString()};
    }
    async function enqueueMessage(client,{officeId,ownerUserId,family,sourceKey,message,occurredAt}) {
        const config=getConfig();
        if (!config.captureEnabled) return {skipped:true,reason:'disabled'};
        const key=identity(officeId,config);
        await lock(client,config,key);
        const anyConsent=(await client.query(`SELECT owner_user_id FROM central_system_message_consents
            WHERE deployment_id=$1 AND office_key=$2 AND opted_in LIMIT 1`,[config.deploymentId,key])).rows[0];
        if (!anyConsent) return {skipped:true,reason:'explicit_consent_required'};
        let contact;
        try {contact=ownerUserId?await owner(client,config,officeId,ownerUserId):await accountOwner(client,config,officeId);} catch(error) {
            if (!String(error.code || '').startsWith('SYSTEM_MESSAGES_OWNER_')) throw error;
            await client.query(`UPDATE central_system_message_outbox SET status='cancelled',last_code='OWNER_CONTACT_UNAVAILABLE',updated_at=now()
                WHERE deployment_id=$1 AND office_key=$2 AND event_family<>'consent' AND status IN ('pending','sending')`,[config.deploymentId,key]);
            return {skipped:true,reason:'owner_contact_unavailable'};
        }
        const consent=await currentConsent(client,config,key,contact.ownerUserId);
        if (!consent?.opted_in||consent.recipient!==contact.recipient||consent.consent_version!==CONSENT_VERSION) return {skipped:true,reason:'explicit_consent_required'};
        if (await confirmationRequired(client,consent)) return {skipped:true,reason:'consent_confirmation_required'};
        if (!contact.recipientName||contact.recipientName.length>96||/[\p{Cc}\p{Cf}<>]|(?:https?:|www\.|@)/iu.test(contact.recipientName)) return {skipped:true,reason:'owner_label_unsupported'};
        const previous=await existing(client,config,key,family,sourceKey,contact.recipient);
        const semanticHash=hash(JSON.stringify({family,sourceKey,ownerUserId:contact.ownerUserId,message}));
        if (previous) {
            if (previous.semantic_hash!==semanticHash) fail('SYSTEM_MESSAGES_ACTION_CONFLICT');
            return {queued:false,replayed:true,eventId:previous.id};
        }
        const timestamp=occurredAt==null?clock():new Date(occurredAt);
        if (!Number.isFinite(+timestamp)||+timestamp>+clock()+60_000) fail('SYSTEM_MESSAGES_SOURCE_TIME_INVALID');
        const expiry=new Date(+timestamp+86_400_000);
        const prepared=sdk.prepareMessage({version:1,eventId:randomUUID(),productId:'layerwebsites',occurredAt:timestamp.toISOString(),expiresAt:expiry.toISOString(),
            recipient:contact.recipient,recipientName:contact.recipientName,
            consent:{optedIn:true,capturedAt:new Date(consent.captured_at).toISOString(),proofRef:consent.proof_ref,scope:'transactional'},message});
        return insert(client,config,{officeId,key,ownerUserId:contact.ownerUserId,recipient:contact.recipient,family,sourceKey,semanticHash,
            consentEventId:consent.consent_event_id,prepared,occurredAt:timestamp,expiresAt:expiry});
    }
    async function enqueuePaymentReceived(client,{intent,occurredAt}={}) {
        const config=getConfig();
        if (!config.captureEnabled) return {skipped:true,reason:'disabled'};
        if (!UUID.test(String(intent?.id || ''))) fail('SYSTEM_MESSAGES_PAYMENT_REQUIRED');
        // Read the row written by the caller's settlement transaction, never a
        // browser/callback amount. Verification is the settlement's prerequisite.
        const saved=(await client.query('SELECT * FROM firm_payment_intents WHERE id=$1 FOR SHARE',[intent.id])).rows[0];
        if (!saved||saved.status!=='succeeded') fail('SYSTEM_MESSAGES_PAYMENT_NOT_SETTLED');
        if (saved.kind==='setup'||saved.signup_intent_id) return {skipped:true,reason:'card_verification'};
        identity(saved.law_firm_tenant_id || null,config);
        const amount=Number(saved.amount_ils),amountCents=Math.round(amount*100);
        if (!Number.isFinite(amount)||amount<=0||!Number.isSafeInteger(amountCents)||Math.abs(amountCents/100-amount)>0.000001) fail('SYSTEM_MESSAGES_PAYMENT_AMOUNT_INVALID');
        const settledAt=new Date(saved.settled_at);
        if (!saved.settled_at||!Number.isFinite(+settledAt)) return {skipped:true,reason:'verified_source_time_required'};
        if (occurredAt!=null&&+new Date(occurredAt)!==+settledAt) fail('SYSTEM_MESSAGES_SOURCE_TIME_INVALID');
        return enqueueMessage(client,{officeId:saved.law_firm_tenant_id || null,family:'payment_received',sourceKey:'payment:'+saved.id,
            occurredAt:settledAt,message:{kind:'payment_received',amountCents,currency:'ILS',reference:'payment:'+saved.id}});
    }
    async function enqueueSubscriptionUpdate(client,{officeId=null,ownerUserId,sourceId,status,planLabel,periodEndsOn,occurredAt}={}) {
        const config=getConfig();
        if (!config.captureEnabled) return {skipped:true,reason:'disabled'};
        identity(officeId,config);
        if (status!=='active'||!UUID.test(String(sourceId || ''))||!officeId) fail('SYSTEM_MESSAGES_SUBSCRIPTION_SOURCE_REQUIRED');
        // Currently only paid-and-provisioned signup is a subscription source.
        // No mapping of account signup to an unsupported free-text/welcome event.
        const provisioned=(await client.query(`SELECT id FROM signup_intents WHERE id=$1 AND law_firm_tenant_id=$2 AND status='completed' FOR SHARE`,[sourceId,officeId])).rows[0];
        if (!provisioned) fail('SYSTEM_MESSAGES_SUBSCRIPTION_NOT_PROVISIONED');
        return enqueueMessage(client,{officeId,ownerUserId,family:'subscription_update',sourceKey:'signup:'+sourceId,occurredAt,
            message:{kind:'subscription_update',status,planLabel,periodEndsOn}});
    }
    async function finish(client,row,status,code,extra={}) {
        await client.query(`UPDATE central_system_message_outbox SET status=$3,last_code=$4,
            central_queue_id=coalesce($5,central_queue_id),central_status=coalesce($6,central_status),
            lease_id=null,lease_until=null,next_attempt_at=$7,updated_at=now() WHERE id=$1 AND lease_id=$2`,
        [row.id,row.lease_id,status,code,extra.id || null,extra.centralStatus || null,extra.nextAt || clock()]);
    }
    async function claim(config) {
        const client=await db().connect();
        try {
            await client.query('BEGIN');
            const row=(await client.query(`SELECT * FROM central_system_message_outbox WHERE deployment_id=$1
                AND ((status='pending' AND next_attempt_at<=$2) OR (status='sending' AND lease_until<=$2))
                ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,[config.deploymentId,clock()])).rows[0];
            if (!row) {await client.query('COMMIT');return null;}
            row.lease_id=randomUUID();
            // A stale committed sending marker is conservatively a possible
            // Central acceptance, even if our receipt transaction never committed.
            // Recover its same UUID after the new-event freshness window.
            if (row.status==='sending') row.attempt_count=Math.max(1,row.attempt_count+1);
            await client.query(`UPDATE central_system_message_outbox SET status='sending',lease_id=$2,lease_until=$3,attempt_count=$4,updated_at=now() WHERE id=$1`,
            [row.id,row.lease_id,new Date(+clock()+60_000),row.attempt_count]);
            await client.query('COMMIT');
            return row;
        } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
    }
    async function dispatchClaim(config,claimed) {
        const client=await db().connect();
        try {
            await client.query('BEGIN');
            await lock(client,config,claimed.office_key);
            const row=(await client.query('SELECT * FROM central_system_message_outbox WHERE id=$1 AND lease_id=$2 AND status=\'sending\' FOR UPDATE',[claimed.id,claimed.lease_id])).rows[0];
            if (!row) {await client.query('COMMIT');return 'skipped';}
            const current=getConfig();
            if (!current.dispatchEnabled||current.fingerprint!==config.fingerprint||row.config_fingerprint!==config.fingerprint) {
                await finish(client,row,current.dispatchEnabled?'cancelled':'pending','CONFIGURATION_CHANGED');
                await client.query('COMMIT');return 'blocked';
            }
            let prepared;
            try {prepared=sdk.restorePreparedEvent(row.prepared);} catch (_) {
                await finish(client,row,'reconciliation','STORED_EVENT_INVALID');await client.query('COMMIT');return 'reconciliation';
            }
            const body=JSON.parse(prepared.body);
            if (prepared.eventId!==row.id||body.recipient!==row.recipient||body.productId!=='layerwebsites'||
                (row.event_family==='consent'?prepared.path!==sdk.CONSENT_PATH:prepared.path!==sdk.MESSAGE_PATH||body.message.kind!==row.event_family)) fail('SYSTEM_MESSAGES_STORED_BINDING_INVALID');
            if (row.attempt_count>=8) {
                await finish(client,row,'reconciliation','CENTRAL_RECEIPT_RECONCILIATION_REQUIRED');await client.query('COMMIT');return 'reconciliation';
            }
            if (row.event_family!=='consent'||body.optedIn) {
                let contact;
                try {contact=await owner(client,current,row.law_firm_tenant_id,row.owner_user_id);} catch(error) {
                    if (!String(error.code || '').startsWith('SYSTEM_MESSAGES_')) throw error;
                    await finish(client,row,'cancelled','OWNER_CHANGED');await client.query('COMMIT');return 'cancelled';
                }
                const consent=await currentConsent(client,current,row.office_key,row.owner_user_id);
                const expected=row.event_family==='consent'?row.id:row.consent_event_id;
                if (contact.recipient!==row.recipient||!consent?.opted_in||consent.recipient!==row.recipient||consent.consent_event_id!==expected) {
                    await finish(client,row,'cancelled','CONSENT_OR_CONTACT_CHANGED');await client.query('COMMIT');return 'cancelled';
                }
                if (row.event_family!=='consent') {
                    const grant=(await client.query('SELECT status FROM central_system_message_outbox WHERE id=$1',[row.consent_event_id])).rows[0];
                    if (grant?.status!=='accepted') {
                        const blocked=['blocked','cancelled','reconciliation'].includes(grant?.status)||!grant;
                        await finish(client,row,blocked?'blocked':'pending','CONSENT_NOT_ACKNOWLEDGED',{nextAt:new Date(+clock()+1000)});
                        await client.query('COMMIT');return blocked?'blocked':'deferred';
                    }
                    if (row.event_family==='payment_received') {
                        const sourceId=row.source_key.replace(/^payment:/,'');
                        const paid=(await client.query('SELECT status,kind,signup_intent_id,amount_ils,law_firm_tenant_id FROM firm_payment_intents WHERE id=$1 FOR SHARE',[sourceId])).rows[0];
                        if (!paid||paid.status!=='succeeded'||paid.kind==='setup'||paid.signup_intent_id||
                            (paid.law_firm_tenant_id || null)!==(row.law_firm_tenant_id || null)||Math.round(Number(paid.amount_ils)*100)!==body.message.amountCents) {
                            await finish(client,row,'cancelled','PAYMENT_SOURCE_CHANGED');await client.query('COMMIT');return 'cancelled';
                        }
                    }
                }
            }
            // Current local proof gates grants; Central also applies monotonic
            // capture time. Fresh withdrawals must never wait behind a stale or
            // terminal historical consent event. Preserve old bytes for review.
            if (row.attempt_count===0 && +clock()>+new Date(row.occurred_at)+300_000) {
                await finish(client,row,'reconciliation','CENTRAL_FRESHNESS_WINDOW_ELAPSED');await client.query('COMMIT');return 'reconciliation';
            }
            // A committed sending/lease marker already exists. Hold the consent
            // action lock for the bounded intake POST so an opt-out cannot commit
            // between the final check and dispatch. No WhatsApp provider is local.
            const secret=env.CENTRAL_SYSTEM_MESSAGES_HMAC_KEY;
            const transport=clientFactory({deployment:config.deploymentId,secret,timeoutMs:10_000});
            const result=await transport.attempt(prepared);
            await client.query('UPDATE central_system_message_outbox SET attempt_count=attempt_count+1 WHERE id=$1',[row.id]);
            if (result.state==='accepted') {
                await finish(client,row,'accepted',null,{id:result.id,centralStatus:result.status});
            } else if (result.canRetrySameEvent) {
                const delay=Math.min(60_000,5000*2**row.attempt_count);
                await finish(client,row,'pending',result.code,{nextAt:new Date(+clock()+delay)});
            } else {
                await finish(client,row,'reconciliation',result.code || 'CENTRAL_ENQUEUE_REJECTED');
            }
            await client.query('COMMIT');
            return result.state==='accepted'?'accepted':result.canRetrySameEvent?'retry':'reconciliation';
        } catch(error) {
            await client.query('ROLLBACK');
            // Keep the committed marker. Recovery reuses the exact event, even
            // after Central committed but our receipt transaction rolled back.
            throw error;
        } finally {client.release();}
    }
    async function flush({limit=20}={}) {
        const config=getConfig();
        if (!config.captureEnabled||!config.dispatchEnabled) return {disabled:true,processed:0};
        if (typeof env.CENTRAL_SYSTEM_MESSAGES_HMAC_KEY!=='string'||env.CENTRAL_SYSTEM_MESSAGES_HMAC_KEY.length<32||env.CENTRAL_SYSTEM_MESSAGES_HMAC_KEY.length>8192) fail('SYSTEM_MESSAGES_KEY_REQUIRED');
        if (!Number.isInteger(limit)||limit<1||limit>100) fail('SYSTEM_MESSAGES_BATCH_INVALID');
        return scope.withSystem(async()=>{
            const counts={processed:0};
            for (let i=0;i<limit;i++) {
                const row=await claim(config);if(!row)break;
                const result=await dispatchClaim(config,row);
                counts.processed++;counts[result]=(counts[result] || 0)+1;
            }
            return counts;
        });
    }
    let timer=null,running=false;
    function startWorker() {
        if (timer) return {started:false,reason:'already_running'};
        const config=getConfig();
        if (!config.captureEnabled||!config.dispatchEnabled||env.BACKGROUND_JOBS_ENABLED!=='true') return {started:false,reason:'disabled'};
        if (typeof env.CENTRAL_SYSTEM_MESSAGES_HMAC_KEY!=='string'||env.CENTRAL_SYSTEM_MESSAGES_HMAC_KEY.length<32||env.CENTRAL_SYSTEM_MESSAGES_HMAC_KEY.length>8192) fail('SYSTEM_MESSAGES_KEY_REQUIRED');
        timer=setInterval(async()=>{
            if (running||env.BACKGROUND_JOBS_ENABLED!=='true') return;
            running=true;
            try {await flush();} catch (_) {console.warn('[central-system-messages] queued intake requires review');}
            finally {running=false;}
        },15_000);
        timer.unref?.();
        return {started:true};
    }
    function stopWorker() {if(timer)clearInterval(timer);timer=null;}
    return {getConfig,getConsent,setConsent,enqueuePaymentReceived,enqueueSubscriptionUpdate,flush,startWorker,stopWorker};
}
module.exports={...createSystemMessagesService(),createSystemMessagesService,CONSENT_VERSION,normalizeRecipient};
