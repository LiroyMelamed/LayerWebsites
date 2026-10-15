const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');

test('client native browser entry uses its own route without opening office manage access',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 60000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    const [lawyer, client, other, outsider, foreignLawyer] = f.users;
    const fileIds = [], caseIds = [], tenantIds = [];
    // Successful issuance writes append-only audit evidence. Keep this run's
    // isolated synthetic fixtures intact instead of disabling audit protection.
    t.after(async () => { await f.pool.end(); });
    const makeCase = async (tenantId = null) => {
        const { rows } = await f.pool.query('INSERT INTO cases(casename,userid,law_firm_tenant_id) VALUES($1,$2,$3) RETURNING caseid', ['Synthetic entry case', client.userid, tenantId]);
        const id = rows[0].caseid; caseIds.push(id);
        await f.pool.query('INSERT INTO case_users(caseid,userid) VALUES($1,$2)', [id, client.userid]);
        return id;
    };
    const ownCase = await makeCase();
    const makeFile = async ({ owner = client.userid, lawyerId = lawyer.userid, caseId = ownCase,
        status = 'pending', order = 'parallel', expired = false, spots = [{}] } = {}) => {
        const { rows } = await f.pool.query(`INSERT INTO signingfiles
            (caseid,lawyerid,clientid,filename,filekey,status,signingorder,expiresat,requireotp,signingpolicyversion,presentedpdfsha256)
            VALUES($1,$2,$3,'Synthetic entry.pdf',$4,$5,$6,$7,true,'2026-01-11',$8) RETURNING signingfileid`,
        [caseId, lawyerId, owner, f.key, status, order, new Date(Date.now() + (expired ? -3600000 : 3600000)), 'a'.repeat(64)]);
        const id = rows[0].signingfileid; fileIds.push(id); const spotIds = [];
        for (const spot of spots) {
            const inserted = await f.pool.query(`INSERT INTO signaturespots
                (signingfileid,pagenumber,x,y,width,height,signeruserid,signerindex,fieldtype,isrequired,issigned,signedat)
                VALUES($1,1,10,10,120,40,$2,$3,$4,$5,$6,$7) RETURNING signaturespotid`,
            [id, spot.owner === undefined ? client.userid : spot.owner, spot.index ?? 0, spot.type || 'signature', spot.required !== false,
                Boolean(spot.signed), spot.signed ? new Date() : null]);
            spotIds.push(inserted.rows[0].signaturespotid);
        }
        return { id, spotIds };
    };
    const ready = await makeFile();
    const token = (user, role = user.role) => jwt.sign({ userid: user.userid, role }, process.env.JWT_SECRET);
    const as = (call, user = client, role) => call.set('Authorization', `Bearer ${token(user, role)}`);
    const entry = (file, user = client, body = {}) => as(request(f.app).post(`/api/SigningFiles/${file.id}/client-public-link`), user).send(body);

    const office = await as(request(f.app).post(`/api/SigningFiles/${ready.id}/public-link`)).send({});
    assert.equal(office.status, 403, 'customer must remain blocked from office manage route');
    const response = await entry(ready);
    assert.equal(response.status, 200, response.body.errorCode || 'ready client browser entry should exist');
    assert.equal(response.headers['cache-control'], 'private, no-store');
    const claims = jwt.verify(response.body.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    assert.equal(claims.typ, 'signing_public');
    assert.equal(Number(claims.signingFileId), ready.id);
    assert.equal(Number(claims.signerUserId), client.userid);
    assert.equal(f.deliveries.length, 0);
    assert.equal(f.otp.length, 0);

    await t.test('office issuer still requires manage permission and remains available to the document manager', async () => {
        const denied = await as(request(f.app).post(`/api/SigningFiles/${ready.id}/public-link`)).send({ signerUserId: client.userid });
        assert.equal(denied.status, 403);
        const allowed = await as(request(f.app).post(`/api/SigningFiles/${ready.id}/public-link`), lawyer).send({ signerUserId: client.userid });
        assert.equal(allowed.status, 200, allowed.body.errorCode);
        assert.equal((await entry(ready, lawyer)).status, 403, 'manager cannot impersonate a customer through self entry');
    });
    await t.test('secondary assigned signer receives a self-only token without case membership granting document authority', async () => {
        const secondary = await makeFile({ owner: other.userid });
        const result = await entry(secondary);
        assert.equal(result.status, 200, result.body.errorCode);
        const scoped = jwt.verify(result.body.token, process.env.JWT_SECRET);
        assert.equal(Number(scoped.signerUserId), client.userid);
        assert.equal(Number(scoped.signingFileId), secondary.id);
        await f.pool.query('INSERT INTO case_users(caseid,userid) VALUES($1,$2)', [ownCase, outsider.userid]);
        assert.equal((await entry(ready, outsider)).status, 404, 'case membership is not signature assignment');
    });
    await t.test('public browser details include only the primary client legacy unassigned spots', async () => {
        const legacy = await makeFile({ spots: [{ owner: null }, { owner: other.userid, index: 1 }] });
        const ownEntry = await entry(legacy);
        assert.equal(ownEntry.status, 200, ownEntry.body.errorCode);
        const ownDetails = await request(f.app).get(`/api/SigningFiles/public/${ownEntry.body.token}`);
        assert.equal(ownDetails.status, 200, ownDetails.body.errorCode);
        assert.deepEqual(ownDetails.body.signatureSpots.map(s => s.SignatureSpotId), [legacy.spotIds[0]]);
        assert.equal(ownDetails.body.signatureSpots[0].CanSign, true);
        assert.equal(ownDetails.body.signatureSpots[0].IsMine, true);
        const secondaryEntry = await entry(legacy, other);
        assert.equal(secondaryEntry.status, 200, secondaryEntry.body.errorCode);
        const secondaryDetails = await request(f.app).get(`/api/SigningFiles/public/${secondaryEntry.body.token}`);
        assert.equal(secondaryDetails.status, 200);
        assert.deepEqual(secondaryDetails.body.signatureSpots.map(s => s.SignatureSpotId), [legacy.spotIds[1]]);
        assert.equal(secondaryDetails.body.signatureSpots[0].CanSign, true);
        const signingBody = { signatureSpotIds: [legacy.spotIds[0]], signatureImage: 'data:image/png;base64,c3ludGhldGlj', signingSessionId: randomUUID() };
        const notMine = await request(f.app).post(`/api/SigningFiles/public/${secondaryEntry.body.token}/sign-batch`).send(signingBody);
        assert.equal(notMine.status, 403);
        assert.equal(notMine.body.errorCode, 'FORBIDDEN');
        const ownConsent = await request(f.app).post(`/api/SigningFiles/public/${ownEntry.body.token}/sign-batch`).send(signingBody);
        assert.equal(ownConsent.body.errorCode, 'CONSENT_REQUIRED', 'legacy owner reaches the same consent gate');
        await f.pool.query("UPDATE signingfiles SET signingorder='sequential' WHERE signingfileid=$1", [legacy.id]);
        await f.pool.query('UPDATE signaturespots SET signerindex=2 WHERE signaturespotid=$1', [legacy.spotIds[0]]);
        const later = await request(f.app).get(`/api/SigningFiles/public/${ownEntry.body.token}`);
        assert.equal(later.body.isMyTurn, false);
        await f.pool.query('UPDATE signaturespots SET issigned=true,signedat=now() WHERE signingfileid=$1', [legacy.id]);
        const complete = await request(f.app).get(`/api/SigningFiles/public/${ownEntry.body.token}`);
        assert.equal(complete.body.signerCompleted, true);
        assert.equal(complete.body.readOnly, true);
        assert.equal(complete.body.file.RequireOtp, false);
    });
    await t.test('recipient ids, policy overrides and query overrides are rejected rather than used', async () => {
        for (const payload of [{ signerUserId: other.userid }, { clientId: other.userid }, { requireOtp: false }, { clientSelfSigningLink: true }, []]) {
            assert.equal((await entry(ready, client, payload)).status, 422);
        }
        const query = await as(request(f.app).post(`/api/SigningFiles/${ready.id}/client-public-link?signerUserId=${other.userid}`)).send({});
        assert.equal(query.status, 422);
        assert.equal((await as(request(f.app).post('/api/SigningFiles/not-a-number/client-public-link')).send({})).status, 422);
        assert.equal((await request(f.app).post(`/api/SigningFiles/${ready.id}/client-public-link`).send({})).status, 401);
    });
    await t.test('current database role is authoritative and supports both customer enums', async () => {
        await f.pool.query("UPDATE users SET role='User' WHERE userid=$1", [client.userid]);
        assert.equal((await entry(ready)).status, 200, 'old Client JWT follows current User database identity');
        await f.pool.query("UPDATE users SET role='Lawyer' WHERE userid=$1", [client.userid]);
        assert.equal((await entry(ready)).status, 401, 'stale customer JWT does not retain customer access');
        await f.pool.query("UPDATE users SET role='Client' WHERE userid=$1", [client.userid]);
        await f.pool.query("UPDATE users SET role='ExternalSigner' WHERE userid=$1", [outsider.userid]);
        const assignedExternal = await makeFile({ owner: outsider.userid, spots: [{ owner: outsider.userid }] });
        assert.equal((await entry(assignedExternal, outsider)).status, 403);
        await f.pool.query("UPDATE users SET role='Client' WHERE userid=$1", [outsider.userid]);
    });
    await t.test('foreign lawyer and foreign case tenant boundaries stay hidden despite exact assignment', async () => {
        const tenantId = randomUUID(); tenantIds.push(tenantId);
        await f.pool.query('INSERT INTO law_firm_tenants(id,slug,name) VALUES($1,$2,$3)', [tenantId, `entry-${randomUUID()}`, 'Synthetic foreign firm']);
        await f.pool.query('UPDATE users SET law_firm_tenant_id=$1 WHERE userid=$2', [tenantId, foreignLawyer.userid]);
        const foreignOwner = await makeFile({ lawyerId: foreignLawyer.userid });
        const foreignCase = await makeFile({ caseId: await makeCase(tenantId) });
        assert.equal((await entry(foreignOwner)).status, 404);
        assert.equal((await entry(foreignCase)).status, 404);
        assert.equal((await entry({ id: 2147483647 })).status, 404);
    });
    await t.test('draft, rejected, expired, globally complete and personally complete documents cannot mint an entry', async () => {
        for (const [options, expected] of [
            [{ status: 'draft' }, 404], [{ status: 'rejected' }, 409], [{ expired: true }, 410],
            [{ status: 'signed' }, 409], [{ spots: [{ signed: true }] }, 409],
            [{ spots: [{ required: false }] }, 409], [{ spots: [{ type: 'lawyerstamp' }] }, 409],
        ]) {
            const file = await makeFile(options);
            const result = await entry(file);
            assert.equal(result.status, expected, JSON.stringify({ options, error: result.body.errorCode }));
            assert.equal(result.body.token, undefined);
        }
    });
    await t.test('later sequential signer remains blocked until the previous required signer finishes', async () => {
        const sequential = await makeFile({ owner: other.userid, order: 'sequential', spots: [
            { owner: other.userid, index: 0 }, { owner: client.userid, index: 1 },
        ] });
        const waiting = await entry(sequential);
        assert.equal(waiting.status, 403);
        assert.equal(waiting.body.errorCode, 'SIGNING_NOT_YOUR_TURN');
        await f.pool.query('UPDATE signaturespots SET issigned=true,signedat=now() WHERE signaturespotid=$1', [sequential.spotIds[0]]);
        const nowReady = await entry(sequential);
        assert.equal(nowReady.status, 200, nowReady.body.errorCode);
        assert.equal(Number(jwt.verify(nowReady.body.token, process.env.JWT_SECRET).signerUserId), client.userid);
    });
    await t.test('current assignment and platform signing enablement are rechecked at each explicit entry', async () => {
        const changed = await makeFile({ owner: other.userid });
        assert.equal((await entry(changed)).status, 200);
        await f.pool.query('UPDATE signaturespots SET signeruserid=$1 WHERE signingfileid=$2', [other.userid, changed.id]);
        assert.equal((await entry(changed)).status, 404);
        const oldFlag = process.env.SIGNING_ENABLED;
        try {
            process.env.SIGNING_ENABLED = 'false';
            const disabled = await entry(ready);
            assert.equal(disabled.status, 403);
            assert.equal(disabled.body.errorCode, 'SIGNING_DISABLED');
        } finally { process.env.SIGNING_ENABLED = oldFlag; }
    });
    await t.test('a former office owner with a customer identity still receives only their own signer token', async () => {
        const previousOwner = await makeFile({ owner: other.userid, lawyerId: client.userid });
        const result = await entry(previousOwner);
        assert.equal(result.status, 200, result.body.errorCode);
        assert.equal(Number(jwt.verify(result.body.token, process.env.JWT_SECRET).signerUserId), client.userid);
        const audit = await f.pool.query("SELECT actor_type,metadata FROM audit_events WHERE signingfileid=$1 AND event_type='PUBLIC_LINK_ISSUED' ORDER BY occurred_at_utc DESC LIMIT 1", [previousOwner.id]);
        assert.equal(audit.rows[0].actor_type, 'client');
        assert.equal(Number(audit.rows[0].metadata.targetSignerUserId), client.userid);
    });
    await t.test('issuing a link neither accepts consent nor verifies OTP and cannot sign without them', async () => {
        const body = { signatureSpotIds: ready.spotIds, signatureImage: 'data:image/png;base64,c3ludGhldGlj', signingSessionId: randomUUID(), consentVersion: '2026-01-11' };
        const withoutConsent = await request(f.app).post(`/api/SigningFiles/public/${response.body.token}/sign-batch`).send(body);
        assert.equal(withoutConsent.status, 403);
        assert.equal(withoutConsent.body.errorCode, 'CONSENT_REQUIRED');
        const withoutOtp = await request(f.app).post(`/api/SigningFiles/public/${response.body.token}/sign-batch`).send({ ...body, consentAccepted: true });
        assert.equal(withoutOtp.status, 403);
        assert.equal(withoutOtp.body.errorCode, 'OTP_REQUIRED');
        for (const table of ['signing_consents', 'signing_otp_challenges']) {
            const count = await f.pool.query(`SELECT count(*) FROM ${table} WHERE signingfileid = ANY($1::int[])`, [fileIds]);
            assert.equal(Number(count.rows[0].count), 0);
        }
        const spot = await f.pool.query('SELECT issigned FROM signaturespots WHERE signaturespotid=$1', [ready.spotIds[0]]);
        assert.equal(spot.rows[0].issigned, false);
        assert.equal(f.deliveries.length, 0);
        assert.equal(f.otp.length, 0);
    });
});
