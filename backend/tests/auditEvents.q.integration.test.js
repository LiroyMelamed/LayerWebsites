const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { randomUUID } = require('node:crypto');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.TRUST_PROXY = process.env.TRUST_PROXY || 'false';
process.env.IS_PRODUCTION = process.env.IS_PRODUCTION || 'false';

const { resetStore } = require('../utils/rateLimiter');
const pool = require('../config/db');

function makeToken({ userid = 1, role = 'Admin' } = {}) {
  return jwt.sign({ userid, role, phoneNumber: '0000000000' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

async function getAnyCaseTypeIdOrNull() {
  try {
    const res = await pool.query('select casetypeid from casetypes order by casetypeid asc limit 1');
    const id = res.rows?.[0]?.casetypeid;
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

async function ensureCaseTypeId() {
  const existing = await getAnyCaseTypeIdOrNull();
  if (existing !== null) return existing;

  const name = `Test CaseType ${randomUUID()}`;
  const res = await pool.query(
    `insert into casetypes (casetypename, numberofstages)
     values ($1, $2)
     returning casetypeid`,
    [name, 1]
  );
  return Number(res.rows[0].casetypeid);
}

async function insertUser({ name, email, phone, role }) {
  const res = await pool.query(
    `insert into users (name, email, phonenumber, passwordhash, role, companyname, createdat)
     values ($1, $2, $3, $4, $5, $6, now())
     returning userid`,
    [name, email, phone, null, role, null]
  );
  return Number(res.rows[0].userid);
}

async function insertCase({ caseName, caseTypeId, userId }) {
  const res = await pool.query(
    `insert into cases (
        casename, casetypeid, userid, companyname, currentstage,
        isclosed, istagged, whatsappgrouplink, createdat, updatedat,
        casemanager, casemanagerid, estimatedcompletiondate, licenseexpirydate
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now(),$9,$10,$11,$12)
     returning caseid`,
    [
      caseName,
      caseTypeId,
      userId,
      'TestCo',
      1,
      false,
      false,
      null,
      null,
      null,
      null,
      null,
    ]
  );
  return Number(res.rows[0].caseid);
}

async function insertSigningFile({ caseId, lawyerId, clientId, filename }) {
  const fileKey = `file_${randomUUID()}`;
  const originalFileKey = `orig_${randomUUID()}`;
  const res = await pool.query(
    `insert into signingfiles (caseid, lawyerid, clientid, filename, filekey, originalfilekey, status, createdat)
     values ($1,$2,$3,$4,$5,$6,$7,now())
     returning signingfileid`,
    [caseId, lawyerId, clientId, filename, fileKey, originalFileKey, 'pending']
  );
  return Number(res.rows[0].signingfileid);
}

async function insertAuditEvent({ eventType, signingFileId, actorUserId, actorType, userAgent, metadata, success = true }) {
  const eventid = randomUUID();
  await pool.query(
    `insert into audit_events (
        eventid, occurred_at_utc, event_type,
        signingfileid, actor_userid, actor_type,
        ip, user_agent, request_id,
        success, metadata
     ) values ($1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      eventid,
      eventType,
      signingFileId,
      actorUserId,
      actorType,
      '127.0.0.1',
      userAgent,
      randomUUID(),
      success,
      metadata || {},
    ]
  );
  return eventid;
}

const created = {
  userIds: [],
  caseIds: [],
  signingFileIds: [],
};

test('q search matches case/client/document fields (admin)', async () => {
  resetStore();
  delete require.cache[require.resolve('../app')];
  const app = require('../app');

  const runTag = `auditq_${randomUUID()}`;
  const caseTypeId = await ensureCaseTypeId();

  const lawyerId = await insertUser({
    name: `Test Lawyer ${runTag}`,
    email: `lawyer_${runTag}@example.com`,
    phone: `050000${String(Date.now()).slice(-4)}`,
    role: 'Lawyer',
  });
  const clientId = await insertUser({
    name: `Test Client ${runTag}`,
    email: `client_${runTag}@example.com`,
    phone: `052000${String(Date.now()).slice(-4)}`,
    role: 'User',
  });
  created.userIds.push(lawyerId, clientId);

  const caseName = `Case Alpha ${runTag}`;
  const caseId = await insertCase({ caseName, caseTypeId, userId: clientId });
  created.caseIds.push(caseId);

  const filename = `contract_${runTag}.pdf`;
  const signingFileId = await insertSigningFile({ caseId, lawyerId, clientId, filename });
  created.signingFileIds.push(signingFileId);

  const ev1 = await insertAuditEvent({
    eventType: 'PDF_VIEWED',
    signingFileId,
    actorUserId: lawyerId,
    actorType: 'LAWYER',
    userAgent: 'Mozilla/5.0 TestUA',
    metadata: { note: 'alpha' },
    success: true,
  });

  const res = await request(app)
    .get(`/api/audit-events?q=${encodeURIComponent('contract_' + runTag)}&limit=50`)
    .set('Authorization', `Bearer ${makeToken({ userid: 9999, role: 'Admin' })}`);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length >= 1);

  const found = res.body.items.find((x) => x.id === ev1);
  assert.ok(found, 'expected inserted event to be returned');

  assert.equal(found.caseId, caseId);
  assert.equal(found.signingFileId, signingFileId);
  assert.equal(found.eventType, 'PDF_VIEWED');

  // Enriched fields must be present (may be null in other rows).
  assert.equal(found.caseName, caseName);
  assert.equal(found.documentFilename, filename);
  assert.equal(found.clientName, `Test Client ${runTag}`);
});

test('lawyer scoping still enforced with q', async () => {
  resetStore();
  delete require.cache[require.resolve('../app')];
  const app = require('../app');

  const runTag = `auditq_${randomUUID()}`;
  const caseTypeId = await ensureCaseTypeId();

  const lawyer1Id = await insertUser({
    name: `Lawyer1 ${runTag}`,
    email: `lawyer1_${runTag}@example.com`,
    phone: `050111${String(Date.now()).slice(-4)}`,
    role: 'Lawyer',
  });
  const lawyer2Id = await insertUser({
    name: `Lawyer2 ${runTag}`,
    email: `lawyer2_${runTag}@example.com`,
    phone: `050222${String(Date.now()).slice(-4)}`,
    role: 'Lawyer',
  });
  const clientId = await insertUser({
    name: `Client ${runTag}`,
    email: `client2_${runTag}@example.com`,
    phone: `052333${String(Date.now()).slice(-4)}`,
    role: 'User',
  });
  created.userIds.push(lawyer1Id, lawyer2Id, clientId);

  const case1Id = await insertCase({ caseName: `Case1 ${runTag}`, caseTypeId, userId: clientId });
  const case2Id = await insertCase({ caseName: `Case2 ${runTag}`, caseTypeId, userId: clientId });
  created.caseIds.push(case1Id, case2Id);

  const signingFile1Id = await insertSigningFile({ caseId: case1Id, lawyerId: lawyer1Id, clientId, filename: `doc_${runTag}_1.pdf` });
  const signingFile2Id = await insertSigningFile({ caseId: case2Id, lawyerId: lawyer2Id, clientId, filename: `doc_${runTag}_2.pdf` });
  created.signingFileIds.push(signingFile1Id, signingFile2Id);

  const visibleEventId = await insertAuditEvent({
    eventType: 'PDF_VIEWED',
    signingFileId: signingFile1Id,
    actorUserId: lawyer1Id,
    actorType: 'LAWYER',
    userAgent: 'UA1',
    metadata: { note: 'visible' },
  });

  const hiddenEventId = await insertAuditEvent({
    eventType: 'PDF_VIEWED',
    signingFileId: signingFile2Id,
    actorUserId: lawyer2Id,
    actorType: 'LAWYER',
    userAgent: 'UA2',
    metadata: { note: 'hidden' },
  });

  const res = await request(app)
    .get(`/api/audit-events?q=${encodeURIComponent(runTag)}&limit=100`)
    .set('Authorization', `Bearer ${makeToken({ userid: lawyer1Id, role: 'Lawyer' })}`);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));

  const ids = res.body.items.map((x) => x.id);
  assert.ok(ids.includes(visibleEventId), 'expected own event to be visible');
  assert.ok(!ids.includes(hiddenEventId), 'expected other lawyer event to be hidden');
});
