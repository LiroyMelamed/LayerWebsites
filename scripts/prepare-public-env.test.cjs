'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const tenants = ['morlevy', 'ashrafessa', 'melamedlaw', 'melamedia', 'idm', 'lawyer'];

function fixture(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-public-env-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'frontend'));
  fs.copyFileSync(path.join(__dirname, 'prepare-public-env.cjs'), path.join(root, 'scripts', 'prepare-public-env.cjs'));
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(root, 'frontend', name), value);
  return {
    run: (...args) => spawnSync(process.execPath, [path.join(root, 'scripts', 'prepare-public-env.cjs'), ...args], { encoding: 'utf8' }),
    read: name => fs.readFileSync(path.join(root, 'frontend', name), 'utf8'),
    exists: name => fs.existsSync(path.join(root, 'frontend', name)),
  };
}

test('generic startup preserves the existing local configuration byte for byte', t => {
  const f = fixture(t, { '.env': 'SYNTHETIC_LOCAL=existing\r\n', '.env.example': 'SYNTHETIC_LOCAL=example\n' });
  assert.equal(f.run().status, 0);
  assert.equal(f.read('.env'), 'SYNTHETIC_LOCAL=existing\r\n');
});
test('generic startup supports an explicitly provisioned local example', t => {
  const f = fixture(t, { '.env.example': 'SYNTHETIC_LOCAL=example\n' });
  assert.equal(f.run().status, 0);
  assert.equal(f.read('.env'), 'SYNTHETIC_LOCAL=example\n');
});
test('missing generic configuration stops with actionable guidance', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Provision frontend\/\.env locally/);
  assert.equal(f.exists('.env'), false);
});
for (const tenant of tenants) {
  test(`${tenant}: selected local variant wins over examples and generic env`, t => {
    const file = `.env.production.${tenant}`;
    const f = fixture(t, { [file]: `SYNTHETIC_TENANT=${tenant}\n`, [`${file}.example`]: 'SYNTHETIC_TENANT=example\n', '.env': 'SYNTHETIC_TENANT=other\n' });
    const result = f.run(tenant);
    assert.equal(result.status, 0);
    assert.equal(f.read('.env'), `SYNTHETIC_TENANT=${tenant}\n`);
    assert.equal(f.read(file), `SYNTHETIC_TENANT=${tenant}\n`);
    assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_TENANT/);
  });
  test(`${tenant}: locally provided example remains supported`, t => {
    const f = fixture(t, { [`.env.production.${tenant}.example`]: `SYNTHETIC_TENANT=${tenant}\n` });
    assert.equal(f.run(tenant).status, 0);
    assert.equal(f.read('.env'), `SYNTHETIC_TENANT=${tenant}\n`);
  });
  test(`${tenant}: missing variant never reuses a different tenant or generic env`, t => {
    const other = tenants.find(x => x !== tenant);
    const f = fixture(t, { '.env': 'SYNTHETIC_TENANT=keep\n', '.env.example': 'SYNTHETIC_TENANT=generic\n', [`.env.production.${other}`]: `SYNTHETIC_TENANT=${other}\n` });
    const result = f.run(tenant);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`Provision frontend/.env.production.${tenant} locally`));
    assert.equal(f.read('.env'), 'SYNTHETIC_TENANT=keep\n');
  });
  test(`${tenant}: clean checkout fails before creating an empty destination`, t => {
    const f = fixture(t);
    assert.equal(f.run(tenant).status, 1);
    assert.equal(f.exists('.env'), false);
  });
}
for (const tenant of ['unknown', '../morlevy']) {
  test(`reject unsupported tenant ${tenant}`, t => {
    const f = fixture(t, { '.env': 'SYNTHETIC_LOCAL=keep\n' });
    const result = f.run(tenant);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown tenant/);
    assert.equal(f.read('.env'), 'SYNTHETIC_LOCAL=keep\n');
  });
}
test('frontend scripts prepare local configuration before startup and every build', () => {
  const { scripts } = require('../frontend/package.json');
  for (const command of ['prestart', 'prebuild']) {
    assert.ok(scripts[command].startsWith('node ../scripts/prepare-public-env.cjs && '));
  }
  for (const tenant of tenants) {
    assert.equal(scripts[`build:${tenant}`], `node ../scripts/prepare-public-env.cjs ${tenant} && craco build`);
  }
});
