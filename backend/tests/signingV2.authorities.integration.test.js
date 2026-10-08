const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const {PDFDocument}=require('pdf-lib');
const {databaseFixture}=require('./helpers/signingV2Fixture');
const {createLegalEntity}=require('../services/signingV2/people');
const {createAuthority,changeAuthority,assertCurrentAuthorities}=require('../services/signingV2/authorities');
const {createSubmission}=require('../services/signingV2/submissions');
const {createWorkflowService}=require('../services/signingV2/workflow');
const {createPreparationService}=require('../services/signingV2/preparation');
const {createGrantService}=require('../services/signingV2/grants');
const {RenderPool}=require('../services/signingV2/renderPool');
const {bytesHash}=require('../lib/signingV2/canonical');
const jobs=require('../services/signingV2/jobs');

test('corporate authority evidence, explicit action permission, approval and current-head revocation gate',
    {skip:process.env.LEGAL_DB_QA!=='true',timeout:90000},async t=>{
    const pool=require('../config/db');t.after(()=>pool.end());
    const pdf=await PDFDocument.create();pdf.addPage([595,842]);const sourceBytes=Buffer.from(await pdf.save());
    let authority,office;
    const f=await databaseFixture(pool,{documentCount:1,sourceBytes,configure:async({definition,packages,contextId,userId,source})=>{
        office={contextId,userId,all:true,authorityManage:true};
        const company=await createLegalEntity(pool,office,{name:'Synthetic Corporation',registration:{country:'IL',type:'company',value:'000000001'}});
        const id=randomUUID();
        await pool.query(`INSERT INTO signing_artifacts(id,owner_context_id,kind,inputs_hash,content_sha256,object_key,bytes,state,ready_at,created_by)
            VALUES($1,$2,'authority',$3,$3,$4,2048,'ready',now(),$5)`,[id,contextId,'c'.repeat(64),`synthetic/${contextId}/authority.pdf`,userId]);
        const input={personId:packages[0].roles.employee[0].personId,partyId:company.id,evidenceArtifactId:id,
            scope:{roleKeys:['employee']},validFrom:'2020-01-01T00:00:00Z',validUntil:null};
        await assert.rejects(createAuthority(pool,{...office,authorityManage:false},input),{errorCode:'FORBIDDEN'});
        await assert.rejects(createAuthority(pool,office,{...input,evidenceArtifactId:source.id}),{errorCode:'NOT_FOUND'});
        authority=await createAuthority(pool,office,input);assert.equal(authority.status,'pending');
        await assert.rejects(changeAuthority(pool,office,authority.id,{expectedVersion:1,action:'approve',reason:''}),{errorCode:'REASON_REQUIRED'});
        authority=await changeAuthority(pool,office,authority.id,{expectedVersion:1,action:'approve',reason:'Synthetic authority review'});
        assert.equal(authority.version,2);assert.equal(authority.approved_by,userId);
        packages[0].roles.employee[0]={personId:input.personId,partyId:company.id,authorityId:authority.id};
        definition.roles[0].capacity='representative';return definition;
    }});
    await createSubmission(pool,f.scope,f.input,{reserveCapacity:async()=>{}});
    const revision=(await pool.query('SELECT id FROM signing_package_revisions WHERE owner_context_id=$1',[f.contextId])).rows[0];
    const signer=await pool.connect(),revoker=await pool.connect();
    try {
        await signer.query('BEGIN');
        assert.equal((await assertCurrentAuthorities(signer,f.contextId,revision.id)).length,1);
        await revoker.query('BEGIN');
        await assert.rejects(revoker.query('SELECT id FROM signing_authorities WHERE id=$1 FOR UPDATE NOWAIT',[authority.id]),{code:'55P03'});
        await revoker.query('ROLLBACK');await signer.query('COMMIT');
    } finally {await signer.query('ROLLBACK');await revoker.query('ROLLBACK');signer.release();revoker.release();}
    const objects=new Map();const storage={read:async()=>sourceBytes,write:async(key,bytes)=>objects.set(key,Buffer.from(bytes)),
        verify:async(key,length,hash)=>{assert.equal(objects.get(key).length,length);assert.equal(bytesHash(objects.get(key)),hash);}};
    const renderer=new RenderPool({concurrency:1});t.after(()=>renderer.close());
    const prepare=createPreparationService({pool,renderer,storage});
    const claim=kind=>jobs.claim(pool,{contextIds:[f.contextId],kinds:[kind],workerId:'authority-qa',limit:1});
    await prepare((await claim('prepare_document'))[0]);
    const workflow=createWorkflowService({pool,grantService:createGrantService({encryptionKey:randomBytes(32)}),authorizeActivation:async()=>{}});
    await workflow.validatePackage((await claim('validate_package'))[0]);
    const lease=(await claim('activate_package'))[0];
    await assert.rejects(changeAuthority(pool,office,authority.id,{expectedVersion:1,action:'revoke',reason:'Stale review'}),{errorCode:'VERSION_CHANGED'});
    const revoked=await changeAuthority(pool,office,authority.id,{expectedVersion:2,action:'revoke',reason:'Synthetic revocation after preflight'});
    assert.equal(revoked.version,3);
    await assert.rejects(workflow.activatePackage(lease),{errorCode:'AUTHORITY_EXPIRED'});
    assert.equal((await pool.query('SELECT count(*) FROM signing_public_grants WHERE owner_context_id=$1',[f.contextId])).rows[0].count,'0');
    assert.equal((await pool.query("SELECT count(*) FROM signing_tasks WHERE owner_context_id=$1 AND state='ready'",[f.contextId])).rows[0].count,'0');
    assert.equal((await pool.query("SELECT count(*) FROM signing_events_v2 WHERE owner_context_id=$1 AND kind LIKE 'authority_%'",[f.contextId])).rows[0].count,'3');
});
