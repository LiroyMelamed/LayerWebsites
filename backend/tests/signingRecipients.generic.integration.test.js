const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),request=require('supertest');
test('all signer roles accept office staff, clients and explicit external contacts, keeping deleted and tenant fences', {skip:process.env.LEGAL_DB_QA!=='true'},async t=>{
    const f=await require('./helpers/signingTemplateFixture').signingTemplateFixture();t.after(()=>f.pool.end());
    const as=call=>call.set('Authorization',`Bearer ${f.token}`),ok=reply=>{assert.ok([200,201].includes(reply.status),JSON.stringify(reply.body));return reply.body;};
    const prefix=`Directory-${randomUUID()}`;
    for(const user of [f.users[0],f.users[1],f.users[4]])await f.pool.query('UPDATE users SET name=$1 WHERE userid=$2',[`${prefix} ${user.role}`,user.userid]);
    const deleted=(await f.pool.query("INSERT INTO users(name,email,role) VALUES($1,$2,'Deleted') RETURNING userid",[`${prefix} deleted`,`${randomUUID()}@example.invalid`])).rows[0];
    const directory=ok(await as(request(f.app).get(`/api/signing-batches/contacts?q=${prefix}`))).contacts;
    assert.deepEqual(directory.map(p=>p.role).sort(),['Admin','Client','Lawyer']);assert.equal(directory.some(p=>p.userId===deleted.userid),false);
    const definition=structuredClone(f.definition);definition.roles[1].kind='lawyer';
    const template=ok(await as(request(f.app).post('/api/signing-templates')).send(definition)).template;
    const contact=user=>({userId:user.userid,deliveryMethod:'email'});
    for(const signers of [{first:contact(f.users[0]),shared:contact(f.users[1])},{first:contact(f.users[1]),shared:{name:'External professional',email:`${randomUUID()}@example.invalid`,deliveryMethod:'email'}}]){
        const created=ok(await as(request(f.app).post('/api/signing-batches')).send({templateId:template.id,templateVersion:template.version,idempotencyKey:randomUUID(),sharedSigners:{shared:signers.shared},packages:[{label:'Generic roles',signers:{first:signers.first}}]}));
        assert.ok(created.batch.id);
    }
    const invalid=await as(request(f.app).post('/api/signing-batches')).send({templateId:template.id,templateVersion:template.version,idempotencyKey:randomUUID(),sharedSigners:{shared:contact(deleted)},packages:[{label:'Deleted',signers:{first:contact(f.users[1])}}]});
    assert.equal(invalid.status,403);assert.equal(f.deliveries.length,0);assert.equal(f.otp.length,0);
});
