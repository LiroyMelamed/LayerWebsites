const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
// Execute the production URL/persistence functions with an isolated fake DB.
const source = fs.readFileSync(path.join(__dirname, '../controllers/signingFileController.js'), 'utf8').replace(/\r\n/g, '\n');
const block = source.slice(source.indexOf('function getWebsiteDomain()'), source.indexOf('/**\n * iMessage'));
function runtime(query, domain = 'client.example.invalid') {
  const scope = { process: { env: { WEBSITE_DOMAIN: domain } }, WEBSITE_DOMAIN: '', crypto,
    jwt: { decode: () => ({ exp: 2000000000 }) }, pool: { query }, console: { warn() {} } };
  vm.runInNewContext(block, scope);
  return scope;
}
test('new links bypass installed app path filters and retain token and expiry in the same store', async () => {
  const calls = []; const r = runtime(async (...args) => calls.push(args));
  const url = await r.buildPublicSigningUrl('synthetic-token');
  assert.match(url, /^https:\/\/client\.example\.invalid\/ViewSignedDocument\/Link\/[A-Za-z0-9_-]{8}$/);
  assert.equal(calls.length, 1); assert.equal(calls[0][1][1], 'synthetic-token');
  assert.equal(calls[0][1][2].getTime(), 2000000000000);
  assert.ok(calls[0][0].includes('INSERT INTO signing_short_links'));
});
test('DB failure falls back to browser-only long route with exact encoded token', async () => {
  const r = runtime(async () => { throw new Error('fake database failure'); });
  const url = new URL(await r.buildPublicSigningUrl('synthetic+a/b=?'));
  assert.equal(url.pathname, '/ViewSignedDocument/Signing');
  assert.equal(url.searchParams.get('token'), 'synthetic+a/b=?');
});
test('slug collisions stay bounded and use a safe long fallback', async () => {
  let calls = 0; const r = runtime(async () => { calls++; throw { code: '23505' }; });
  assert.match(await r.buildPublicSigningUrl('synthetic'), /\/ViewSignedDocument\/Signing\?token=synthetic$/);
  assert.equal(calls, 5);
});
test('signed-copy tokens share browser-only short route; absent domain performs no DB writes', async () => {
  const r = runtime(async () => {});
  assert.match(await r.persistSigningShortLink('view-only', 'https://client.example.invalid/ViewSignedDocument?token=view-only'), /\/ViewSignedDocument\/Link\//);
  let writes = 0; const absent = runtime(async () => { writes++; }, '');
  assert.equal(await absent.buildPublicSigningUrl('synthetic'), null); assert.equal(writes, 0);
});
