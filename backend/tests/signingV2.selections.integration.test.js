const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const request=require('supertest');
const express=require('express');
const jwt=require('jsonwebtoken');
const {databaseFixture}=require('./helpers/signingV2Fixture');
const {createSubmission}=require('../services/signingV2/submissions');
const {freezeSelection,getSelection}=require('../services/signingV2/selections');

test('frozen office selections are scoped, immutable, bounded and never grow or send messages',
 {skip:process.env.LEGAL_DB_QA!=='true',timeout:120000},async t=>{
    const pool=require('../config/db');t.after(()=>pool.end());
    const f=await databaseFixture(pool,{packageCount:3,documentCount:3});
    const scope={...f.scope,send:true};
    const receipt=await createSubmission(pool,scope,f.input,{reserveCapacity:async()=>{}});
    const packages=(await pool.query('SELECT * FROM signing_packages WHERE submission_id=$1 ORDER BY external_key',[receipt.submissionId])).rows;
    const before=(await pool.query(`SELECT (SELECT count(*) FROM signing_jobs WHERE owner_context_id=$1) AS jobs,
        (SELECT count(*) FROM signing_deliveries WHERE owner_context_id=$1) AS deliveries`,[f.contextId])).rows[0];
    const input={mode:'all_matching',filter:{state:'all'},idempotencyKey:randomUUID()};
    let selection;
    await t.test('all matching is explicit and two concurrent retries preserve one exact snapshot',async()=>{
        const results=await Promise.all([freezeSelection(pool,scope,input),freezeSelection(pool,scope,input)]);
        assert.equal(results[0].selectionId,results[1].selectionId);assert.equal(results.filter(x=>x.reused).length,1);
        selection=results[0];assert.equal(selection.counts.packages,3);assert.equal(selection.counts.tasks,9);
        assert.equal(selection.counts.people,3);assert.equal(selection.counts.participations,3);assert.equal(selection.requiresReview,false);
        assert.ok(Date.parse(selection.expiresAt)-Date.parse(selection.createdAt)<=600001);
        assert.equal((await pool.query('SELECT count(*) FROM signing_selection_snapshots WHERE owner_context_id=$1',[f.contextId])).rows[0].count,'1');
        await assert.rejects(freezeSelection(pool,scope,{...input,filter:{query:'different'}}),{errorCode:'IDEMPOTENCY_CONFLICT'});
        await assert.rejects(freezeSelection(pool,scope,{idempotencyKey:randomUUID()}),{errorCode:'INVALID_SELECTION'});
        await assert.rejects(freezeSelection(pool,scope,{...input,idempotencyKey:randomUUID(),filter:{cursor:'page-2'}}),{errorCode:'INVALID_FILTER'});
    });
    await t.test('page selection and all-filter selection differ; no new matching package is appended',async()=>{
        const page=await freezeSelection(pool,scope,{mode:'explicit',filter:{state:'all'},packageIds:[packages[0].id],idempotencyKey:randomUUID()});
        assert.equal(page.counts.packages,1);
        const later=await createSubmission(pool,scope,{...f.input,idempotencyKey:randomUUID()},{reserveCapacity:async()=>{}});assert.notEqual(later.submissionId,receipt.submissionId);
        const frozen=await getSelection(pool,scope,selection.selectionId);assert.equal(frozen.counts.packages,3);assert.equal(frozen.selectionHash,selection.selectionHash);
        const current=await freezeSelection(pool,scope,{...input,idempotencyKey:randomUUID()});assert.equal(current.counts.packages,6);
        const filtered=await freezeSelection(pool,scope,{...input,idempotencyKey:randomUUID(),filter:{submissionId:receipt.submissionId,state:'all',query:'Synthetic employee 1'}});
        assert.equal(filtered.counts.packages,1);assert.equal(filtered.packages[0].packageId,packages[1].id);
    });
    await t.test('task/contact changes require another review and never rewrite the frozen hash',async()=>{
        await pool.query('UPDATE signing_tasks SET version=version+1 WHERE revision_id=$1',[packages[0].active_revision_id]);
        await pool.query('UPDATE signing_delivery_profiles SET version=version+1 WHERE revision_id=$1',[packages[1].active_revision_id]);
        const result=await getSelection(pool,scope,selection.selectionId);
        assert.equal(result.requiresReview,true);assert.equal(result.counts.changedPackages,2);assert.equal(result.selectionHash,selection.selectionHash);
        assert.equal(result.packages.find(p=>p.packageId===packages[0].id).reason,'TASKS_CHANGED');
        assert.equal(result.packages.find(p=>p.packageId===packages[1].id).reason,'CONTACT_CHANGED');
        await assert.rejects(pool.query('UPDATE signing_selection_snapshots SET items=$2 WHERE id=$1',[selection.selectionId,JSON.stringify([])]),/immutable/);
    });
    await t.test('current scope is applied before selection, and removed assignments expose no stored names or counts',async()=>{
        const user=(await pool.query("INSERT INTO users(name,email,role,passwordhash) VALUES('Selection staff',$1,'Staff','synthetic') RETURNING userid",[`${randomUUID()}@example.invalid`])).rows[0].userid;
        const restricted={...scope,userId:user,all:false,caseView:false,caseAll:false};
        await assert.rejects(freezeSelection(pool,restricted,{...input,idempotencyKey:randomUUID()}),{errorCode:'EMPTY_SELECTION'});
        await assert.rejects(freezeSelection(pool,restricted,{mode:'explicit',packageIds:[packages[0].id],idempotencyKey:randomUUID()}),{errorCode:'NOT_FOUND'});
        await pool.query('INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id) VALUES($1,$2,$3)',[f.contextId,packages[0].id,user]);
        const one=await freezeSelection(pool,restricted,{...input,idempotencyKey:randomUUID()});assert.equal(one.counts.packages,1);
        await pool.query('DELETE FROM signing_package_assignments WHERE owner_context_id=$1 AND user_id=$2',[f.contextId,user]);
        const hidden=await getSelection(pool,restricted,one.selectionId);assert.equal(hidden.counts.packages,0);assert.equal(hidden.counts.tasks,0);
        assert.deepEqual(hidden.packages,[{packageId:packages[0].id,reason:'ACCESS_CHANGED'}]);
        assert.ok(!JSON.stringify(hidden).includes(packages[0].external_key));
        await assert.rejects(getSelection(pool,{...restricted,all:true},one.selectionId),{errorCode:'SELECTION_ACCESS_CHANGED'});
        await assert.rejects(getSelection(pool,{...scope,userId:user},selection.selectionId),{errorCode:'NOT_FOUND'});
        await assert.rejects(getSelection(pool,{...scope,contextId:randomUUID()},selection.selectionId),{errorCode:'NOT_FOUND'});
        await assert.rejects(getSelection(pool,{...scope,send:false},selection.selectionId),{errorCode:'FORBIDDEN'});
    });
    await t.test('expired snapshots cannot be refreshed through retry and do not return stored details',async()=>{
        const id=randomUUID(),key=randomUUID();
        await pool.query(`INSERT INTO signing_selection_snapshots(id,owner_context_id,created_by,idempotency_key,request_hash,scope_hash,selection_hash,source_filter,items,created_at,expires_at)
            SELECT $2,owner_context_id,created_by,$3,request_hash,scope_hash,selection_hash,source_filter,items,clock_timestamp()-interval '11 minutes',clock_timestamp()-interval '1 minute'
            FROM signing_selection_snapshots WHERE id=$1`,[selection.selectionId,id,key]);
        await assert.rejects(getSelection(pool,scope,id),{errorCode:'SELECTION_EXPIRED'});
        await assert.rejects(freezeSelection(pool,scope,{...input,idempotencyKey:key}),{errorCode:'SELECTION_EXPIRED'});
    });
    await t.test('HTTP routes preserve authenticated creator isolation and explicit upload permission',async()=>{
        process.env.SIGNING_V2_ENABLED='true';process.env.SIGNING_DEPLOYMENT_KEY=(await pool.query('SELECT deployment_key FROM signing_owner_contexts WHERE id=$1',[f.contextId])).rows[0].deployment_key;
        const app=express();app.use(express.json());app.use('/api/signing-v2',require('../routes/signingV2Routes'));
        app.use((err,req,res,next)=>res.status(err.httpStatus||500).json({errorCode:err.errorCode}));
        const token=jwt.sign({userid:scope.userId,role:'Admin'},process.env.JWT_SECRET);
        const key=randomUUID(),body={mode:'explicit',filter:{state:'all'},packageIds:[packages[2].id]};
        const response=await request(app).post('/api/signing-v2/selections').set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
        assert.equal(response.status,201,JSON.stringify(response.body));
        const repeated=await request(app).post('/api/signing-v2/selections').set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
        assert.equal(repeated.status,200);assert.equal(repeated.body.selectionId,response.body.selectionId);
        const read=await request(app).get(`/api/signing-v2/selections/${response.body.selectionId}`).set('Authorization',`Bearer ${token}`);assert.equal(read.status,200);assert.equal(read.body.counts.packages,1);
        assert.equal((await request(app).post('/api/signing-v2/selections').send(body)).status,401);
        const role=(await pool.query('INSERT INTO firm_staff_roles(name,permissions) VALUES($1,$2) RETURNING id',[`QA selection role ${randomUUID()}`,{version:2,areas:{signing:{visible:true,actions:['view'],dataScope:'all_firm'}}}])).rows[0].id;
        const user=(await pool.query("INSERT INTO users(name,email,role,passwordhash,firm_staff_role_id) VALUES('QA selection viewer',$1,'Staff','synthetic',$2) RETURNING userid",[`${randomUUID()}@example.invalid`,role])).rows[0].userid;
        const viewToken=jwt.sign({userid:user,role:'Staff'},process.env.JWT_SECRET);
        const denied=await request(app).post('/api/signing-v2/selections').set('Authorization',`Bearer ${viewToken}`).set('Idempotency-Key',randomUUID()).send(body);assert.equal(denied.status,403,JSON.stringify(denied.body));
        const hidden=await request(app).get(`/api/signing-v2/selections/${response.body.selectionId}`).set('Authorization',`Bearer ${viewToken}`);assert.equal(hidden.status,403);
        delete process.env.SIGNING_V2_ENABLED;delete process.env.SIGNING_DEPLOYMENT_KEY;
    });
    await t.test('freezing and reading do not create deliveries, jobs or send operations',async()=>{
        const after=(await pool.query(`SELECT (SELECT count(*) FROM signing_jobs WHERE owner_context_id=$1) AS jobs,
            (SELECT count(*) FROM signing_deliveries WHERE owner_context_id=$1) AS deliveries`,[f.contextId])).rows[0];
        assert.equal(Number(after.jobs),Number(before.jobs)*2);assert.equal(Number(after.deliveries),Number(before.deliveries)*2,'only the deliberately added second submission changes these counts');
        assert.equal((await pool.query("SELECT count(*) FROM signing_operations WHERE owner_context_id=$1 AND kind LIKE 'participant_%'",[f.contextId])).rows[0].count,'0');
    });
    await t.test('200 packages and600 document tasks freeze in a bounded number of SQL calls without rendering or sending',async()=>{
        const big=await databaseFixture(pool,{packageCount:200,documentCount:3});
        const bigScope={...big.scope,send:true};
        const created=await createSubmission(pool,bigScope,big.input,{reserveCapacity:async()=>{}});
        const capture=async(currentScope,submissionId)=>{
            let queries=0;
            const tracked={connect:async()=>{const client=await pool.connect();return {query:(...args)=>{queries++;return client.query(...args);},release:()=>client.release()};}};
            const frozen=await freezeSelection(tracked,currentScope,{mode:'all_matching',filter:{submissionId,state:'all'},idempotencyKey:randomUUID()});
            return {frozen,queries};
        };
        const small=await capture(scope,receipt.submissionId),large=await capture(bigScope,created.submissionId);
        assert.equal(large.queries,small.queries);assert.ok(large.queries<=8,`${large.queries} SQL calls`);
        assert.equal(large.frozen.counts.packages,200);assert.equal(large.frozen.counts.tasks,600);assert.equal(large.frozen.counts.people,200);
        assert.equal(large.frozen.counts.changedPackages,0);assert.equal(large.frozen.requiresReview,false);
        assert.equal((await pool.query("SELECT count(*) FROM signing_deliveries WHERE owner_context_id=$1 AND state<>'pending'",[big.contextId])).rows[0].count,'0');
        await assert.rejects(freezeSelection(pool,bigScope,{mode:'explicit',packageIds:Array.from({length:1001},()=>randomUUID()),idempotencyKey:randomUUID()}),{errorCode:'INVALID_SELECTION'});
        await assert.rejects(freezeSelection(pool,bigScope,{mode:'all_matching',filter:{query:"%_';DROP TABLE users;--"},idempotencyKey:randomUUID()}),{errorCode:'EMPTY_SELECTION'});
        t.diagnostic(`metadata-only selection:200 packages/600 tasks,${large.queries} SQL calls; no renderer/performance approval`);
    });

});
