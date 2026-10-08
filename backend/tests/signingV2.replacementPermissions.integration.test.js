const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const{deliveryHarness}=require('./helpers/signingV2Delivery');
const replacement=require('../services/signingV2/replacement');
const{authorizeActivation,officeQuota}=require('../services/signingV2/runtime');

test('new replacement HTTP activation and quota permissions only',{skip:process.env.LEGAL_DB_QA!=='true',timeout:30000},async t=>{
 const pool=require('../config/db');t.after(()=>pool.end());const h=await deliveryHarness(pool,{endpoints:['replacement-permissions@example.invalid'],documentCount:1});t.after(h.close);await h.submit();
 const pkg=(await pool.query('SELECT id FROM signing_packages WHERE owner_context_id=$1',[h.f.contextId])).rows[0].id;
 const permissions={version:7,areas:{signing:{visible:true,actions:['view','manage','upload'],dataScope:'all_firm'}}};
 const role=(await pool.query('INSERT INTO firm_staff_roles(name,permissions) VALUES($1,$2) RETURNING id',['Replacement reviewer '+randomUUID(),permissions])).rows[0].id;
 const staff=(await pool.query("INSERT INTO users(name,email,role,passwordhash,firm_staff_role_id) VALUES('Replacement preparer',$1,'Staff','synthetic',$2) RETURNING userid",[randomUUID()+'@example.invalid',role])).rows[0].userid;
 const scope={...h.f.scope,userId:staff,packageRevise:true,send:true,manage:true};
 const express=require('express'),http=require('supertest'),jwt=require('jsonwebtoken'),app=express();app.use(express.json());app.use('/api/signing-v2',require('../routes/signingV2Routes'));app.use((e,req,res,next)=>res.status(e.httpStatus||500).json({code:e.errorCode}));
 process.env.SIGNING_V2_ENABLED='true';process.env.SIGNING_DEPLOYMENT_KEY=(await pool.query('SELECT deployment_key FROM signing_owner_contexts WHERE id=$1',[scope.contextId])).rows[0].deployment_key;
 t.after(()=>{delete process.env.SIGNING_V2_ENABLED;delete process.env.SIGNING_DEPLOYMENT_KEY;});const auth='Bearer '+jwt.sign({userid:staff,role:'Staff'},process.env.JWT_SECRET),path='/api/signing-v2/packages/'+pkg+'/replacement';
 let revision;
 await t.test('HTTP requires explicit revision action current package scope and no anonymous access',async()=>{
  assert.equal((await http(app).get(path).set('Authorization',auth)).status,403);assert.equal((await http(app).get(path)).status,401);
  permissions.areas.signing.actions.push('package_revision_create');await pool.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1',[role,permissions]);
  const response=await http(app).get(path).set('Authorization',auth);assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.packageId,pkg);
  const read=response.body,started=await http(app).post(path+'/start').set('Authorization',auth).set('Idempotency-Key',randomUUID()).send({reason:'Reviewed correction',expectedRevisionId:read.revisionId,expectedPackageVersion:read.packageVersion,sourceReviewHash:read.sourceReviewHash});assert.equal(started.status,200,JSON.stringify(started.body));
  const input={content:started.body.content,reason:'Reviewed correction',expectedRevisionId:started.body.revisionId,expectedPackageVersion:started.body.packageVersion};input.content.rows[0].data.employeeId='987654321';
  const preview=await http(app).post(path+'/preview').set('Authorization',auth).send(input);assert.equal(preview.status,200,JSON.stringify(preview.body));assert.equal(preview.body.valid,true,JSON.stringify(preview.body.errors));
  // Direct execute uses a synthetic quota adapter; HTTP route plumbing was exercised without an external limits provider.
  const result=await replacement.executeReplacement(pool,scope,pkg,{...input,previewHash:preview.body.previewHash,idempotencyKey:randomUUID()},{reserveCapacity:async()=>{}});
  revision=(await pool.query('SELECT * FROM signing_package_revisions WHERE id=$1',[result.revisionId])).rows[0];assert.equal(revision.authorized_by_userid,staff);
 });
 await t.test('replacement activation denies revoked preparer revision capability and removed current package data scope',async()=>{
  await authorizeActivation(pool,revision);
  permissions.areas.signing.actions=permissions.areas.signing.actions.filter(a=>a!=='package_revision_create');await pool.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1',[role,permissions]);await assert.rejects(authorizeActivation(pool,revision),{errorCode:'ACTIVATION_NOT_AUTHORIZED'});
  permissions.areas.signing.actions.push('package_revision_create');permissions.areas.signing.dataScope='assigned_only';await pool.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1',[role,permissions]);await assert.rejects(authorizeActivation(pool,revision),{errorCode:'ACTIVATION_NOT_AUTHORIZED'});
  assert.equal((await http(app).get(path).set('Authorization',auth)).status,404);
 });
 await t.test('replacement quota reserves new PDF while original durable receipt remains unchanged',async()=>{
  let checked;await officeQuota({checkFirmLimits:async value=>{checked=value;}})(pool,scope,{documents:1,estimatedOutputBytes:1000});assert.equal(checked.increments.documentsCreatedThisMonth,3);
  const original=(await pool.query('SELECT package_count,document_count FROM signing_submissions WHERE owner_context_id=$1',[scope.contextId])).rows[0];assert.deepEqual(original,{package_count:1,document_count:1});
 });
});
