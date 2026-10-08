const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {deliveryHarness}=require('./helpers/signingV2Delivery');
const {databaseFixture}=require('./helpers/signingV2Fixture');
const {createSubmission}=require('../services/signingV2/submissions');
const {freezeSelection}=require('../services/signingV2/selections');
const {previewBulkAction,loadTargets,buildPlan}=require('../services/signingV2/bulkReview');
const actions=require('../services/signingV2/actions');
const express=require('express');
const request=require('supertest');
const jwt=require('jsonwebtoken');

test('bulk reviews bind exact authorized selection and compatible destinations without sending',
 {skip:process.env.LEGAL_DB_QA!=='true',timeout:120000},async t=>{
    const pool=require('../config/db');t.after(()=>pool.end());
    const h=await deliveryHarness(pool,{endpoints:Array(6).fill('shared@example.invalid'),configure:({definition,packages})=>{
        const first=packages[0].roles.employee,personId=first[0].personId;
        packages.slice(0,4).forEach((item,index)=>{
            item.roles={employee:first};item.delivery={[personId]:{locale:index===3?'ar':'en',channels:['email'],email:'shared@example.invalid'}};
        });
        packages[4].delivery[packages[4].roles.employee[0].personId].locale='en';
        packages[5].delivery[packages[5].roles.employee[0].personId].locale='en';
        packages[5].deadline=new Date(Date.now()+86400000).toISOString();
        return definition;
    }});t.after(h.close);
    const receipt=await h.submit();await h.activate();await h.drain('dispatch_delivery');
    const scope={...h.f.scope,send:true},ctx=h.f.contextId;
    const pkgs=(await pool.query('SELECT * FROM signing_packages WHERE submission_id=$1 ORDER BY external_key',[receipt.submissionId])).rows;
    const selection=await freezeSelection(pool,scope,{mode:'explicit',packageIds:pkgs.slice(0,5).map(p=>p.id),filter:{state:'all'},idempotencyKey:randomUUID()});
    const input={selectionId:selection.selectionId,purpose:'reminder',idempotencyKey:randomUUID()};
    const original=(await pool.query(`SELECT (SELECT count(*) FROM signing_deliveries WHERE owner_context_id=$1) AS deliveries,
        (SELECT count(*) FROM signing_jobs WHERE owner_context_id=$1) AS jobs`,[ctx])).rows[0];
    const callCount=h.provider.calls.length;
    let review;
    await t.test('same person/policy combines packages; shared endpoint and different policy do not combine identities',async()=>{
        review=await previewBulkAction(pool,scope,input);
        assert.equal(review.counts.selectedPackages,5);assert.equal(review.counts.packages,5);assert.equal(review.counts.people,2);
        assert.equal(review.counts.messages,3);assert.equal(review.counts.participations,5);assert.equal(review.counts.documents,10);
        assert.deepEqual(review.messages.map(m=>m.packages.length).sort(),[1,1,3]);
        assert.deepEqual(review.messages.flatMap(m=>m.packages.map(p=>p.packageId)).sort(),pkgs.slice(0,5).map(p=>p.id).sort());
        assert.ok(!JSON.stringify(review).includes('shared@example.invalid'));
        assert.ok(!JSON.stringify(review).includes('encrypted_token'));assert.ok(!JSON.stringify(review).includes('grantId'));
        assert.equal(review.excluded.length,0);assert.equal(new Date(review.expiresAt).toISOString(),new Date(selection.expiresAt).toISOString());
        for(const group of review.messages)for(const item of group.packages) {
            const targeted=await actions.previewParticipantAction(pool,scope,{packageId:item.packageId,personId:group.personId,purpose:'reminder'});
            assert.deepEqual(item.tasks,targeted.tasks.sort((a,b)=>a.taskId.localeCompare(b.taskId)));
            assert.deepEqual(item.destination,targeted.destination);assert.equal(targeted.eligible,true);
        }
    });
    await t.test('concurrent retry reuses immutable reviewed plan; purpose/channel cannot change under the key',async()=>{
        const fresh={...input,idempotencyKey:randomUUID()};const results=await Promise.all([previewBulkAction(pool,scope,fresh),previewBulkAction(pool,scope,fresh)]);
        assert.equal(results[0].reviewId,results[1].reviewId);assert.equal(results.filter(r=>r.reused).length,1);
        assert.equal(results[0].previewHash,review.previewHash);
        await assert.rejects(previewBulkAction(pool,scope,{...fresh,purpose:'resend'}),{errorCode:'IDEMPOTENCY_CONFLICT'});
        await assert.rejects(pool.query('UPDATE signing_bulk_reviews SET plan=$2 WHERE id=$1',[review.reviewId,{}]),/immutable/);
        await assert.rejects(previewBulkAction(pool,{...scope,send:false},input),{errorCode:'FORBIDDEN'});
        await assert.rejects(previewBulkAction(pool,{...scope,userId:scope.userId+999999},input),{errorCode:'NOT_FOUND'});
        await assert.rejects(previewBulkAction(pool,{...scope,contextId:randomUUID()},input),{errorCode:'NOT_FOUND'});
    });
    await t.test('completed/contact-changed/paused targets are visibly excluded and stored private plan is not returned on drift',async()=>{
        await pool.query("UPDATE signing_tasks SET state='accepted',version=version+1 WHERE revision_id=$1",[pkgs[0].active_revision_id]);
        await pool.query('UPDATE signing_delivery_profiles SET version=version+1 WHERE revision_id=$1',[pkgs[1].active_revision_id]);
        await pool.query('UPDATE signing_tasks SET version=version+2 WHERE revision_id=$1',[pkgs[2].active_revision_id]);
        const changed=await previewBulkAction(pool,scope,{...input,idempotencyKey:randomUUID()});
        assert.equal(changed.counts.packages,2);assert.equal(changed.counts.messages,2);
        assert.equal(changed.excluded.find(x=>x.packageId===pkgs[0].id).reason,'ALREADY_COMPLETED');
        assert.equal(changed.excluded.find(x=>x.packageId===pkgs[1].id).reason,'CONTACT_CHANGED');
        assert.equal(changed.excluded.find(x=>x.packageId===pkgs[2].id).reason,'ACTION_SCOPE_CHANGED');
        await assert.rejects(previewBulkAction(pool,scope,input),{errorCode:'PREVIEW_CHANGED'});
    });
    await t.test('current contact history prevents queued, cooldown and uncertain duplicates with no automatic fallback',async()=>{
        const one=pkgs[4];const profile=(await pool.query('SELECT * FROM signing_delivery_profiles WHERE revision_id=$1',[one.active_revision_id])).rows[0];
        const selected=await freezeSelection(pool,scope,{mode:'explicit',packageIds:[one.id],idempotencyKey:randomUUID()});
        const preview=async(channel)=>previewBulkAction(pool,scope,{selectionId:selected.selectionId,purpose:'reminder',channel,idempotencyKey:randomUUID()});
        assert.equal((await preview('sms')).excluded[0].reason,'CHANNEL_UNAVAILABLE');
        const originalDelivery=(await pool.query('SELECT * FROM signing_deliveries WHERE profile_id=$1 LIMIT 1',[profile.id])).rows[0];
        const id=randomUUID();await pool.query(`INSERT INTO signing_deliveries(id,owner_context_id,profile_id,profile_version,grant_id,event_key,purpose,channel,state,target_snapshot)
            VALUES($1,$2,$3,$4,$5,$6,'reminder','email','pending',$7)`,[id,ctx,profile.id,profile.version,originalDelivery.grant_id,`qa-bulk-${id}`,originalDelivery.target_snapshot]);
        assert.equal((await preview()).excluded[0].reason,'MESSAGE_ALREADY_QUEUED');
        await pool.query("UPDATE signing_deliveries SET state='provider_accepted' WHERE id=$1",[id]);
        assert.equal((await preview()).excluded[0].reason,'COOLDOWN_ACTIVE');
        await pool.query("UPDATE signing_deliveries SET state='uncertain' WHERE id=$1",[id]);
        assert.equal((await preview()).excluded[0].reason,'PREVIOUS_OUTCOME_UNCERTAIN');
        await pool.query('DELETE FROM signing_deliveries WHERE id=$1',[id]);
    });
    await t.test('revoked assignment hides names/contact/history and expired selection cannot preview',async()=>{
        const user=(await pool.query("INSERT INTO users(name,email,role,passwordhash) VALUES('QA bulk staff',$1,'Staff','synthetic') RETURNING userid",[`${randomUUID()}@example.invalid`])).rows[0].userid;
        const restricted={...scope,userId:user,all:false,caseView:false,caseAll:false};
        await pool.query('INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id) VALUES($1,$2,$3)',[ctx,pkgs[3].id,user]);
        const frozen=await freezeSelection(pool,restricted,{mode:'all_matching',filter:{state:'all'},idempotencyKey:randomUUID()});
        const request={selectionId:frozen.selectionId,purpose:'reminder',idempotencyKey:randomUUID()};
        assert.equal((await previewBulkAction(pool,restricted,request)).counts.messages,1);
        await pool.query('DELETE FROM signing_package_assignments WHERE owner_context_id=$1 AND user_id=$2',[ctx,user]);
        await assert.rejects(previewBulkAction(pool,restricted,request),{errorCode:'PREVIEW_CHANGED'});
        const denied=await previewBulkAction(pool,restricted,{...request,idempotencyKey:randomUUID()});
        assert.deepEqual(denied.excluded,[{packageId:pkgs[3].id,reason:'ACCESS_CHANGED'}]);assert.equal(denied.counts.selectedPeople,0);assert.equal(denied.counts.visiblePackages,0);
        const id=randomUUID();await pool.query(`INSERT INTO signing_selection_snapshots(id,owner_context_id,created_by,idempotency_key,request_hash,scope_hash,selection_hash,source_filter,items,created_at,expires_at)
            SELECT $2,owner_context_id,created_by,$3,request_hash,scope_hash,selection_hash,source_filter,items,clock_timestamp()-interval '11 minutes',clock_timestamp()-interval '1 minute'
            FROM signing_selection_snapshots WHERE id=$1`,[selection.selectionId,id,randomUUID()]);
        await assert.rejects(previewBulkAction(pool,scope,{...input,selectionId:id,idempotencyKey:randomUUID()}),{errorCode:'SELECTION_EXPIRED'});
    });
    await t.test('review alone creates no jobs/deliveries or provider calls and audit contains only counts/IDs',async()=>{
        const after=(await pool.query(`SELECT (SELECT count(*) FROM signing_deliveries WHERE owner_context_id=$1) AS deliveries,
            (SELECT count(*) FROM signing_jobs WHERE owner_context_id=$1) AS jobs`,[ctx])).rows[0];assert.deepEqual(after,original);assert.equal(h.provider.calls.length,callCount);
        const events=(await pool.query("SELECT details FROM signing_events_v2 WHERE owner_context_id=$1 AND kind='action_previewed'",[ctx])).rows;
        assert.ok(events.length>0);assert.ok(!JSON.stringify(events).includes('shared@example.invalid'));assert.ok(!JSON.stringify(events).includes('Synthetic employee'));
    });
    await t.test('200-package600-task preview has constant SQL calls; metadata only, no render performance claim',async()=>{
        const f=await databaseFixture(pool,{packageCount:200,documentCount:3});const bigScope={...f.scope,send:true};
        await createSubmission(pool,bigScope,f.input,{reserveCapacity:async()=>{}});
        const big=await freezeSelection(pool,bigScope,{mode:'all_matching',filter:{state:'all'},idempotencyKey:randomUUID()});
        const capture=async(scope,id)=>{
            let queries=0;const tracked={connect:async()=>{const db=await pool.connect();return {query:(...args)=>{queries++;return db.query(...args);},release:()=>db.release()};}};
            const result=await previewBulkAction(tracked,scope,{selectionId:id,purpose:'reminder',idempotencyKey:randomUUID()});return {queries,result};
        };
        const small=await capture(scope,selection.selectionId),large=await capture(bigScope,big.selectionId);
        assert.equal(large.queries,small.queries);assert.ok(large.queries<=9);
        assert.equal(large.result.counts.selectedPackages,200);assert.equal(large.result.counts.selectedPeople,200);assert.equal(large.result.counts.messages,0);
        assert.equal(large.result.excluded.length,200);assert.ok(large.result.excluded.every(item=>item.reason==='REVISION_INACTIVE'));
        t.diagnostic(`metadata-only200packages/600tasks preview uses${large.queries}SQL; no rendering/provider/capacity approval`);
    });
    await t.test('deadline is bound as JSON and expired links/unfinished copies are excluded',async()=>{
        const pkg=pkgs[5];
        const frozen=await freezeSelection(pool,scope,{mode:'explicit',packageIds:[pkg.id],filter:{state:'all'},idempotencyKey:randomUUID()});
        const input={selectionId:frozen.selectionId,purpose:'reminder',idempotencyKey:randomUUID()};
        const ready=await previewBulkAction(pool,scope,input);assert.equal(ready.counts.messages,1);
        assert.equal((await previewBulkAction(pool,scope,{...input,purpose:'completed_copy',idempotencyKey:randomUUID()})).excluded[0].reason,'COMPLETED_COPY_NOT_READY');
        const saved=(await pool.query('SELECT * FROM signing_selection_snapshots WHERE id=$1',[frozen.selectionId])).rows[0];
        const targets=await loadTargets(pool,scope,saved);
        assert.equal(buildPlan(saved,targets.map(target=>({...target,before_deadline:false})),input).excluded[0].reason,'DEADLINE_EXPIRED','unit branch over DB target; immutable deadline is never edited');
        await pool.query(`UPDATE signing_public_grants SET revoked_at=clock_timestamp() WHERE id IN
            (SELECT grant_id FROM signing_grant_items WHERE revision_id=$1)`,[pkg.active_revision_id]);
        assert.equal((await previewBulkAction(pool,scope,{...input,idempotencyKey:randomUUID()})).excluded[0].reason,'LINK_UNAVAILABLE');
    });
    await t.test('completed-copy review lists only immutable readable PDFs and binds each artifact hash',async()=>{
        // State fixtures exercise review filtering only, not real signature/finalization proof.
        const pkg=pkgs[5];await pool.query("UPDATE signing_tasks SET state='accepted',version=version+1 WHERE revision_id=$1",[pkg.active_revision_id]);
        await pool.query("UPDATE signing_documents SET state='final',final_artifact_id=prepared_artifact_id WHERE revision_id=$1",[pkg.active_revision_id]);
        await pool.query("UPDATE signing_package_revisions SET workflow_state='complete' WHERE id=$1",[pkg.active_revision_id]);
        const frozen=await freezeSelection(pool,scope,{mode:'explicit',packageIds:[pkg.id],filter:{state:'all'},idempotencyKey:randomUUID()});
        const input={selectionId:frozen.selectionId,purpose:'completed_copy',idempotencyKey:randomUUID()};
        const copy=await previewBulkAction(pool,scope,input);assert.equal(copy.counts.messages,1);assert.equal(copy.counts.documents,2);
        const personId=copy.messages[0].personId,target=await actions.previewParticipantAction(pool,scope,{packageId:pkg.id,personId,purpose:'completed_copy'});
        assert.deepEqual(copy.messages[0].packages[0].documents,target.documents);assert.equal(target.eligible,true);
        const saved=(await pool.query('SELECT plan FROM signing_bulk_reviews WHERE id=$1',[copy.reviewId])).rows[0].plan;
        assert.equal(saved.messages[0].items[0].binding.documents.length,2);
        assert.ok(saved.messages[0].items[0].binding.documents.every(d=>/^[a-f0-9]{64}$/.test(d.contentHash)));
        await pool.query("UPDATE signing_documents SET state='preparing' WHERE id=$1",[target.documents[0].documentId]);
        assert.equal((await previewBulkAction(pool,scope,{...input,idempotencyKey:randomUUID()})).excluded[0].reason,'COMPLETED_COPY_NOT_READY');
        await assert.rejects(previewBulkAction(pool,scope,input),{errorCode:'PREVIEW_CHANGED'});
    });
    await t.test('HTTP review uses existing permission/context middleware and never takes owner IDs from the body',async()=>{
        process.env.SIGNING_V2_ENABLED='true';process.env.SIGNING_DEPLOYMENT_KEY=(await pool.query('SELECT deployment_key FROM signing_owner_contexts WHERE id=$1',[ctx])).rows[0].deployment_key;
        try {
            const app=express();app.use(express.json());app.use('/api/signing-v2',require('../routes/signingV2Routes'));
            app.use((err,req,res,next)=>res.status(err.httpStatus||500).json({errorCode:err.errorCode}));
            const path=`/api/signing-v2/selections/${selection.selectionId}/preview`;
            const token=jwt.sign({userid:scope.userId,role:'Admin'},process.env.JWT_SECRET);
            const response=await request(app).post(path).set('Authorization',`Bearer ${token}`).set('Idempotency-Key',randomUUID()).send({purpose:'reminder',ownerContextId:randomUUID(),userId:999999});
            assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.selectionId,selection.selectionId);
            assert.equal((await request(app).post(path).send({purpose:'reminder'})).status,401);
            const role=(await pool.query('INSERT INTO firm_staff_roles(name,permissions) VALUES($1,$2) RETURNING id',[`QA bulk viewer ${randomUUID()}`,{version:2,areas:{signing:{visible:true,actions:['view'],dataScope:'all_firm'}}}])).rows[0].id;
            const user=(await pool.query("INSERT INTO users(name,email,role,passwordhash,firm_staff_role_id) VALUES('QA bulk viewer',$1,'Staff','synthetic',$2) RETURNING userid",[`${randomUUID()}@example.invalid`,role])).rows[0].userid;
            const denied=await request(app).post(path).set('Authorization',`Bearer ${jwt.sign({userid:user,role:'Staff'},process.env.JWT_SECRET)}`).set('Idempotency-Key',randomUUID()).send({purpose:'reminder'});
            assert.equal(denied.status,403,JSON.stringify(denied.body));
        } finally {delete process.env.SIGNING_V2_ENABLED;delete process.env.SIGNING_DEPLOYMENT_KEY;}
    });
});
