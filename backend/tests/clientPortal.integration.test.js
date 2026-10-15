const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { listClientSigningFiles } = require('../lib/clientSigningReadiness');

test('client dashboard reads exact personal signing progress and only linked tenant attachments',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 60000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    const client = f.users[1], other = f.users[2], outsider = f.users[3], lawyer = f.users[0];
    const fileIds = [], caseIds = [];
    const tenantId = randomUUID();
    t.after(async () => {
        await f.pool.query('DELETE FROM signingfiles WHERE signingfileid = ANY($1::int[])', [fileIds]);
        await f.pool.query('DELETE FROM stage_files WHERE caseid = ANY($1::int[])', [caseIds]);
        await f.pool.query('DELETE FROM case_users WHERE caseid = ANY($1::int[])', [caseIds]);
        await f.pool.query('DELETE FROM cases WHERE caseid = ANY($1::int[])', [caseIds]);
        await f.pool.query('DELETE FROM users WHERE userid = ANY($1::int[])', [f.users.map(u => u.userid)]);
        await f.pool.query('DELETE FROM law_firm_tenants WHERE id = $1', [tenantId]);
        await f.pool.end();
    });
    await f.pool.query('INSERT INTO law_firm_tenants(id,slug,name) VALUES($1,$2,$3)',
        [tenantId, `portal-${randomUUID()}`, 'Synthetic foreign tenant']);
    await f.pool.query('UPDATE users SET law_firm_tenant_id=$1 WHERE userid=$2', [tenantId, f.users[4].userid]);
    const makeCase = async (name, tenant = null, member = client.userid) => {
        const { rows } = await f.pool.query('INSERT INTO cases(casename,userid,law_firm_tenant_id) VALUES($1,$2,$3) RETURNING caseid',
            [name, member, tenant]);
        const id = rows[0].caseid; caseIds.push(id);
        await f.pool.query('INSERT INTO case_users(caseid,userid) VALUES($1,$2)', [id, member]);
        return id;
    };
    const ownCase = await makeCase('Synthetic own case');
    const secondCase = await makeCase('Synthetic second case');
    const unrelatedCase = await makeCase('Synthetic unrelated case', null, other.userid);
    // Deliberate cross-tenant membership must not widen either dashboard query.
    const foreignCase = await makeCase('Synthetic foreign case', tenantId);
    const makeFile = async ({ name, status = 'pending', order = 'parallel', owner = client.userid,
        lawyerId = lawyer.userid, caseId = ownCase, expired = false, spots = [] }) => {
        const { rows } = await f.pool.query(`INSERT INTO signingfiles
            (caseid,lawyerid,clientid,filename,filekey,status,signingorder,expiresat)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING signingfileid`,
        [caseId, lawyerId, owner, name, `synthetic/${name}.pdf`, status, order,
            new Date(Date.now() + (expired ? -3600000 : 3600000))]);
        const id = rows[0].signingfileid; fileIds.push(id);
        for (const spot of spots) await f.pool.query(`INSERT INTO signaturespots
            (signingfileid,pagenumber,x,y,width,height,signeruserid,signerindex,fieldtype,isrequired,issigned,signedat)
            VALUES($1,1,10,10,120,40,$2,$3,$4,$5,$6,$7)`,
        [id, spot.owner === undefined ? client.userid : spot.owner, spot.index ?? 0,
            spot.type || 'signature', spot.required !== false, Boolean(spot.signed),
            spot.signed ? new Date('2026-01-01T12:00:00Z') : null]);
        return id;
    };
    const own = {};
    own.ready = await makeFile({ name: 'ready', order: 'sequential', spots: [
        {}, { type: 'lawyerstamp', owner: lawyer.userid, index: -1 },
        { owner: other.userid, index: 1 }, { required: false },
    ] });
    own.secondaryDone = await makeFile({ name: 'secondary-completed', owner: other.userid, spots: [
        { signed: true, index: 1 }, { owner: null, index: 0 },
    ] });
    own.waiting = await makeFile({ name: 'waiting', order: 'sequential', owner: other.userid, spots: [
        { index: 1 }, { owner: null, index: 0 },
    ] });
    own.expired = await makeFile({ name: 'expired', expired: true, spots: [{}] });
    own.rejected = await makeFile({ name: 'rejected', status: 'rejected', spots: [{}] });
    own.signed = await makeFile({ name: 'signed', status: 'signed', spots: [{ signed: true }] });
    own.nonpending = await makeFile({ name: 'nonpending', status: 'signed', spots: [{}] });
    own.noRequired = await makeFile({ name: 'no-required', spots: [{ required: false }, { type: 'lawyerstamp' }] });
    const hidden = [
        await makeFile({ name: 'foreign-owner', lawyerId: f.users[4].userid, spots: [{}] }),
        await makeFile({ name: 'foreign-case', caseId: foreignCase, spots: [{}] }),
        await makeFile({ name: 'draft', status: 'draft', spots: [{}] }),
        await makeFile({ name: 'other-client', owner: other.userid, spots: [{ owner: null }] }),
    ];
    const token = user => jwt.sign({ userid: user.userid, role: user.role }, process.env.JWT_SECRET);
    const as = (call, user = client) => call.set('Authorization', `Bearer ${token(user)}`);
    const list = async user => {
        const reply = await as(request(f.app).get('/api/SigningFiles/client-files'), user);
        assert.equal(reply.status, 200, JSON.stringify(reply.body));
        assert.equal(reply.headers["cache-control"], "private, no-store");
        return reply.body.files;
    };
    await t.test('exact ownership, sequential turn and document state determine personal readiness', async () => {
        const files = await list(client), find = key => files.find(row => row.SigningFileId === own[key]);
        for (const id of hidden) assert.equal(files.some(row => row.SigningFileId === id), false);
        assert.equal(find('ready').PersonalStatus, 'pending');
        assert.equal(find('ready').CanSignNow, true);
        assert.equal(find('ready').PersonalTotalSpots, 1);
        assert.equal(find('waiting').PersonalStatus, 'waiting');
        assert.equal(find('waiting').CanSignNow, false);
        assert.equal(find('secondaryDone').Status, 'pending');
        assert.equal(Number(find('secondaryDone').TotalSpots), 2, 'existing counter preserved');
        assert.equal(find('secondaryDone').PersonalTotalSpots, 1, 'secondary client does not own null spots');
        assert.equal(find('secondaryDone').PersonalSignedSpots, 1);
        assert.equal(find('secondaryDone').PersonalStatus, 'signed');
        assert.equal(find('secondaryDone').PersonalSignedAt, '2026-01-01T12:00:00.000Z');
        assert.equal(find('secondaryDone').CanSignNow, false);
        for (const [key, expected] of [['expired', 'expired'], ['rejected', 'rejected'], ['signed', 'signed'],
            ['nonpending', 'unavailable'], ['noRequired', 'unavailable']]) {
            assert.equal(find(key).PersonalStatus, expected);
            assert.equal(find(key).CanSignNow, false);
        }
        for (const row of files) for (const internal of ['SigningOrder', 'PersonalNextIndex', 'NextUnsignedIndex', 'HasUnindexedRequiredSpots']) {
            assert.equal(Object.hasOwn(row, internal), false);
        }
        const primary = (await list(other)).find(row => row.SigningFileId === own.secondaryDone);
        assert.equal(primary.PersonalTotalSpots, 1);
        assert.equal(primary.PersonalSignedSpots, 0);
        assert.equal(primary.CanSignNow, true, 'primary client owns the null spot');
        assert.deepEqual(await list(outsider), []);
    });
    await t.test('finishing the preceding signer unlocks the next required spot', async () => {
        await f.pool.query('UPDATE signaturespots SET issigned=true,signedat=now() WHERE signingfileid=$1 AND signeruserid IS NULL', [own.waiting]);
        const file = (await list(client)).find(row => row.SigningFileId === own.waiting);
        assert.equal(file.PersonalStatus, 'pending');
        assert.equal(file.CanSignNow, true);
    });
    await t.test('a completed personal signature stays signed when the document later expires', async () => {
        await f.pool.query("UPDATE signingfiles SET status='expired',expiresat=now()-interval '1 hour' WHERE signingfileid=$1", [own.secondaryDone]);
        const file = (await list(client)).find(row => row.SigningFileId === own.secondaryDone);
        assert.equal(file.Status, 'expired');
        assert.equal(file.PersonalStatus, 'signed');
        assert.equal(file.CanSignNow, false);
        assert.equal(file.PersonalTotalSpots, 1);
        assert.equal(file.PersonalSignedSpots, 1);
        assert.equal(file.PersonalSignedAt, '2026-01-01T12:00:00.000Z');
    });
    await t.test('older schema capability reports fail closed while keeping the listing available', async () => {
        for (const missing of ['signeruserid', 'fieldtype', 'signerindex', 'signingorder']) {
            const older = { query: async (sql, params) => {
                const result = await f.pool.query(sql, params);
                return sql.includes('information_schema.columns')
                    ? { ...result, rows: result.rows.filter(row => row.column_name !== missing) } : result;
            } };
            const files = await listClientSigningFiles(older, { user: { UserId: client.userid }, firmTenantId: null }, { enabled: false });
            const ready = files.find(row => row.SigningFileId === own.ready);
            assert.equal(ready.CanSignNow, false, missing);
            assert.equal(ready.PersonalStatus, 'unavailable', missing);
        }
    });
    await t.test('attachment aggregate uses membership, tenant, full arrays and metadata only', async () => {
        const add = async (caseId, date) => (await f.pool.query(`INSERT INTO stage_files
            (caseid,stage,file_key,file_name,file_ext,file_mime,file_size,uploaded_by,created_at)
            VALUES($1,1,$2,'Synthetic.pdf','pdf','application/pdf',123,$3,$4) RETURNING id`,
        [caseId, `synthetic/${randomUUID()}.pdf`, lawyer.userid, date])).rows[0].id;
        const old = await add(ownCase, '2026-01-01');
        const recent = await add(secondCase, '2026-02-01');
        await add(unrelatedCase, '2026-03-01');
        const foreign = await add(foreignCase, '2026-04-01');
        const reply = await as(request(f.app).get(`/api/Files/client-files?userId=${other.userid}&caseId=${unrelatedCase}&limit=1`));
        assert.equal(reply.status, 200);
        assert.equal(reply.headers["cache-control"], "private, no-store");
        assert.deepEqual(reply.body.map(row => row.id), [recent, old]);
        for (const row of reply.body) assert.deepEqual(Object.keys(row).sort(),
            ['id', 'caseid', 'stage', 'file_name', 'file_ext', 'file_mime', 'file_size', 'created_at', 'CaseName'].sort());
        assert.equal(reply.body[0].CaseName, 'Synthetic second case');
        assert.deepEqual((await as(request(f.app).get('/api/Files/client-files'), outsider)).body, []);
        assert.equal((await request(f.app).get('/api/Files/client-files')).status, 401);
        assert.equal((await as(request(f.app).get('/api/Files/client-files'), lawyer)).status, 403);
        assert.equal((await as(request(f.app).get(`/api/Files/stage-file-read/${old}`), outsider)).status, 403);
        await f.pool.query('UPDATE users SET law_firm_tenant_id=$1 WHERE userid=$2', [tenantId, outsider.userid]);
        await f.pool.query('INSERT INTO case_users(caseid,userid) VALUES($1,$2)', [foreignCase, outsider.userid]);
        const tenantReply = await as(request(f.app).get('/api/Files/client-files'), outsider);
        assert.equal(tenantReply.status, 200);
        assert.deepEqual(tenantReply.body.map(row => row.id), [foreign], 'same-tenant membership remains available');
    });
});
