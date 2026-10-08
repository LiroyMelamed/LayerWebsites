const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { createSubmission } = require('../services/signingV2/submissions');
const { createPreparationService } = require('../services/signingV2/preparation');
const { createWorkflowService } = require('../services/signingV2/workflow');
const { createGrantService,loadPublicGrant } = require('../services/signingV2/grants');
const { RenderPool } = require('../services/signingV2/renderPool');
const jobs = require('../services/signingV2/jobs');
const { bytesHash } = require('../lib/signingV2/canonical');

test('real preparation → immutable preflight → current authorization → stage activation and scoped durable grants',
    {skip:process.env.LEGAL_DB_QA!=='true',timeout:90000},async t=>{
    const pool=require('../config/db');t.after(()=>pool.end());
    const pdf=await PDFDocument.create();pdf.addPage([595,842]).drawText('SYNTHETIC WORKFLOW ONLY');
    const sourceBytes=Buffer.from(await pdf.save());
    const f=await databaseFixture(pool,{packageCount:2,documentCount:3,sourceBytes,configure:async({definition,packages})=>{
        definition.stages.push({key:'counsel',label:'Professional review',after:'employee'});
        definition.roles.push({key:'counsel',label:'Professional',capacity:'professional',min:1,max:1,stage:1});
        for(const document of definition.documents) document.fields.push({...document.fields[1],id:'professionalSignature',roleKey:'counsel',y:210});
        for(const input of packages) input.roles.counsel=[{...input.roles.employee[0]}];
        return definition;
    }});
    const objects=new Map();
    const storage={read:async()=>Buffer.from(sourceBytes),write:async(key,bytes)=>objects.set(key,Buffer.from(bytes)),
        verify:async(key,length,hash)=>{assert.equal(objects.get(key).length,length);assert.equal(bytesHash(objects.get(key)),hash);}};
    const renderer=new RenderPool({concurrency:2});t.after(()=>renderer.close());
    const prepare=createPreparationService({pool,renderer,storage});
    let permitted=true,authorizationChecks=0;
    const grantService=createGrantService({encryptionKey:randomBytes(32),keyId:'synthetic'});
    const workflow=createWorkflowService({pool,grantService,authorizeActivation:async()=>{
        authorizationChecks++;if(!permitted) throw Object.assign(new Error('Current permission revoked'),{errorCode:'FORBIDDEN'});
    }});
    await createSubmission(pool,f.scope,f.input,{reserveCapacity:async()=>{}});
    const claim=kind=>jobs.claim(pool,{contextIds:[f.contextId],workerId:'workflow-qa',kinds:[kind],limit:8});
    assert.equal((await claim('activate_package')).length,0);
    await Promise.all((await claim('prepare_document')).map(prepare));
    const validations=await claim('validate_package');assert.equal(validations.length,2);
    await Promise.all(validations.map(workflow.validatePackage));
    const proofs=(await pool.query('SELECT * FROM signing_preflights WHERE owner_context_id=$1',[f.contextId])).rows;
    assert.equal(proofs.length,2);assert.equal(proofs[0].manifest.documents.length,3);
    assert.notEqual(proofs[0].preview_hash,proofs[1].preview_hash);
    await assert.rejects(pool.query("UPDATE signing_preflights SET preview_hash=repeat('a',64) WHERE owner_context_id=$1",[f.contextId]),{code:'23514'});
    const activations=await claim('activate_package');assert.equal(activations.length,2);
    permitted=false;
    await assert.rejects(workflow.activatePackage(activations[0]),{errorCode:'FORBIDDEN'});
    assert.equal((await pool.query('SELECT count(*) FROM signing_public_grants WHERE owner_context_id=$1',[f.contextId])).rows[0].count,'0');
    permitted=true;
    await Promise.all(activations.map(workflow.activatePackage));
    assert.equal(authorizationChecks,3);
    const states=(await pool.query(`SELECT stage,state,count(*)::integer AS count FROM signing_tasks WHERE owner_context_id=$1 GROUP BY stage,state ORDER BY stage`,[f.contextId])).rows;
    assert.deepEqual(states,[{stage:0,state:'ready',count:6},{stage:1,state:'blocked',count:6}]);
    const grants=(await pool.query('SELECT * FROM signing_public_grants WHERE owner_context_id=$1 ORDER BY id',[f.contextId])).rows;
    assert.equal(grants.length,2,'shared endpoint does not merge different people or packages');
    const firstToken=grantService.tokenForDelivery(grants[0]);
    assert.ok(!JSON.stringify(grants[0]).includes(firstToken),'token not stored in plaintext');
    assert.throws(()=>grantService.tokenForDelivery({...grants[0],person_id:grants[1].person_id}),{errorCode:'GRANT_TOKEN_UNAVAILABLE'});
    const grant=await loadPublicGrant(pool,firstToken);assert.equal(grant.items.length,3);
    const ownDocuments=new Set((await pool.query(`SELECT DISTINCT t.document_id FROM signing_tasks t JOIN signing_participations p ON p.owner_context_id=t.owner_context_id AND p.id=t.participation_id
        WHERE t.owner_context_id=$1 AND p.person_id=$2`,[f.contextId,grant.person_id])).rows.map(row=>row.document_id));
    assert.ok(grant.items.every(item=>ownDocuments.has(item.document_id)));
    assert.ok(grant.items.every(item=>item.person_id===grant.person_id));
    assert.equal((await pool.query("SELECT count(*) FROM signing_deliveries WHERE owner_context_id=$1 AND (state<>'pending' OR provider_accepted_at IS NOT NULL)",[f.contextId])).rows[0].count,'0');
    assert.equal((await pool.query('SELECT count(*) FROM signing_deliveries WHERE owner_context_id=$1 AND grant_id IS NOT NULL',[f.contextId])).rows[0].count,'2');
    await pool.query('UPDATE signing_delivery_profiles SET version=version+1 WHERE owner_context_id=$1 AND id=$2',[f.contextId,grant.items[0].delivery_profile_id]);
    await assert.rejects(loadPublicGrant(pool,firstToken),{errorCode:'LINK_UNAVAILABLE'});
    const otherToken=grantService.tokenForDelivery(grants[1]);
    assert.equal((await loadPublicGrant(pool,otherToken)).items.length,3,'contact change is scoped to one profile');
    await pool.query('UPDATE signing_public_grants SET revoked_at=clock_timestamp() WHERE owner_context_id=$1 AND id=$2',[f.contextId,grants[1].id]);
    await assert.rejects(loadPublicGrant(pool,otherToken),{errorCode:'LINK_UNAVAILABLE'});
    await assert.rejects(workflow.activatePackage(activations[0]),{errorCode:'WORKER_LEASE_LOST'});
});
