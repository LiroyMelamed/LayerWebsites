const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '../deploy-all-tenants-prod.sh');
const tenants = ['melamedlaw', 'morlevy', 'ashrafessa', 'melamedia'];
const plan = Object.fromEntries(tenants.map((tenant, index) => [tenant, String(index + 1).repeat(40)]));

// Execute the real wrapper in an isolated fixture. Every deployment, notification,
// release check and network executable is replaced; no server or real Git is used.
function runDeployment(args, { candidates = plan, rejectGuard } = {}) {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'active-tenant-deployment-'));
    try {
        const root = path.join(fixture, 'app');
        const scripts = path.join(root, 'scripts');
        const bin = path.join(fixture, 'bin');
        fs.mkdirSync(path.join(scripts, 'lib'), { recursive: true });
        fs.mkdirSync(path.join(root, 'frontend'));
        fs.mkdirSync(path.join(fixture, 'scripts'));
        fs.mkdirSync(bin);
        fs.copyFileSync(script, path.join(scripts, 'deploy-all-tenants-prod.sh'));
        fs.writeFileSync(path.join(root, 'frontend/.env.ftp.local'), '# Fixture; no credentials\n');
        fs.writeFileSync(path.join(fixture, 'plan.json'), JSON.stringify(candidates));
        fs.writeFileSync(path.join(scripts, 'lib/deploy-ssh-retry.sh'), 'pause_between_frontend_deploys() { :; }\n');
        fs.writeFileSync(path.join(fixture, 'scripts/deploy-notify.sh'), 'notify_central_deploy() { :; }\n');
        fs.writeFileSync(path.join(scripts, 'check-signing-release.cjs'), `
const fs = require('node:fs');
fs.appendFileSync(process.env.TENANT_DEPLOY_TEST_LOG, 'guard ' + process.argv[2] + '\\n');
if (process.argv[2] === process.env.TENANT_DEPLOY_TEST_REJECT) process.exit(42);
`);
        for (const name of ['deploy-tenant-backend.sh', 'deploy-tenant-frontend.sh', 'deploy-tenant-frontend-melamedlaw.sh']) {
            fs.writeFileSync(path.join(scripts, name), `#!/usr/bin/env bash
printf '%s %s\\n' '${name}' "$*" >> "$TENANT_DEPLOY_TEST_LOG"
`, { mode: 0o755 });
        }
        fs.symlinkSync(process.execPath, path.join(bin, 'node'));
        for (const name of ['git', 'ssh', 'rsync', 'sftp', 'ftp', 'curl', 'wget']) {
            fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash
printf '%s\\n' 'FORBIDDEN_NETWORK ${name}' >> "$TENANT_DEPLOY_TEST_LOG"
exit 97
`, { mode: 0o755 });
        }
        const log = path.join(fixture, 'calls');
        const result = spawnSync('bash', [path.join(scripts, 'deploy-all-tenants-prod.sh'), ...args], {
            encoding: 'utf8',
            env: {
                PATH: `${bin}:/usr/bin:/bin`,
                SIGNING_RELEASE_PLAN: path.join(fixture, 'plan.json'),
                TENANT_DEPLOY_TEST_LOG: log,
                TENANT_DEPLOY_TEST_REJECT: rejectGuard || '',
            },
        });
        const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
        assert.equal(calls.some((line) => line.startsWith('FORBIDDEN_NETWORK')), false, calls.join('\n'));
        return { ...result, calls };
    } finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
}

test('default all-target wrapper checks exact commits and deploys only the four active targets', () => {
    const result = runDeployment([]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(result.calls.slice(0, 4), tenants.map((tenant) => `guard ${plan[tenant]}`));
    assert.deepEqual(result.calls.filter((line) => line.startsWith('deploy-tenant-backend.sh ')),
        tenants.map((tenant) => `deploy-tenant-backend.sh ${tenant} ${plan[tenant]}`));
    assert.deepEqual(result.calls.filter((line) => line.startsWith('deploy-tenant-frontend')), [
        'deploy-tenant-frontend-melamedlaw.sh ',
        'deploy-tenant-frontend.sh morlevy',
        'deploy-tenant-frontend.sh ashrafessa',
        'deploy-tenant-frontend.sh melamedia',
    ]);
    assert.doesNotMatch(result.calls.join('\n'), /\bidm\b/i);
});

test('dry-run lists only active targets and invokes no deployment child', () => {
    const result = runDeployment(['--dry-run']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(result.calls, tenants.map((tenant) => `guard ${plan[tenant]}`));
    assert.doesNotMatch(result.stdout, /deploy-tenant-(?:backend|frontend)\.sh idm\b/i);
    for (const tenant of tenants) assert.match(result.stdout, new RegExp(`deploy-tenant-backend\\.sh ${tenant} ${plan[tenant]}`));
});

test('a failed release guard prevents every deployment child', () => {
    const result = runDeployment([], { rejectGuard: plan.morlevy });
    assert.equal(result.status, 42, result.stdout + result.stderr);
    assert.deepEqual(result.calls, [`guard ${plan.melamedlaw}`, `guard ${plan.morlevy}`]);
});

test('a malformed active candidate is rejected before any deployment child', () => {
    const result = runDeployment([], { candidates: { ...plan, melamedlaw: 'not-a-reviewed-sha' } });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(result.calls, []);
});
