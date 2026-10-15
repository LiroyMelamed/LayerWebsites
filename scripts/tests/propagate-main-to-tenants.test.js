const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '../propagate-main-to-tenants.sh');

function runPropagation(args) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-propagation-'));
    try {
        const bin = path.join(root, 'bin');
        fs.mkdirSync(bin);
        const branches = ['Melamedia', 'MelamedLaw', 'MorLevi', 'AshrafEssa', 'Idm'];
        const worktrees = branches.map((branch) => {
            const dir = path.join(root, branch);
            fs.mkdirSync(dir);
            return `worktree ${dir}\nbranch refs/heads/${branch}\n`;
        }).join('\n');
        fs.writeFileSync(path.join(root, 'worktrees'), worktrees);
        fs.writeFileSync(path.join(bin, 'git'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$PROPAGATION_TEST_ROOT/calls"
case "$1" in
  fetch|checkout|pull|merge|push|status) exit 0 ;;
  rev-parse) echo 123456789abcdef ;;
  log) echo 'Test product fix' ;;
  worktree) cat "$PROPAGATION_TEST_ROOT/worktrees" ;;
  merge-base) exit 1 ;;
  *) echo "Unexpected git command: $*" >&2; exit 91 ;;
esac
`, { mode: 0o755 });
        const result = spawnSync('bash', [script, ...args], {
            encoding: 'utf8',
            env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PROPAGATION_TEST_ROOT: root },
        });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        return fs.readFileSync(path.join(root, 'calls'), 'utf8').trim().split('\n');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

test('no tenant arguments merge and push only the Melamedia QA branch', () => {
    const calls = runPropagation([]);
    assert.deepEqual(calls.filter((line) => line.startsWith('checkout ')), ['checkout Melamedia']);
    assert.deepEqual(calls.filter((line) => line.startsWith('push ')), ['push origin Melamedia']);
    assert.equal(calls.filter((line) => line.startsWith('merge origin/main ')).length, 1);
});

test('explicit client selection still works and --no-push keeps it local', () => {
    const calls = runPropagation(['--no-push', 'morlevy']);
    assert.deepEqual(calls.filter((line) => line.startsWith('checkout ')), ['checkout MorLevi']);
    assert.equal(calls.filter((line) => line.startsWith('push ')).length, 0);
});
