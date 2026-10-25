const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '../..');

function isolatedRun(script, args) {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-tenant-'));
    try {
        const bin = path.join(fixture, 'bin');
        const calls = path.join(fixture, 'unexpected-calls');
        fs.mkdirSync(bin);
        for (const command of ['git', 'ssh', 'scp', 'npm', 'rsync', 'node', 'certbot']) {
            fs.writeFileSync(path.join(bin, command), '#!/bin/sh\nprintf "%s\\n" "$0 $*" >> "$RETIREMENT_TEST_CALLS"\nexit 91\n', { mode: 0o755 });
        }
        fs.writeFileSync(path.join(bin, 'date'), '#!/bin/sh\nprintf "%s\\n" "2026-10-25T00:00:00Z"\n', { mode: 0o755 });
        const result = spawnSync('bash', [path.join(repo, script), ...args], {
            cwd: repo,
            encoding: 'utf8',
            env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RETIREMENT_TEST_CALLS: calls },
            timeout: 5000,
        });
        return { ...result, externalCalls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '' };
    } finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
}

for (const [script, args] of [
    ['scripts/deploy-tenant-backend.sh', ['idm', 'a'.repeat(40)]],
    ['scripts/deploy-tenant-frontend.sh', ['idm']],
    ['scripts/finalize-idm-dns.sh', []],
    ['scripts/propagate-main-to-tenants.sh', ['idm']],
]) {
    test(`${script} rejects Idm before build, Git, network or provider commands`, () => {
        const result = isolatedRun(script, args);
        assert.equal(result.status, 64, result.stdout + result.stderr);
        assert.match(result.stderr, /Idm retirement.*2026-10-25/);
        assert.equal(result.externalCalls, '');
    });
}

test('all-tenant frontend dry plan contains active tenants only and makes no external calls', () => {
    const result = isolatedRun('scripts/deploy-all-tenants-prod.sh', ['--frontend', '--dry-run']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const tenant of ['morlevy', 'ashrafessa', 'melamedia']) {
        assert.match(result.stdout, new RegExp(`deploy-tenant-frontend\\.sh ${tenant}`));
    }
    assert.doesNotMatch(result.stdout, /\bidm\b/i);
    assert.equal(result.externalCalls, '');
});

test('retirement guard preserves other active tenant choices and rejects Idm aliases', () => {
    const helper = path.join(repo, 'scripts/lib/tenant-retirement.sh');
    for (const tenant of ['melamedlaw', 'morlevy', 'ashrafessa', 'melamedia', 'lawyer', 'Idm', 'IDM']) {
        const result = spawnSync('bash', ['-c', 'source "$1"; require_active_tenant "$2"', 'fixture', helper, tenant], { encoding: 'utf8', timeout: 2000 });
        assert.equal(result.status, /^idm$/i.test(tenant) ? 64 : 0, result.stderr);
    }
});
