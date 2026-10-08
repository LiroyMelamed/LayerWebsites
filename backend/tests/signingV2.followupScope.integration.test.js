const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { deliveryHarness } = require('./helpers/signingV2Delivery');
const actions = require('../services/signingV2/actions');
const { createPublicSigningService, CONSENT_VERSION } = require('../services/signingV2/publicSigning');
const { reportTaskIssue } = require('../services/signingV2/taskIssues');
const { currentSenderScope, senderCanAccess } = require('../services/signingV2/followupScope');
const { loadPublicGrant } = require('../services/signingV2/grants');

// Competing DB commits simulate state races, not acceptance evidence. Real
// consent/OTP/PDF acceptance remains in returningSigner/publicSigning regressions.
test('follow-ups freeze exact tasks and recheck current sender access before dispatch',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 120000 }, async t => {
    const pool = require('../config/db'); t.after(()=>pool.end());
    const h = await deliveryHarness(pool,{ endpoints:Array(8).fill('shared@example.invalid'),configure:({definition,packages})=>{
        const personId=packages[0].roles.employee[0].personId, role=packages[0].roles.employee;
        for(const item of packages) {
            item.roles={employee:role,later:role};
            item.delivery={[personId]:{locale:'en',channels:['email'],email:'shared@example.invalid'}};
        }
        definition.stages.push({key:'later',label:'Later',after:'employee'});
        definition.roles.push({key:'later',label:'Same person later',capacity:'personal',min:1,max:1,stage:1});
        definition.signingRules.push({type:'specific',roles:[{key:'later',occurrence:0}]});
        definition.documents[1].fields.find(field=>field.type==='signature').roleKey='later';
        definition.documents[0].fields.push({id:'laterSamePdf',type:'signature',roleKey:'later',occurrence:0,pageNum:1,x:30,y:220,width:200,height:60,required:true});
        return definition;
    }});t.after(h.close);
    const receipt=await h.submit();await h.activate();await h.drain('dispatch_delivery');
    const {byKey,people}=await h.targets(receipt.submissionId),{f}=h;
    const service=createPublicSigningService({pool,storage:{},otpKey:Buffer.alloc(32,7)});
    const originalToken=h.provider.calls[0].url.split('/s/')[1];
    assert.equal((await service.describe(originalToken)).packages.length,8);
    const target=index=>({packageId:byKey[`employee-${index}`].id,personId:people[`employee-${index}`],purpose:'reminder'});
    const tasks=async index=>(await pool.query(`SELECT t.* FROM signing_tasks t WHERE t.revision_id=$1 ORDER BY stage,id`,[byKey[`employee-${index}`].revision_id])).rows;
    const queue=async index=>{const input=target(index),preview=await actions.previewParticipantAction(pool,f.scope,input);assert.equal(preview.eligible,true,JSON.stringify(preview));return actions.executeParticipantAction(pool,f.scope,{...input,previewHash:preview.previewHash,idempotencyKey:randomUUID()});};
    await t.test('targeted reminder opens reviewed package/PDF/tasks only, excluding shared-person run and future role on the same PDF',async()=>{
        const old=await tasks(0),first=old.find(item=>item.state==='ready'),future=old.find(item=>item.stage===1 && item.document_id===first.document_id);
        const op=await queue(0),count=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count+1);
        const token=h.provider.calls.at(-1).url.split('/s/')[1];assert.notEqual(token,originalToken);
        const scopedGrant=await loadPublicGrant(pool,token);assert.deepEqual(scopedGrant.allowed_task_ids,[first.id]);
        await assert.rejects(pool.query('UPDATE signing_public_grants SET allowed_task_ids=NULL WHERE id=$1',[scopedGrant.id]),/immutable/);
        const view=await service.describe(token);assert.equal(view.packages.length,1);assert.equal(view.packages[0].packageId,target(0).packageId);
        assert.equal(view.packages[0].documents.length,1);assert.deepEqual(view.packages[0].documents[0].tasks.map(item=>item.taskId),[first.id]);
        assert.equal((await actions.operationStatus(pool,f.scope,op.operationId)).items[0].state,'provider_accepted');
        await pool.query("UPDATE signing_tasks SET state='ready' WHERE id=$1",[future.id]);
        await assert.rejects(service.createSession(token,{taskIds:[future.id],consentVersion:CONSENT_VERSION}),{errorCode:'TASK_UNAVAILABLE'});
        await assert.rejects(reportTaskIssue(pool,token,{taskIds:[future.id],kind:'decline',idempotencyKey:randomUUID()}),{errorCode:'TASK_UNAVAILABLE'});
        assert.deepEqual((await service.describe(token)).packages[0].documents[0].tasks.map(item=>item.taskId),[first.id]);
        assert.equal((await service.describe(originalToken)).packages.length,8,'original invitation unchanged');
    });
    await t.test('completed reviewed stage cannot invite a returning person to a later stage',async()=>{
        const op=await queue(1),old=await tasks(1);await pool.query("UPDATE signing_tasks SET state=CASE WHEN stage=0 THEN 'accepted' ELSE 'ready' END,version=version+1 WHERE revision_id=$1",[old[0].revision_id]);
        const count=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count);
        assert.equal((await actions.operationStatus(pool,f.scope,op.operationId)).items[0].state,'skipped_completed');
    });
    await t.test('pause/resume version changes cancel even if tasks are ready again',async()=>{
        const op=await queue(2);await pool.query("UPDATE signing_tasks SET version=version+2 WHERE revision_id=$1 AND state='ready'",[byKey['employee-2'].revision_id]);
        const count=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count);
        const state=(await actions.operationStatus(pool,f.scope,op.operationId)).items[0];assert.equal(state.state,'cancelled');assert.equal(state.errorCode,'ACTION_SCOPE_CHANGED');
    });
    await t.test('changed task version invalidates review before creating a message',async()=>{
        const input=target(3),preview=await actions.previewParticipantAction(pool,f.scope,input);
        await pool.query("UPDATE signing_tasks SET version=version+1 WHERE revision_id=$1 AND state='ready'",[byKey['employee-3'].revision_id]);
        await assert.rejects(actions.executeParticipantAction(pool,f.scope,{...input,previewHash:preview.previewHash,idempotencyKey:randomUUID()}),{errorCode:'PREVIEW_CHANGED'});
    });
    await t.test('newly ready unreviewed task cancels rather than enlarging selection',async()=>{
        const op=await queue(4);await pool.query("UPDATE signing_tasks SET state='ready',version=version+1 WHERE revision_id=$1 AND stage=1",[byKey['employee-4'].revision_id]);
        const count=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count);
        assert.equal((await actions.operationStatus(pool,f.scope,op.operationId)).items[0].errorCode,'ACTION_SCOPE_CHANGED');
    });
    await t.test('sender who lost office access cannot dispatch queued reminder',async()=>{
        const op=await queue(5);await pool.query("UPDATE users SET role='User' WHERE userid=$1",[f.scope.userId]);
        const count=h.provider.calls.length;try {await h.drain('dispatch_delivery');}finally{await pool.query("UPDATE users SET role='Admin' WHERE userid=$1",[f.scope.userId]);}
        assert.equal(h.provider.calls.length,count);assert.equal((await actions.operationStatus(pool,f.scope,op.operationId)).items[0].errorCode,'SENDER_ACCESS_CHANGED');
    });
    await t.test('dispatch permissions use active custom role, explicit package assignment and current upload capability',async()=>{
        const permissions={version:2,areas:{signing:{visible:true,actions:['view','upload'],dataScope:'assigned_only'}}};
        const role=(await pool.query('INSERT INTO firm_staff_roles(name,permissions) VALUES($1,$2) RETURNING id',[`QA followup ${randomUUID()}`,permissions])).rows[0].id;
        const user=(await pool.query("INSERT INTO users(name,email,role,passwordhash,firm_staff_role_id) VALUES('QA followup staff',$1,'Staff','synthetic',$2) RETURNING userid",[`${randomUUID()}@example.invalid`,role])).rows[0].userid;
        const pkg=target(3).packageId;
        assert.equal(await senderCanAccess(pool,f.contextId,user,pkg),false);
        await pool.query('INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id) VALUES($1,$2,$3)',[f.contextId,pkg,user]);
        assert.equal(await senderCanAccess(pool,f.contextId,user,pkg),true);
        assert.equal(await senderCanAccess(pool,f.contextId,user,target(0).packageId),false);
        await pool.query('UPDATE firm_staff_roles SET is_active=false WHERE id=$1',[role]);
        assert.equal(await currentSenderScope(pool,f.contextId,user),null);
        await pool.query('UPDATE firm_staff_roles SET is_active=true,permissions=$2 WHERE id=$1',[role,{version:2,areas:{signing:{visible:true,actions:['view'],dataScope:'all_firm'}}}]);
        assert.equal(await currentSenderScope(pool,f.contextId,user),null);
        assert.equal(await currentSenderScope(pool,f.contextId,-1),null);
    });

    for (const [index, change] of [[6,'contact'],[7,'link']]) await t.test(`${change} revoked while dispatch waits for the task fence is rechecked`,async()=>{
        const op=await queue(index),deliveryId=op.items[0].deliveryId;
        const delivery=(await pool.query('SELECT * FROM signing_deliveries WHERE id=$1',[deliveryId])).rows[0];
        const locker=await pool.connect();let running;
        try {
            await locker.query('BEGIN');
            await locker.query('SELECT id FROM signing_packages WHERE id=$1 FOR UPDATE',[target(index).packageId]);
            const count=h.provider.calls.length;running=h.drain('dispatch_delivery');
            let blocked=false;
            for(let attempt=0;attempt<100;attempt++) {
                blocked=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE 'SELECT r.workflow_state,p.active_revision_id%'")).rowCount>0;
                if(blocked)break;
                await new Promise(resolve=>setTimeout(resolve,20));
            }
            assert.equal(blocked,true,'worker reached the task fence after its first profile/grant read');
            if(change==='contact')await locker.query('UPDATE signing_delivery_profiles SET version=version+1 WHERE id=$1',[delivery.profile_id]);
            else await locker.query('UPDATE signing_public_grants SET revoked_at=clock_timestamp() WHERE id=$1',[delivery.grant_id]);
            await locker.query('COMMIT');await running;
            assert.equal(h.provider.calls.length,count);
            assert.equal((await actions.operationStatus(pool,f.scope,op.operationId)).items[0].errorCode,change==='contact'?'CONTACT_CHANGED':'LINK_UNAVAILABLE');
        } finally {await locker.query('ROLLBACK');locker.release();if(running)await running;}
    });

});
