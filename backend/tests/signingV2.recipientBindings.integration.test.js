const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');

test('explicit same-person roles preserve distinct stages and never merge matching contacts or copy a row into all packages',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 120000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture(); t.after(() => f.pool.end());
    Object.assign(process.env, { SIGNING_V2_ENABLED: 'true', SIGNING_DEPLOYMENT_KEY: `qa-binding-${randomUUID()}.invalid` });
    t.after(() => { delete process.env.SIGNING_V2_ENABLED; delete process.env.SIGNING_DEPLOYMENT_KEY; });
    const as = call => call.set('Authorization', `Bearer ${f.token}`);
    const ok = (r,status=200) => { assert.equal(r.status,status,JSON.stringify(r.body)); return r.body; };
    const roles = [{ id: 'opening', name: 'Opening lawyer', kind: 'shared' }, { id: 'client', name: 'Client', kind: 'custom' }, { id: 'closing', name: 'Closing lawyer', kind: 'shared' }];
    const definition = { ...f.definition, roles, signingOrder: 'sequential', documents: roles.map((role,index)=>({
        id: randomUUID(), name: role.name, fileKey: f.key, fields: [{ pageNum: 1, x: 50, y: 100+index*70, width: 160, height: 55,
            roleId: role.id, fieldType: 'signature', isRequired: true }],
    })) };
    const legacy = ok(await as(request(f.app).post('/api/signing-templates')).send(definition),201).template;
    const version = ok(await as(request(f.app).post(`/api/signing-v2/templates/legacy/${legacy.id}/import`)).send({}),201).versionId;
    const person = name => ({ name, email: 'shared-contact@example.invalid', channel:'email' });
    const body = { name:'Explicit identity QA', templateVersionId:version,
        shared:{ opening:person('Lawyer'), closing:{ sameAsRole:'opening' } },
        rows:[1,2].map(i=>({ key:`C${i}`,recipients:{ client:person(`Client ${i}`) } })) };
    const preview = async value => ok(await as(request(f.app).post('/api/signing-v2/creation/preview')).send(value));
    const checked = await preview(body);
    assert.equal(checked.valid,true,JSON.stringify(checked.errors)); assert.equal(checked.recipientCount,3);
    const changed = structuredClone(body); changed.shared.closing = person('Separate lawyer');
    assert.equal((await as(request(f.app).post('/api/signing-v2/creation')).set('Idempotency-Key',randomUUID()).send({...changed,previewHash:checked.previewHash})).status,412);
    const cycle = structuredClone(body); cycle.shared.opening = {sameAsRole:'closing'};
    assert.ok((await preview(cycle)).errors.some(e=>e.code==='RECIPIENT_LINK_CYCLE'));
    const rowToRun = structuredClone(body); rowToRun.shared.closing = {sameAsRole:'client'};
    assert.ok((await preview(rowToRun)).errors.some(e=>e.code==='RECIPIENT_LINK_UNAVAILABLE'));
    const missing = {...body, omittedRoles:['opening']};
    assert.ok((await preview(missing)).errors.some(e=>e.code==='RECIPIENT_LINK_UNAVAILABLE'));
    const individual = structuredClone(body); individual.rows[0].recipients.client = {sameAsRole:'opening'};
    assert.equal((await preview(individual)).recipientCount,2,'one explicit row may reuse the shared person without changing another row');
    const creationKey = randomUUID();
    const send = () => as(request(f.app).post('/api/signing-v2/creation')).set('Idempotency-Key',creationKey).send({...body,previewHash:checked.previewHash});
    const created = ok(await send(),201); assert.equal(ok(await send()).submissionId,created.submissionId);
    const entries = (await f.pool.query(`SELECT pk.external_key,p.role_key,p.person_id,t.stage FROM signing_packages pk
        JOIN signing_participations p ON p.revision_id=pk.active_revision_id JOIN signing_tasks t ON t.participation_id=p.id
        WHERE pk.submission_id=$1 ORDER BY pk.external_key,t.stage`,[created.submissionId])).rows;
    assert.equal(entries.length,6);
    assert.equal(new Set(entries.map(item=>item.person_id)).size,3,'matching addresses do not merge the two clients');
    const lawyerIds = entries.filter(item=>item.role_key!=='client').map(item=>item.person_id);
    assert.equal(new Set(lawyerIds).size,1,'only explicitly linked roles share the identity');
    assert.deepEqual(entries.map(item=>item.stage),[0,1,2,0,1,2],'linking a person never collapses signing order');
    assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_delivery_profiles WHERE revision_id IN (SELECT active_revision_id FROM signing_packages WHERE submission_id=$1)',[created.submissionId])).rows[0].n,4,'one delivery profile per person/package');
});
