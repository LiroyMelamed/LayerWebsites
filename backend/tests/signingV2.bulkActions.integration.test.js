const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const express=require('express');
const request=require('supertest');
const jwt=require('jsonwebtoken');
const {deliveryHarness}=require('./helpers/signingV2Delivery');
const {freezeSelection}=require('../services/signingV2/selections');
const {previewBulkAction}=require('../services/signingV2/bulkReview');
const {executeBulkAction,bulkOperationStatus,listBulkOperations}=require('../services/signingV2/bulkActions');
const actions=require('../services/signingV2/actions');
const jobs=require('../services/signingV2/jobs');
const {markAbandonedDispatches}=require('../services/signingV2/delivery');
const {loadPublicGrant}=require('../services/signingV2/grants');
const {createPublicSigningService,CONSENT_VERSION}=require('../services/signingV2/publicSigning');

test('durable bulk dispatch only sends reviewed compatible scopes and shrinks visibly',
 {skip:process.env.LEGAL_DB_QA!=='true',timeout:120000},async t=>{
    const pool=require('../config/db');t.after(()=>pool.end());
    const h=await deliveryHarness(pool,{endpoints:Array(18).fill('shared@example.invalid'),configure:({definition,packages})=>{
        const role=packages[0].roles.employee,personId=role[0].personId;
        packages.forEach(item=>{item.roles={employee:role,later:role};item.delivery={[personId]:{locale:'en',channels:['email'],email:'shared@example.invalid'}};});
        definition.stages.push({key:'later',label:'Later',after:'employee'});
        definition.roles.push({key:'later',label:'Same person later',capacity:'personal',min:1,max:1,stage:1});
        definition.signingRules.push({type:'specific',roles:[{key:'later',occurrence:0}]});
        definition.documents[1].fields.find(field=>field.type==='signature').roleKey='later';return definition;
    }});t.after(h.close);
    const receipt=await h.submit();await h.activate();await h.drain('dispatch_delivery');
    const scope={...h.f.scope,send:true},ctx=h.f.contextId;
    const {byKey,people}=await h.targets(receipt.submissionId),personId=people['employee-0'];
    const pkg=index=>byKey[`employee-${index}`];
    const prepare=async(indices,purpose='reminder')=>{
        const frozen=await freezeSelection(pool,scope,{mode:'explicit',packageIds:indices.map(index=>pkg(index).id),filter:{state:'all'},idempotencyKey:randomUUID()});
        return previewBulkAction(pool,scope,{selectionId:frozen.selectionId,purpose,idempotencyKey:randomUUID()});
    };
    const run=review=>executeBulkAction(pool,scope,{reviewId:review.reviewId,previewHash:review.previewHash,idempotencyKey:randomUUID()});
    const originalToken=h.provider.calls[0].url.split('/s/')[1];
    const publicService=createPublicSigningService({pool,storage:{},otpKey:Buffer.alloc(32,7)});
    await t.test('concurrent new-key retries queue one message; members block overlapping targeted and bulk requests',async()=>{
        const review=await prepare([0,1,2]);assert.equal(review.counts.messages,1);
        assert.equal(review.counts.participations,3);
        assert.ok(review.messages[0].packages.every(item=>item.recipient.participations.length===1));
        const key=randomUUID(),input={reviewId:review.reviewId,previewHash:review.previewHash,idempotencyKey:key};
        const results=await Promise.all([executeBulkAction(pool,scope,input),run(review)]);
        assert.equal(results[0].operationId,results[1].operationId);assert.equal(results.filter(r=>r.reused).length,1);
        assert.equal(results[0].counts.messages,1);assert.equal(results[0].counts.acceptedMessages,0);assert.equal(results[0].items.length,3);assert.ok(results[0].items.every(item=>item.packageName.startsWith('employee-')));
        assert.ok(results[0].items.every(item=>item.state==='queued'));
        const targeted=await actions.previewParticipantAction(pool,scope,{packageId:pkg(2).id,personId,purpose:'reminder'});
        assert.equal(targeted.reason,'MESSAGE_ALREADY_QUEUED');
        const duplicate=await prepare([0,1,2]);assert.equal(duplicate.counts.messages,0);
        assert.ok(duplicate.excluded.every(item=>item.reason==='MESSAGE_ALREADY_QUEUED'));
        await assert.rejects(executeBulkAction(pool,scope,{...input,previewHash:'f'.repeat(64)}),{errorCode:'IDEMPOTENCY_CONFLICT'});
        // DB transition fixture, not a claim of real signature acceptance.
        await pool.query("UPDATE signing_tasks SET state=CASE WHEN stage=0 THEN 'accepted' ELSE 'ready' END,version=version+1 WHERE revision_id=$1",[pkg(0).revision_id]);
        const calls=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,calls+1);
        const status=await bulkOperationStatus(pool,scope,results[0].operationId);assert.equal(status.counts.acceptedMessages,1);
        assert.equal(status.items.find(item=>item.packageId===pkg(0).id).state,'skipped_completed');
        assert.equal(status.items.filter(item=>item.state==='provider_accepted').length,2);
        const token=h.provider.calls.at(-1).url.split('/s/')[1],grant=await loadPublicGrant(pool,token);
        assert.equal(grant.allowed_task_ids.length,2);
        const view=await publicService.describe(token);assert.deepEqual(view.packages.map(p=>p.packageId).sort(),[pkg(1).id,pkg(2).id].sort());
        assert.ok(view.packages.every(p=>p.documents.length===1));
        const future=(await pool.query('SELECT id FROM signing_tasks WHERE revision_id=$1 AND stage=1',[pkg(1).revision_id])).rows[0].id;
        await pool.query("UPDATE signing_tasks SET state='ready' WHERE id=$1",[future]);
        await assert.rejects(publicService.createSession(token,{taskIds:[future],consentVersion:CONSENT_VERSION}),{errorCode:'TASK_UNAVAILABLE'});
        assert.equal((await publicService.describe(originalToken)).packages.length,18);
        const retry=await executeBulkAction(pool,scope,input);assert.equal(retry.reused,true);assert.equal(retry.operationId,results[0].operationId);
        assert.equal(retry.counts.acceptedMessages,1);await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,calls+1);
    });
    await t.test('execute excludes changed version and never adds newly eligible targets to approval',async()=>{
        const review=await prepare([3,4]);await pool.query('UPDATE signing_tasks SET version=version+2 WHERE revision_id=$1 AND state=\'ready\'',[pkg(3).revision_id]);
        const result=await run(review);assert.equal(result.items.length,1);assert.equal(result.items[0].packageId,pkg(4).id);
        assert.equal(result.exclusions.find(item=>item.packageId===pkg(3).id).reason,'ACTION_SCOPE_CHANGED');
        const count=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count+1);
        const token=h.provider.calls.at(-1).url.split('/s/')[1];assert.deepEqual((await publicService.describe(token)).packages.map(p=>p.packageId),[pkg(4).id]);
    });
    await t.test('worker shrinks contact changes including the anchor profile and retains only current packages',async()=>{
        const review=await prepare([5,6]),result=await run(review);
        const deliveryId=result.items[0].deliveryId,d=(await pool.query('SELECT * FROM signing_deliveries WHERE id=$1',[deliveryId])).rows[0];
        const changed=(await pool.query('SELECT revision_id FROM signing_delivery_profiles WHERE id=$1',[d.profile_id])).rows[0].revision_id;
        await pool.query('UPDATE signing_delivery_profiles SET version=version+1 WHERE id=$1',[d.profile_id]);
        const count=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count+1);
        const status=await bulkOperationStatus(pool,scope,result.operationId);assert.equal(status.items.filter(item=>item.state==='cancelled').length,1);
        assert.equal(status.items.find(item=>item.state==='cancelled').errorCode,'CONTACT_CHANGED');
        const token=h.provider.calls.at(-1).url.split('/s/')[1],grant=await loadPublicGrant(pool,token);assert.equal(grant.items.length,1);
        assert.notEqual(grant.items[0].revision_id,changed);
    });
    await t.test('sender permission revocation before worker dispatch cancels every item without a provider call',async()=>{
        const review=await prepare([7]),result=await run(review),count=h.provider.calls.length;
        await pool.query("UPDATE users SET role='User' WHERE userid=$1",[scope.userId]);
        try {await h.drain('dispatch_delivery');}finally{await pool.query("UPDATE users SET role='Admin' WHERE userid=$1",[scope.userId]);}
        assert.equal(h.provider.calls.length,count);const status=await bulkOperationStatus(pool,scope,result.operationId);
        assert.equal(status.items[0].state,'cancelled');assert.equal(status.items[0].errorCode,'SENDER_ACCESS_CHANGED');
    });
    await t.test('uncertain provider outcome remains visible and is never automatically retried or re-approved',async()=>{
        const review=await prepare([8]),result=await run(review),send=h.provider.send;
        h.provider.send=async message=>{h.provider.calls.push(message);throw new Error('synthetic timeout after write');};
        const count=h.provider.calls.length;try{await h.drain('dispatch_delivery');}finally{h.provider.send=send;}
        assert.equal(h.provider.calls.length,count+1);assert.equal((await bulkOperationStatus(pool,scope,result.operationId)).state,'uncertain');
        await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count+1);
        const next=await prepare([8]);assert.equal(next.counts.messages,0);assert.equal(next.excluded[0].reason,'PREVIOUS_OUTCOME_UNCERTAIN');
    });
    await t.test('completed-copy grouping grants only selected final-readable packages and cannot create a consent session',async()=>{
        // Explicit metadata state fixtures; incumbent real PDF/signature proof lives in dependent regression.
        const revisions=[pkg(9).revision_id,pkg(10).revision_id];
        await pool.query("UPDATE signing_tasks SET state='accepted',version=version+1 WHERE revision_id=ANY($1::uuid[])",[revisions]);
        await pool.query("UPDATE signing_documents SET state='final',final_artifact_id=prepared_artifact_id WHERE revision_id=ANY($1::uuid[])",[revisions]);
        await pool.query("UPDATE signing_package_revisions SET workflow_state='complete' WHERE id=ANY($1::uuid[])",[revisions]);
        const review=await prepare([9,10],'completed_copy');assert.equal(review.counts.messages,1);assert.equal(review.counts.documents,4);
        const result=await run(review),count=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count+1);
        assert.equal((await bulkOperationStatus(pool,scope,result.operationId)).counts.acceptedMessages,1);
        const token=h.provider.calls.at(-1).url.split('/s/')[1],grant=await loadPublicGrant(pool,token,{purpose:'download'});
        assert.equal(grant.items.length,4);assert.equal(new Set(grant.items.map(i=>i.revision_id)).size,2);assert.equal(grant.allowed_task_ids,null);
        await assert.rejects(publicService.createSession(token,{taskIds:[],consentVersion:CONSENT_VERSION}),{errorCode:'LINK_UNAVAILABLE'});
    });
    await t.test('different approved reviews racing for the same target cannot queue two messages',async()=>{
        const first=await prepare([12]),second=await prepare([12]),count=h.provider.calls.length;
        const results=await Promise.all([run(first),run(second)]);
        assert.equal(results.flatMap(r=>r.items).length,1);
        assert.equal(results.flatMap(r=>r.exclusions).filter(item=>item.reason==='MESSAGE_ALREADY_QUEUED').length,1);
        await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count+1);
    });
    await t.test('task version committed while bulk worker waits for package lock is rechecked',async()=>{
        const result=await run(await prepare([13])),locker=await pool.connect();let pending;
        try {
            await locker.query('BEGIN');await locker.query('SELECT id FROM signing_packages WHERE id=$1 FOR UPDATE',[pkg(13).id]);
            const count=h.provider.calls.length;pending=h.drain('dispatch_delivery');let blocked=false;
            for(let attempt=0;attempt<100;attempt++) {
                blocked=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE 'SELECT p.id FROM signing_packages p WHERE p.owner_context_id%FOR UPDATE%'")).rowCount>0;
                if(blocked)break;await new Promise(resolve=>setTimeout(resolve,20));
            }
            assert.equal(blocked,true);await locker.query('UPDATE signing_tasks SET version=version+2 WHERE revision_id=$1',[pkg(13).revision_id]);
            await locker.query('COMMIT');await pending;assert.equal(h.provider.calls.length,count);
            assert.equal((await bulkOperationStatus(pool,scope,result.operationId)).items[0].errorCode,'ACTION_SCOPE_CHANGED');
        } finally {await locker.query('ROLLBACK');locker.release();if(pending)await pending;}
    });
    await t.test('lost dispatch lease before network does not leave the operation permanently queued',async()=>{
        const result=await run(await prepare([14])),count=h.provider.calls.length;
        const [lease]=await jobs.claim(pool,{contextIds:[ctx],workerId:'bulk-crash-fixture',kinds:['dispatch_delivery'],limit:1});
        assert.equal(lease.subject_id,result.items[0].deliveryId);
        await pool.query("UPDATE signing_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[lease.id]);
        await jobs.recoverExpired(pool);await markAbandonedDispatches(pool);
        const status=await bulkOperationStatus(pool,scope,result.operationId);assert.equal(status.state,'uncertain');
        assert.equal(status.items[0].errorCode,'PROVIDER_OUTCOME_UNKNOWN');
        await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count);
    });
    await t.test('persisted delivery cannot be widened beyond the immutable reviewed group',async()=>{
        const review=await prepare([15]),result=await run(review),deliveryId=result.items[0].deliveryId;
        await assert.rejects(pool.query('UPDATE signing_delivery_items SET binding=$2 WHERE delivery_id=$1',[deliveryId,{}]),/immutable/);
        // Simulate an accidental internal pointer change. No public API accepts this data.
        await pool.query("UPDATE signing_deliveries SET target_snapshot=jsonb_set(target_snapshot,'{groupKey}',to_jsonb('unreviewed'::text)) WHERE id=$1",[deliveryId]);
        const count=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count);
        assert.equal((await bulkOperationStatus(pool,scope,result.operationId)).items[0].errorCode,'ACTION_REVIEW_REQUIRED');
    });
    await t.test('HTTP queue/status are upload-gated, private, idempotent and report queued before provider acceptance',async()=>{
        const review=await prepare([16]);process.env.SIGNING_V2_ENABLED='true';
        process.env.SIGNING_DEPLOYMENT_KEY=(await pool.query('SELECT deployment_key FROM signing_owner_contexts WHERE id=$1',[ctx])).rows[0].deployment_key;
        try {
            const app=express();app.use(express.json());app.use('/api/signing-v2',require('../routes/signingV2Routes'));
            app.use((err,req,res,next)=>res.status(err.httpStatus||500).json({errorCode:err.errorCode}));
            const token=jwt.sign({userid:scope.userId,role:'Admin'},process.env.JWT_SECRET),key=randomUUID();
            const body={reviewId:review.reviewId,previewHash:review.previewHash};
            const queued=await request(app).post('/api/signing-v2/bulk-actions').set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
            assert.equal(queued.status,202,JSON.stringify(queued.body));assert.equal(queued.body.items[0].state,'queued');
            const repeated=await request(app).post('/api/signing-v2/bulk-actions').set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
            assert.equal(repeated.status,200);assert.equal(repeated.body.operationId,queued.body.operationId);
            const recovered=await request(app).get('/api/signing-v2/bulk-actions').set('Authorization',`Bearer ${token}`);
            assert.equal(recovered.status,200);assert.ok(recovered.body.rows.some(row=>row.id===queued.body.operationId));
            assert.ok(recovered.body.rows.every(row=>Object.keys(row).sort().join(',')==='createdAt,id,purpose'));
            const picker=await request(app).get('/api/signing-v2/packages?state=all&limit=2').set('Authorization',`Bearer ${token}`);
            assert.equal(picker.status,200);assert.equal(picker.body.total,18);assert.equal(picker.body.rows.length,2);
            const path=`/api/signing-v2/bulk-actions/${queued.body.operationId}`;
            const pending=await request(app).get(path).set('Authorization',`Bearer ${token}`);assert.equal(pending.status,200);assert.equal(pending.body.counts.acceptedMessages,0);
            assert.equal((await request(app).get(path)).status,401);
            const user=(await pool.query("INSERT INTO users(name,email,role,passwordhash) VALUES('QA unrelated office admin',$1,'Admin','synthetic') RETURNING userid",[`${randomUUID()}@example.invalid`])).rows[0].userid;
            const other=jwt.sign({userid:user,role:'Admin'},process.env.JWT_SECRET);
            assert.deepEqual((await request(app).get('/api/signing-v2/bulk-actions').set('Authorization',`Bearer ${other}`)).body.rows,[]);
            await assert.rejects(listBulkOperations(pool,{...scope,send:false}),{errorCode:'FORBIDDEN'});
            assert.deepEqual((await listBulkOperations(pool,{...scope,contextId:randomUUID()})).rows,[]);
            assert.equal((await request(app).get(path).set('Authorization',`Bearer ${other}`)).status,404);
            const denied=await request(app).post('/api/signing-v2/bulk-actions').set('Authorization',`Bearer ${other}`).set('Idempotency-Key',randomUUID()).send(body);assert.equal(denied.status,404);
            await h.drain('dispatch_delivery');
            const done=await request(app).get(path).set('Authorization',`Bearer ${token}`);assert.equal(done.body.counts.acceptedMessages,1);
        } finally {delete process.env.SIGNING_V2_ENABLED;delete process.env.SIGNING_DEPLOYMENT_KEY;}
    });
    await t.test('operation readback masks revoked package details and worker respects current assignment',async()=>{
        const permissions={version:2,areas:{signing:{visible:true,actions:['view','upload'],dataScope:'assigned_only'}}};
        const role=(await pool.query('INSERT INTO firm_staff_roles(name,permissions) VALUES($1,$2) RETURNING id',[`QA bulk assignee ${randomUUID()}`,permissions])).rows[0].id;
        const user=(await pool.query("INSERT INTO users(name,email,role,passwordhash,firm_staff_role_id) VALUES('QA bulk assignee',$1,'Staff','synthetic',$2) RETURNING userid",[`${randomUUID()}@example.invalid`,role])).rows[0].userid;
        const limited={...scope,userId:user,all:false,caseView:false,caseAll:false};
        await pool.query('INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id) VALUES($1,$2,$3)',[ctx,pkg(17).id,user]);
        const frozen=await freezeSelection(pool,limited,{mode:'explicit',packageIds:[pkg(17).id],idempotencyKey:randomUUID()});
        const review=await previewBulkAction(pool,limited,{selectionId:frozen.selectionId,purpose:'reminder',idempotencyKey:randomUUID()});
        const result=await executeBulkAction(pool,limited,{reviewId:review.reviewId,previewHash:review.previewHash,idempotencyKey:randomUUID()});
        assert.equal(result.items.length,1);
        await pool.query('DELETE FROM signing_package_assignments WHERE owner_context_id=$1 AND user_id=$2',[ctx,user]);
        const hidden=await bulkOperationStatus(pool,limited,result.operationId);assert.deepEqual(hidden.items,[]);assert.equal(hidden.state,'partial');
        assert.deepEqual(hidden.exclusions,[{packageId:pkg(17).id,reason:'ACCESS_CHANGED'}]);assert.equal(hidden.counts.messages,0);
        await assert.rejects(bulkOperationStatus(pool,{...limited,send:false},result.operationId),{errorCode:'FORBIDDEN'});
        const count=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count);
        const row=(await pool.query('SELECT state,error_code FROM signing_deliveries WHERE id=$1',[result.items[0].deliveryId])).rows[0];
        assert.equal(row.state,'cancelled');assert.equal(row.error_code,'SENDER_ACCESS_CHANGED');
    });
    await t.test('original link revocation while queued cancels without creating a broader replacement',async()=>{
        const review=await prepare([11]),result=await run(review);
        const original=await loadPublicGrant(pool,originalToken);await pool.query('UPDATE signing_public_grants SET revoked_at=clock_timestamp() WHERE id=$1',[original.id]);
        const count=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count);
        assert.equal((await bulkOperationStatus(pool,scope,result.operationId)).items[0].errorCode,'LINK_UNAVAILABLE');
    });
});
