const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
test('templates, immutable bulk dispatch and manifest-bound shared OTP use the released signing engine', {skip:process.env.LEGAL_DB_QA!=='true',timeout:90000},async t=>{
    const f=await require('./helpers/signingTemplateFixture').signingTemplateFixture();const request=require('supertest');
    const auth=req=>req.set('Authorization',`Bearer ${f.token}`);const expectOk=response=>{assert.ok(response.status<300,JSON.stringify(response.body));return response.body;};
    t.after(()=>f.pool.end());
    const created=expectOk(await auth(request(f.app).post('/api/signing-templates')).send(f.definition));
    const template=created.template;assert.equal(template.version,1);assert.notEqual(template.definition.documents[0].fileKey,f.key);
    const contact=user=>({userId:user.userid,deliveryMethod:'email'});
    const input={templateId:template.id,templateVersion:1,idempotencyKey:crypto.randomUUID(),sharedSigners:{shared:contact(f.users[3])},packages:[
        {label:'חבילה ראשונה',signers:{first:contact(f.users[1])}},{label:'חבילה שנייה',signers:{first:contact(f.users[2])}},
    ]};
    const made=expectOk(await auth(request(f.app).post('/api/signing-batches')).send(input));
    const again=expectOk(await auth(request(f.app).post('/api/signing-batches')).send(input));assert.equal(again.batch.id,made.batch.id);assert.equal(again.reused,true);
    const conflict=await auth(request(f.app).post('/api/signing-batches')).send({...input,name:'different'});assert.equal(conflict.status,409);
    const edited=expectOk(await auth(request(f.app).put(`/api/signing-templates/${template.id}`)).send({...template.definition,name:'גרסה חדשה',expectedVersion:1}));assert.equal(edited.template.version,2);
    assert.equal(expectOk(await auth(request(f.app).post('/api/signing-batches')).send(input)).batch.id,made.batch.id,'retry is stable after template edits');
    const noAuth=await request(f.app).get(`/api/signing-templates/${template.id}`);assert.equal(noAuth.status,401);
    const jwt=require('jsonwebtoken');const foreignLawyer=jwt.sign({userid:f.users[4].userid,role:'Lawyer'},process.env.JWT_SECRET);
    assert.equal((await request(f.app).get(`/api/signing-templates/${template.id}`).set('Authorization',`Bearer ${foreignLawyer}`)).status,404);
    const signerAuth=jwt.sign({userid:f.users[1].userid,role:'Client'},process.env.JWT_SECRET);
    assert.equal((await request(f.app).post('/api/signing-batches').set('Authorization',`Bearer ${signerAuth}`).send(input)).status,403);
    const details=expectOk(await auth(request(f.app).get(`/api/signing-batches/${made.batch.id}`)));assert.equal(details.batch.template_version,1);assert.equal(details.files.length,2);
    assert.equal(details.batch.snapshot.definition.name,f.definition.name);
    const draftFiles=expectOk(await request(f.app).get('/api/SigningFiles/client-files').set('Authorization',`Bearer ${signerAuth}`));
    assert.equal(draftFiles.files.some(file=>details.files.some(d=>d.signingfileid===file.SigningFileId)),false,'draft batches are invisible to recipients before publishing');
    assert.equal((await request(f.app).get(`/api/SigningFiles/${details.files[0].signingfileid}`).set('Authorization',`Bearer ${signerAuth}`)).status,403);
    const coordinates=await f.pool.query('SELECT x,y,width,height FROM signaturespots WHERE signingfileid=$1 ORDER BY signaturespotid',[details.files[0].signingfileid]);
    assert.equal(Number(coordinates.rows[0].x),50.25);assert.equal(Number(coordinates.rows[1].y),600.75);
    const [send1,send2]=await Promise.all([auth(request(f.app).post(`/api/signing-batches/${made.batch.id}/send`)).send({}),auth(request(f.app).post(`/api/signing-batches/${made.batch.id}/send`)).send({})]);
    expectOk(send1);expectOk(send2);assert.equal(f.deliveries.length,3,'one invitation per person, including the shared signer');
    const invite=f.deliveries.find(p=>p.recipientUserId===f.users[3].userid);const batchToken=new URL(invite.email.contactFields.action_url).searchParams.get('batch');
    const prefix=`/api/signing-batches/public/${batchToken}`;
    const publicList=expectOk(await request(f.app).get(prefix));assert.equal(publicList.files.length,2);
    const sessionId=crypto.randomUUID();const reviewed={sessionId,documents:publicList.files.map(file=>({fileId:file.id,sha256:file.sha256})),consentAccepted:true,consentVersion:'2026-01-11'};
    const session=expectOk(await request(f.app).post(`${prefix}/session`).send(reviewed));
    assert.equal((await request(f.app).post(`${prefix}/session`).send({...reviewed,sessionId:crypto.randomUUID(),documents:[{fileId:publicList.files[0].id,sha256:'a'.repeat(64)}]})).status,409);
    expectOk(await request(f.app).post(`${prefix}/session`).send(reviewed));
    assert.equal((await request(f.app).post(`${prefix}/confirm-otp`).send({sessionId})).status,403);
    const signPrefix=`/api/SigningFiles/public/${session.canonicalToken}`;
    expectOk(await request(f.app).post(`${signPrefix}/otp/request`).set('x-signing-session-id',sessionId).send({}));
    assert.equal(f.otp.length,1);assert.match(f.otp[0],/^\d{6}$/);
    const bad=await request(f.app).post(`${signPrefix}/otp/verify`).set('x-signing-session-id',sessionId).send({otp:'XXXXXX'});assert.ok(bad.status>=400 || bad.body.verified!==true);
    expectOk(await request(f.app).post(`${signPrefix}/otp/verify`).set('x-signing-session-id',sessionId).send({otp:f.otp[0]}));
    expectOk(await request(f.app).post(`${prefix}/confirm-otp`).send({sessionId}));
    const {batchOtpGrant}=require('../lib/signingBatchOtpGrant');
    for(const file of publicList.files)assert.ok(await batchOtpGrant({signingFileId:file.id,signerUserId:f.users[3].userid,signingSessionId:sessionId,presentedPdfSha256:file.sha256}));
    assert.equal(await batchOtpGrant({signingFileId:publicList.files[0].id,signerUserId:f.users[2].userid,signingSessionId:sessionId,presentedPdfSha256:publicList.files[0].sha256}),null);
    assert.equal(await batchOtpGrant({signingFileId:publicList.files[0].id,signerUserId:f.users[3].userid,signingSessionId:sessionId,presentedPdfSha256:'wrong'}),null);
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    for(const file of publicList.files){
        const info=expectOk(await request(f.app).get(`/api/SigningFiles/public/${file.token}`));
        const ids=info.signatureSpots.filter(s=>s.SignerUserId===f.users[3].userid).map(s=>s.SignatureSpotId);
        const signed=await request(f.app).post(`/api/SigningFiles/public/${file.token}/sign-batch`).set('x-signing-session-id',sessionId).send({signatureSpotIds:ids,signatureImage:png,consentAccepted:true,consentVersion:'2026-01-11'});
        expectOk(signed);
        const evidence=expectOk(await auth(request(f.app).get(`/api/SigningFiles/${file.id}/evidence`)));
        assert.match(JSON.stringify(evidence),/BATCH_OTP_VERIFIED/);assert.match(JSON.stringify(evidence),/OtpVerificationId/);
    }
    assert.equal(f.otp.length,1,'shared signing uses one actual verified OTP');
    // Complete the two first-signers through their unchanged individual route.
    for(const [index,user] of [f.users[1],f.users[2]].entries()){
        const {createPublicSigningToken}=require('../controllers/signingFileController');const id=details.files[index].signingfileid;
        const singleToken=createPublicSigningToken({signingFileId:id,signerUserId:user.userid});const path=`/api/SigningFiles/public/${singleToken}`;const sid=crypto.randomUUID();
        expectOk(await request(f.app).post(`${path}/otp/request`).set('x-signing-session-id',sid).send({}));
        expectOk(await request(f.app).post(`${path}/otp/verify`).set('x-signing-session-id',sid).send({otp:f.otp.at(-1)}));
        const info=expectOk(await request(f.app).get(path));const ids=info.signatureSpots.filter(s=>s.SignerUserId===user.userid).map(s=>s.SignatureSpotId);
        expectOk(await request(f.app).post(`${path}/sign-batch`).set('x-signing-session-id',sid).send({signatureSpotIds:ids,signatureImage:png,consentAccepted:true,consentVersion:'2026-01-11'}));
    }
    // Wait only for this operation's asynchronous final PDF writes, not broad regression work.
    let completed=[];
    for(let attempt=0;attempt<60;attempt++){
        completed=(await f.pool.query('SELECT status,signedfilekey FROM signingfiles WHERE signingfileid=ANY($1::int[])',[details.files.map(x=>x.signingfileid)])).rows;
        if(completed.every(row=>row.status==='signed'&&row.signedfilekey))break;
        await new Promise(resolve=>setTimeout(resolve,100));
    }
    const {PDFDocument,PDFName}=require('pdf-lib');
    for(const row of completed){
        assert.equal(row.status,'signed');assert.ok(row.signedfilekey);
        const pdf=await PDFDocument.load(f.objects.get(row.signedfilekey));assert.equal(pdf.getPageCount(),2);assert.equal(pdf.getPage(0).getRotation().angle,90);
        for(const page of pdf.getPages()) assert.ok(page.node.Resources().lookup(PDFName.of('XObject')).keys().length>=1,'each original page retains its assigned signature');
    }
    await new Promise(resolve=>setTimeout(resolve,300));
    const packageDefinition={...f.definition,name:'חבילת סיום מרוכז',completionMode:'package',completionEmail:'completion@example.invalid',
        roles:[f.definition.roles[0]],documents:[0,1].map(i=>({...f.definition.documents[0],id:crypto.randomUUID(),name:`מסמך ${i+1}`,fields:[f.definition.documents[0].fields[0]]}))};
    for (const [index,fieldType] of ['text','date','checkbox','number'].entries()) packageDefinition.documents[1].fields.push({
        pageNum:2,x:100,y:200+index*60,width:160,height:40,roleId:'first',fieldType,isRequired:true,fieldLabel:fieldType,
    });
    const packageTemplate=expectOk(await auth(request(f.app).post('/api/signing-templates')).send(packageDefinition)).template;
    const packageBatch=expectOk(await auth(request(f.app).post('/api/signing-batches')).send({templateId:packageTemplate.id,templateVersion:1,idempotencyKey:crypto.randomUUID(),packages:[{label:'חבילת מסירה',signers:{first:contact(f.users[1])}}]})).batch;
    const packageDetails=expectOk(await auth(request(f.app).get(`/api/signing-batches/${packageBatch.id}`)));
    const recipient=packageDetails.recipients[0];
    const manual=expectOk(await auth(request(f.app).post(`/api/signing-batches/${packageBatch.id}/recipients/${recipient.id}/link`)).send({}));
    const pt=new URL(manual.url).searchParams.get('batch');const pp=`/api/signing-batches/public/${pt}`;
    const manifest=expectOk(await request(f.app).get(pp));const packageSessionId=crypto.randomUUID();
    const ps=expectOk(await request(f.app).post(`${pp}/session`).send({sessionId:packageSessionId,documents:manifest.files.map(file=>({fileId:file.id,sha256:file.sha256})),consentAccepted:true,consentVersion:'2026-01-11'}));
    expectOk(await request(f.app).post(`/api/SigningFiles/public/${ps.canonicalToken}/otp/request`).set('x-signing-session-id',packageSessionId).send({}));
    expectOk(await request(f.app).post(`/api/SigningFiles/public/${ps.canonicalToken}/otp/verify`).set('x-signing-session-id',packageSessionId).send({otp:f.otp.at(-1)}));
    expectOk(await request(f.app).post(`${pp}/confirm-otp`).send({sessionId:packageSessionId}));
    for(const [index,file] of manifest.files.entries()){
        const info=expectOk(await request(f.app).get(`/api/SigningFiles/public/${file.token}`));
        const fieldValues={text:'Synthetic reviewed text',date:'2026-10-06',checkbox:'false',number:'0'};
        for (const field of info.signatureSpots.filter(s=>s.FieldType!=='signature')) {
            const endpoint=`/api/SigningFiles/public/${file.token}/sign`;
            const args={signatureSpotId:field.SignatureSpotId,consentAccepted:true,consentVersion:'2026-01-11'};
            if(field.FieldType==='text')assert.equal((await request(f.app).post(endpoint).set('x-signing-session-id',packageSessionId).send({...args,fieldValue:''})).status,422);
            expectOk(await request(f.app).post(endpoint).set('x-signing-session-id',packageSessionId).send({...args,fieldValue:fieldValues[field.FieldType]}));
        }
        expectOk(await request(f.app).post(`/api/SigningFiles/public/${file.token}/sign-batch`).set('x-signing-session-id',packageSessionId).send({signatureSpotIds:info.signatureSpots.filter(s=>s.FieldType==='signature').map(s=>s.SignatureSpotId),signatureImage:png,consentAccepted:true,consentVersion:'2026-01-11'}));
        if(index===0){ await new Promise(resolve=>setTimeout(resolve,250));assert.equal(f.deliveries.filter(p=>p.recipientEmail==='completion@example.invalid').length,0,'a partial package never sends completion'); }
    }
    await new Promise(resolve=>setTimeout(resolve,500));
    expectOk(await auth(request(f.app).post(`/api/signing-batches/${packageBatch.id}/completion`)).send({}));
    const packageDelivery=f.deliveries.filter(p=>p.recipientEmail==='completion@example.invalid');assert.equal(packageDelivery.length,1);
    expectOk(await auth(request(f.app).post(`/api/signing-batches/${packageBatch.id}/completion`)).send({}));
    assert.equal(f.deliveries.filter(p=>p.recipientEmail==='completion@example.invalid').length,1,'completion retries do not resend');
    const downloadPath=new URL(packageDelivery[0].email.contactFields.signed_document_url).pathname;
    const archive=await request(f.app).get(downloadPath).buffer(true).parse((res,callback)=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>callback(null,Buffer.concat(chunks)));});
    assert.equal(archive.status,200,JSON.stringify(archive.body));assert.equal(archive.body.subarray(0,2).toString(),'PK');
    assert.equal(archive.headers['content-type'],'application/zip');
    assert.ok(archive.body.includes(Buffer.from('1-evidence.pdf')));assert.ok(archive.body.includes(Buffer.from('2-evidence.pdf')));
});
