const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');

test('recipient issues pause only owned current tasks, preserve accepted work and require fresh consent on resume',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 240000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    t.after(() => f.pool.end());
    const { createRuntime, objectStorage } = require('../services/signingV2/runtime');
    const { createPublicSigningService, CONSENT_VERSION } = require('../services/signingV2/publicSigning');
    const { reportTaskIssue, resolveTaskIssue } = require('../services/signingV2/taskIssues');
    const { packageDetails } = require('../services/signingV2/management');
    const { createPerson } = require('../services/signingV2/people');
    const { fakeProvider } = require('./helpers/signingV2Delivery');
    const { r2 } = require('../utils/r2');
    const publicRoutes = require('../routes/signingV2PublicRoutes');
    const grantKey = Buffer.alloc(32, 4), codes = [];
    Object.assign(process.env, { SIGNING_V2_ENABLED: 'true', SIGNING_DEPLOYMENT_KEY: `qa-issues-${randomUUID()}.invalid` });
    t.after(() => { delete process.env.SIGNING_V2_ENABLED; delete process.env.SIGNING_DEPLOYMENT_KEY; publicRoutes.useService(null); });
    const storage = objectStorage({ client: r2, bucket: 'qa' });
    const signingService = createPublicSigningService({ pool: f.pool, storage, otpKey: grantKey,
        otpTransport: { send: async item => codes.push(item.code) } });
    publicRoutes.useService(signingService);
    const as = call => call.set('Authorization', `Bearer ${f.token}`);
    const ok = (res, status = 200) => { assert.equal(res.status, status, JSON.stringify(res.body)); return res.body; };
    const field = (roleId, y) => ({ pageNum: 1, x: 50, y, width: 160, height: 40, roleId, fieldType: 'text', fieldLabel: 'Approval', isRequired: true });
    const definition = { ...f.definition, signingOrder: 'sequential', roles: [
        { id: 'opening', name: 'Opening signer', kind: 'shared' },
        { id: 'client', name: 'Peer signer', kind: 'first' },
        { id: 'closing', name: 'Returning signer', kind: 'shared' },
    ], documents: [
        { id: randomUUID(), name: 'First PDF', fileKey: f.key, fields: [field('opening',100),field('client',200)] },
        { id: randomUUID(), name: 'Later PDF', fileKey: f.key, fields: [field('closing',100)] },
    ] };
    const legacy = ok(await as(request(f.app).post('/api/signing-templates')).send(definition),201).template;
    const versionId = ok(await as(request(f.app).post(`/api/signing-v2/templates/legacy/${legacy.id}/import`)).send({ locale: 'he' }),201).versionId;
    const contextId = (await f.pool.query('SELECT id FROM signing_owner_contexts WHERE deployment_key=$1',[process.env.SIGNING_DEPLOYMENT_KEY])).rows[0].id;
    const scope = { contextId, userId:f.users[0].userid, tenantId:null, all:true, manage:true, send:true };
    const { person } = await createPerson(f.pool,scope,{name:'Returning issue signer',endpoints:{email:'issue@example.invalid'}});
    const shared = { personId:person.id,name:person.name,email:'issue@example.invalid',channel:'email' };
    const body = { name:'Issue flow synthetic',templateVersionId:versionId, signingOrder:{mode:'grouped',groups:[['opening','client'],['closing']]},
        shared:{opening:shared,closing:shared},rows:[{key:'QA',recipients:{client:{name:'Peer',email:'peer@example.invalid',channel:'email'}}}] };
    const preview = ok(await as(request(f.app).post('/api/signing-v2/creation/preview')).send(body));
    assert.equal(preview.valid,true,JSON.stringify(preview));
    ok(await as(request(f.app).post('/api/signing-v2/creation')).set('Idempotency-Key',randomUUID()).send({...body,previewHash:preview.previewHash}),201);
    const provider=fakeProvider(), workerErrors=[];
    const runtime=createRuntime({pool:f.pool,storage,provider,contextIds:[contextId],env:{...process.env,SIGNING_V2_GRANT_KEY:grantKey.toString('base64'),WEBSITE_DOMAIN:'qa.example.invalid',SIGNING_V2_RENDERERS:'2'},
        log:{log(){},error:(...args)=>workerErrors.push(args.map(String).join(' '))}});
    t.after(()=>runtime.stop()); await runtime.drain(); assert.deepEqual(workerErrors,[]);
    const tokenFor = endpoint => new URL(provider.calls.find(item=>item.endpoint===endpoint).url).hash.slice(1);
    const signer=tokenFor('issue@example.invalid'),peer=tokenFor('peer@example.invalid');
    const pub=(method,url,token=signer)=>request(f.app)[method](`/api/signing-v2/public${url}`).set('X-Signing-Grant',token);
    const view=async token=>ok(await pub('get','/package',token));
    const tasks=state=>state.packages.flatMap(pkg=>pkg.documents.flatMap(doc=>doc.tasks));
    const firstView=await view(signer), first=tasks(firstView).find(task=>task.state==='ready'),later=tasks(firstView).find(task=>task.state==='waiting');
    const other=tasks(await view(peer))[0], packageId=firstView.packages[0].packageId;
    const snapshot=(await f.pool.query('SELECT snapshot FROM signing_package_revisions WHERE package_id=$1',[packageId])).rows[0].snapshot;
    const session = async (token,task) => {
        const opened=ok(await pub('post','/sessions',token).send({taskIds:[task.taskId],consentVersion:CONSENT_VERSION,locale:'he'}),201);
        ok(await pub('post',`/sessions/${opened.sessionId}/challenge`,token).send({}));
        ok(await pub('post',`/sessions/${opened.sessionId}/verify`,token).send({code:codes.at(-1)}));
        return opened;
    };
    const accept=(token,opened,task)=>pub('post',`/sessions/${opened.sessionId}/accept`,token).set('Idempotency-Key',randomUUID()).send({consent:true,values:{[task.taskId]:{[task.fields[0].id]:'Explicit approval'}}});
    const old=await session(signer,first);
    let issueId, acceptedBefore;
    await t.test('foreign/future/multi-PDF selection and missing clarification are denied',async()=>{
        for(const [taskIds,expected] of [[[other.taskId],404],[[later.taskId],409],[[first.taskId,later.taskId],422]]){
            const res=await pub('post','/issues').set('Idempotency-Key',randomUUID()).send({kind:'decline',taskIds,reason:''});
            assert.equal(res.status,expected,JSON.stringify(res.body));
        }
        assert.equal((await pub('post','/issues').set('Idempotency-Key',randomUUID()).send({kind:'clarify',taskIds:[first.taskId],reason:' '})).status,422);
    });
    await t.test('concurrent identical requests persist once; a peer continues but the next stage stays blocked',async()=>{
        const input={kind:'clarify',taskIds:[first.taskId],reason:'Private question for this document',idempotencyKey:randomUUID()};
        const results=await Promise.all([reportTaskIssue(f.pool,signer,input),reportTaskIssue(f.pool,signer,input)]);
        assert.deepEqual(results.map(item=>item.reused).sort(),[false,true]);
        issueId=results[0].issueIds[0];
        await assert.rejects(reportTaskIssue(f.pool,signer,{...input,reason:'Changed intent'}),{errorCode:'IDEMPOTENCY_CONFLICT'});
        assert.equal((await accept(signer,old,first)).status,409);
        ok(await accept(peer,await session(peer,other),other)); await runtime.drain();
        acceptedBefore=(await f.pool.query('SELECT * FROM signing_actions WHERE owner_context_id=$1',[contextId])).rows;
        assert.equal(acceptedBefore.length,1);
        assert.equal(tasks(await view(signer)).find(task=>task.taskId===later.taskId).state,'waiting');
        assert.equal(tasks(await view(signer)).find(task=>task.taskId===first.taskId).issue.reason,input.reason);
        assert.equal(JSON.stringify(await view(peer)).includes(input.reason),false,'another signer never receives the note');
        const detail=await packageDetails(f.pool,scope,packageId);
        assert.equal(detail.package.workflow_state,'attention'); assert.equal(detail.issues[0].canResume,true);
        assert.equal(detail.package.current_stage,0,'attention retains the actual current stage');
        assert.equal(Number(detail.package.required_count),3,'no denominator shrink after clarification');
        assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM signing_task_issues WHERE owner_context_id=$1",[contextId])).rows[0].n,1);
    });
    await t.test('only authorized office can resolve; history and previous signatures stay immutable',async()=>{
        const input={resolution:'Reviewed: please sign the unchanged document',idempotencyKey:randomUUID()};
        await assert.rejects(resolveTaskIssue(f.pool,{...scope,manage:false},packageId,issueId,input),{errorCode:'FORBIDDEN'});
        await assert.rejects(resolveTaskIssue(f.pool,{...scope,all:false,userId:-1},packageId,issueId,input),{errorCode:'NOT_FOUND'});
        const endpoint=`/api/signing-v2/packages/${packageId}/issues/${issueId}/resolve`;
        const result=ok(await as(request(f.app).post(endpoint)).set('Idempotency-Key',input.idempotencyKey).send({resolution:input.resolution}));
        assert.equal(result.state,'ready');
        assert.equal((await resolveTaskIssue(f.pool,scope,packageId,issueId,input)).reused,true);
        await assert.rejects(resolveTaskIssue(f.pool,scope,packageId,issueId,{...input,idempotencyKey:randomUUID()}),{errorCode:'ISSUE_ALREADY_RESOLVED'});
        assert.equal((await accept(signer,old,first)).status,409,'old verified consent does not revive');
        const current=tasks(await view(signer)).find(task=>task.taskId===first.taskId);
        assert.equal(current.version,first.version+2); assert.equal(current.issue.resolution,input.resolution);
        await assert.rejects(f.pool.query('UPDATE signing_task_issues SET reason=$2 WHERE id=$1',[issueId,'rewritten']),/immutable/);
        await assert.rejects(f.pool.query('DELETE FROM signing_task_issues WHERE id=$1',[issueId]),/immutable/);
        assert.deepEqual((await f.pool.query('SELECT * FROM signing_actions WHERE owner_context_id=$1',[contextId])).rows,acceptedBefore);
    });
    await t.test('refusal remains attention; reopening preserves any pre-existing attention',async()=>{
        await f.pool.query("UPDATE signing_package_revisions SET workflow_state='attention' WHERE package_id=$1",[packageId]);
        const result=ok(await pub('post','/issues').set('Idempotency-Key',randomUUID()).send({kind:'decline',taskIds:[first.taskId],reason:''}));
        assert.equal(result.state,'declined');
        await runtime.drain(); assert.equal(tasks(await view(signer)).find(task=>task.taskId===later.taskId).state,'waiting');
        await resolveTaskIssue(f.pool,scope,packageId,result.issueIds[0],{resolution:'Refusal discussed; signer may decide again',idempotencyKey:randomUUID()});
        assert.equal((await packageDetails(f.pool,scope,packageId)).package.workflow_state,'attention');
    });
    await t.test('fresh explicit consent opens the next stage; returning signer needs another session, real PDFs finish',async()=>{
        const fresh=await session(signer,first); assert.notEqual(fresh.sessionId,old.sessionId);
        ok(await accept(signer,fresh,first)); await runtime.drain();
        const current=tasks(await view(signer)).find(task=>task.taskId===later.taskId); assert.equal(current.state,'ready');
        const closing=await session(signer,current); assert.notEqual(closing.sessionId,fresh.sessionId);
        const raced = await Promise.allSettled([
            signingService.accept(signer, closing.sessionId, { consent:true, values:{[current.taskId]:{[current.fields[0].id]:'Explicit approval'}}, idempotencyKey:randomUUID() }),
            reportTaskIssue(f.pool,signer,{kind:'clarify',taskIds:[current.taskId],reason:'Concurrent question',idempotencyKey:randomUUID()}),
        ]);
        assert.equal(raced.filter(result=>result.status==='fulfilled').length,1,'acceptance and a pause cannot both win');
        if (raced[1].status === 'fulfilled') {
            await resolveTaskIssue(f.pool,scope,packageId,raced[1].value.issueIds[0],{resolution:'Answered',idempotencyKey:randomUUID()});
            ok(await accept(signer,await session(signer,current),current));
        }
        await runtime.drain();
        const events=JSON.stringify((await f.pool.query('SELECT details FROM signing_events_v2 WHERE owner_context_id=$1',[contextId])).rows);
        assert.equal(events.includes('Private question for this document'),false,'business notes never enter operational event payloads');
        assert.equal((await packageDetails(f.pool,scope,packageId)).package.workflow_state,'complete');
        assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_actions WHERE owner_context_id=$1',[contextId])).rows[0].n,3);
        assert.deepEqual((await f.pool.query('SELECT snapshot FROM signing_package_revisions WHERE package_id=$1',[packageId])).rows[0].snapshot,snapshot);
        assert.deepEqual((await f.pool.query('SELECT * FROM signing_actions WHERE id=$1',[acceptedBefore[0].id])).rows,acceptedBefore);
        assert.deepEqual(workerErrors,[]);
    });
});
