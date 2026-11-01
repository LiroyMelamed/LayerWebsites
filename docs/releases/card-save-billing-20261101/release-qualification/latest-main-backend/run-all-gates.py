"""Call under the one global heavy-build mutex; never acquire a nested mutex."""
from pathlib import Path
import datetime, json, subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[4]
NODE = '/Users/liroymelamed/.nvm/versions/node/v24.14.0/bin/node'
candidate = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
rows = []
for command in [[NODE, str(OUT / 'run-offline-gates.cjs')], ['python3', str(OUT / 'run-real-postgres.py')]]:
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = subprocess.run(command, cwd=ROOT)
    rows.append(dict(command=command, startedAtUtc=started,
                     finishedAtUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(), exitCode=result.returncode))
receipt = dict(candidate=candidate, globalMutex='/tmp/layer-billing-integration-20261101/build.lock',
               lockHeldBy='outer with-build-lock.py for the entire command; no nested mutex', results=rows)
(OUT / 'run-all-gates.json').write_text(json.dumps(receipt, indent=2) + '\n')
raise SystemExit(0 if all(row['exitCode'] == 0 for row in rows) else 1)
