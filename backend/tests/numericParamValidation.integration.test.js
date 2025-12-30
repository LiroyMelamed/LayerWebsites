const test = require('node:test');
const assert = require('node:assert/strict');

// Ensure tests are not flaky due to low rate limits.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.RATE_LIMIT_IP_WINDOW_MS = process.env.RATE_LIMIT_IP_WINDOW_MS || String(60 * 1000);
process.env.RATE_LIMIT_IP_MAX = process.env.RATE_LIMIT_IP_MAX || '100000';
process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS = process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS || String(60 * 1000);
process.env.RATE_LIMIT_AUTH_IP_MAX = process.env.RATE_LIMIT_AUTH_IP_MAX || '100000';
process.env.RATE_LIMIT_USER_WINDOW_MS = process.env.RATE_LIMIT_USER_WINDOW_MS || String(60 * 1000);
process.env.RATE_LIMIT_USER_MAX = process.env.RATE_LIMIT_USER_MAX || '100000';
process.env.TRUST_PROXY = process.env.TRUST_PROXY || 'false';
process.env.IS_PRODUCTION = process.env.IS_PRODUCTION || 'false';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { resetStore } = require('../utils/rateLimiter');

function makeToken({ userid = 1, role = 'Admin' } = {}) {
  return jwt.sign({ userid, role, phoneNumber: '0000000000' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

function expect400Json(res) {
  assert.equal(res.status, 400);
  assert.equal(typeof res.body, 'object');
  assert.equal(typeof res.body.message, 'string');
  assert.ok(res.body.message.length > 0);
}

test('invalid caseId param returns 400', async () => {
  resetStore();
  const app = require('../app');

  const res = await request(app)
    .get('/api/Cases/GetCase/not-a-number')
    .set('Authorization', `Bearer ${makeToken({ role: 'User' })}`);

  expect400Json(res);
});

test('invalid CaseId alias param returns 400', async () => {
  resetStore();
  const app = require('../app');

  const res = await request(app)
    .put('/api/Cases/TagCase/NaN')
    .send({ Tag: true })
    .set('Authorization', `Bearer ${makeToken({ role: 'Admin' })}`);

  expect400Json(res);
});

test('invalid caseTypeId param returns 400', async () => {
  resetStore();
  const app = require('../app');

  const res = await request(app)
    .get('/api/CaseTypes/GetCaseType/abc')
    .set('Authorization', `Bearer ${makeToken({ role: 'User' })}`);

  expect400Json(res);
});

test('invalid customerId param returns 400', async () => {
  resetStore();
  const app = require('../app');

  const res = await request(app)
    .put('/api/Customers/UpdateCustomer/0')
    .send({})
    .set('Authorization', `Bearer ${makeToken({ role: 'Admin' })}`);

  expect400Json(res);
});

test('invalid userId param returns 400', async () => {
  resetStore();
  const app = require('../app');

  const res = await request(app)
    .delete('/api/Customers/DeleteCustomer/zzz')
    .set('Authorization', `Bearer ${makeToken({ role: 'Admin' })}`);

  expect400Json(res);
});

test('invalid notifications pagination returns 400', async () => {
  resetStore();
  const app = require('../app');

  const res = await request(app)
    .get('/api/Notifications?limit=abc')
    .set('Authorization', `Bearer ${makeToken({ role: 'User' })}`);

  expect400Json(res);
});

test('invalid notification id param returns 400', async () => {
  resetStore();
  const app = require('../app');

  const res = await request(app)
    .put('/api/Notifications/not-an-int/read')
    .set('Authorization', `Bearer ${makeToken({ role: 'User' })}`);

  expect400Json(res);
});

test('invalid signingFileId param returns 400', async () => {
  resetStore();
  const app = require('../app');

  const res = await request(app)
    .get('/api/SigningFiles/not-a-number')
    .set('Authorization', `Bearer ${makeToken({ role: 'User' })}`);

  expect400Json(res);
});
