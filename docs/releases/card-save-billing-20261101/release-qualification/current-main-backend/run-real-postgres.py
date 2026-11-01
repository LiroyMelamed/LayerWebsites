"""Owned existing billing fixture only; always stop it; no app environment."""
from pathlib import Path
import datetime, hashlib, json, os, re, subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[4]
DATA = '/tmp/layer-billing-pg.dJ0RrF/data'
CTL = '/opt/homebrew/opt/postgresql@17/bin/pg_ctl'
NODE = '/Users/liroymelamed/.nvm/versions/node/v24.14.0/bin/node'
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def call(*args): return subprocess.run(args, capture_output=True, text=True)
def git(*args): return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()

if call(CTL, '-D', DATA, 'status').returncode != 3:
    raise SystemExit('FIXTURE_NOT_CONFIRMED_STOPPED; no start or stop performed')
started = now()
paths = ['backend/lib/billing/firmBillingService.js', 'backend/lib/billing/billingOperations.js',
         'backend/tests/cardSetupDebtCollection.test.js']
before = {p: sha(ROOT / p) for p in paths}
start = call(CTL, '-D', DATA, '-l', '/tmp/layer-billing-pg.dJ0RrF/postgres-current-main.log',
             '-o', '-h 127.0.0.1 -p 55449 -k /tmp/layer-billing-pg.dJ0RrF', '-w', 'start')
if start.returncode:
    raise SystemExit('OWNED_FIXTURE_START_FAILED ' + start.stdout + start.stderr)
env = {k: os.environ[k] for k in ['PATH', 'HOME', 'TMPDIR', 'LANG'] if k in os.environ}
env.update(NODE_PATH='/tmp/layer-billing-lock-deps/node_modules', NODE_ENV='test',
           DB_DISABLE_CONNECT_TEST='true', BILLING_TEST_POSTGRES='1')
command = [NODE, '--require', str(OUT / 'real-postgres-network-guard.cjs'), '--test',
           '--test-reporter=tap', 'backend/tests/cardSetupDebtCollection.test.js']
run = None
try:
    with (OUT / 'real-postgres.tap').open('w') as log:
        run = subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=180)
finally:
    stop = call(CTL, '-D', DATA, '-m', 'fast', '-w', 'stop')
    status = call(CTL, '-D', DATA, 'status')
    listener = call('lsof', '-nP', '-iTCP:55449', '-sTCP:LISTEN')
    cleanup = dict(atUtc=now(), cluster=DATA, startExitCode=start.returncode,
                   stopExitCode=stop.returncode, statusExitCode=status.returncode,
                   statusOutput=(status.stdout + status.stderr).strip(),
                   listenerCheckExitCode=listener.returncode, listenerOutputEmpty=not listener.stdout.strip(),
                   newClusterDatabaseRoleOrAccessCreated=False, otherClustersTouched=False)
    (OUT / 'postgres-cleanup.json').write_text(json.dumps(cleanup, indent=2) + '\n')
text = (OUT / 'real-postgres.tap').read_text()
summary = {k: int(m.group(1)) if (m := re.search(r'^# ' + k + r' (\d+)$', text, re.M)) else None
           for k in ['tests', 'pass', 'fail', 'skipped', 'cancelled']}
after = {p: sha(ROOT / p) for p in paths}
receipt = dict(candidate=git('rev-parse', 'HEAD'), startedAtUtc=started, finishedAtUtc=now(),
               command=command, exitCode=run.returncode if run else None, summary=summary,
               sourceSha256Before=before, sourceSha256After=after, sourceStable=before == after,
               financialOperationsFlagSupplied=False, flow='Normal unconfigured-enabled behavior',
               dependencyRoot=env['NODE_PATH'], fixture=dict(host='127.0.0.1', port=55449,
                   user='billing_qa', database='billing_card_setup_qa'), providerCalls='synthetic only',
               networkGuard='only127.0.0.1:55449 TCP, native fetch blocked', logSha256=sha(OUT / 'real-postgres.tap'))
(OUT / 'real-postgres.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt), flush=True)
print(json.dumps(cleanup), flush=True)
raise SystemExit(0 if run and run.returncode == 0 and before == after and stop.returncode == 0
                 and status.returncode == 3 and not listener.stdout.strip() else 1)
