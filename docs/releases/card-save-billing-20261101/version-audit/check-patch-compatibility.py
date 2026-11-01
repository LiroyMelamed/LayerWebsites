"""Check the current production-only patch against immutable tenant sources.

Exports exactly twelve source/locale paths to private temporary directories.
Runs git apply --check only: no apply, merge, checkout, refs or remote mutation.
"""
import concurrent.futures
import datetime
import hashlib
import io
import json
import os
import subprocess
import tarfile
import tempfile
from pathlib import Path

OUT = Path(__file__).parent
ROOT = OUT.parents[3]
PATHS = [
    'backend/controllers/billingController.js',
    'backend/lib/billing/firmBillingService.js',
    'backend/lib/billing/selfServiceRenewal.js',
    'backend/lib/billing/selfServiceUpgrade.js',
    'backend/lib/payments/takbullClient.js',
    'frontend/src/api/billingApi.js',
    'frontend/src/components/billing/TakbullCheckoutDialog.js',
    'frontend/src/screens/billingScreen/PlanUsageScreen.js',
    'frontend/src/screens/billingScreen/PlansPricingScreen.js',
    'frontend/src/i18n/locales/he.json',
    'frontend/src/i18n/locales/en.json',
    'frontend/src/i18n/locales/ar.json',
]
TENANTS = {
    'main': '53d177eea8bcdcb882ade913f4afa15c6011da4b',
    'AshrafEssa': 'c469ee2e0fb5bee403902c698f6621cb7a08cab3',
    'MelamedLaw': '0631caf7b1c829673887e12c1d2e3ffc36c1715b',
    'MorLevi': 'a50afb3fccaaee17633328ef62b5695336d73090',
    'Melamedia': '36c95fa0da76281b4fe92c8cb687d33332a5e8c8',
}
env = dict(os.environ, GIT_OPTIONAL_LOCKS='0')
for key in ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']:
    env.pop(key, None)

def git(*args):
    return subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True, env=env, check=True).stdout

def sha(data):
    return hashlib.sha256(data).hexdigest()

def source_hashes():
    return {name: sha((ROOT / name).read_bytes()) for name in PATHS}

started = datetime.datetime.now(datetime.timezone.utc).isoformat()
before = source_hashes()
base = git('rev-parse', 'origin/main').decode().strip()
head = git('rev-parse', 'HEAD').decode().strip()
dirty_production = bool(git('diff', '--name-only', 'HEAD', '--', *PATHS).strip())
patch = git('diff', '--binary', '--full-index', 'origin/main', '--', *PATHS)
patch_path = OUT / 'compatibility-production.patch'
patch_path.write_bytes(patch)

def check(item):
    tenant, commit = item
    archive = git('archive', '--format=tar', commit, '--', *PATHS)
    with tempfile.TemporaryDirectory(prefix='legal-payment-patch-' + tenant.lower() + '-') as temp:
        folder = Path(temp).resolve()
        exported = []
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as tar:
            for member in tar.getmembers():
                target = (folder / member.name).resolve()
                target.relative_to(folder)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                elif member.isfile() and member.name in PATHS:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    stream = tar.extractfile(member)
                    if stream is None:
                        raise RuntimeError('ARCHIVE_SOURCE_MISSING')
                    target.write_bytes(stream.read())
                    exported.append(member.name)
                else:
                    raise RuntimeError('UNEXPECTED_ARCHIVE_MEMBER')
        if sorted(exported) != sorted(PATHS):
            raise RuntimeError('EXACT_TWELVE_SOURCE_PATHS_REQUIRED')
        result = subprocess.run(['git', '-C', str(folder), 'apply', '--check', str(patch_path.resolve())], capture_output=True, text=True, env=env)
        return {
            'tenant': tenant,
            'sourceCommit': commit,
            'exportedFileCount': len(exported),
            'exportedFiles': sorted(exported),
            'archiveSha256': sha(archive),
            'command': 'git apply --check compatibility-production.patch',
            'exitCode': result.returncode,
            'status': 'PASS_CONTEXT_COMPATIBLE' if result.returncode == 0 else 'FAIL_CONTEXT_INCOMPATIBLE',
            'stdout': result.stdout,
            'stderr': result.stderr,
            'applied': False,
            'temporaryExportRemoved': True,
        }

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    rows = list(executor.map(check, TENANTS.items()))
after = source_hashes()
result = {
    'startedAtUtc': started,
    'completedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Patch-context compatibility only; not merge or functional QA. No apply, checkout, branch/ref mutation, network or client modification.',
    'baseRef': 'origin/main',
    'baseCommit': base,
    'currentGitHubMainTarget': TENANTS['main'],
    'taskHeadAtCapture': head,
    'includesCurrentUncommittedProductionChanges': dirty_production,
    'patchFile': patch_path.name,
    'patchSha256': sha(patch),
    'patchBytes': len(patch),
    'sourceFilesSha256': before,
    'sourceFilesStableDuringCheck': before == after,
    'rows': rows,
}
(OUT / 'patch-compatibility.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
lines = [
    '# Current production patch context compatibility',
    '',
    'Captured ' + result['completedAtUtc'] + '. Patch baseline: local `origin/main` at `' + base + '`.',
    'Fresh GitHub main target: `' + TENANTS['main'] + '`; it is checked independently below, without moving the local tracking ref.',
    'Task HEAD at capture: `' + head + '`; ' + ('the patch includes current uncommitted production changes.' if dirty_production else 'all twelve production inputs are committed at that source point.'),
    '',
    'Input: [`' + patch_path.name + '`](' + patch_path.name + '), ' + str(len(patch)) + ' bytes.',
    'SHA256: `' + result['patchSha256'] + '`.',
    'The twelve working source files stayed unchanged during the check: **' + str(before == after) + '**.',
    '',
    '| Target | Immutable source commit | Exported source/locale files | git apply --check |',
    '| --- | --- | ---: | --- |',
]
for row in rows:
    lines.append('| ' + row['tenant'] + ' | `' + row['sourceCommit'] + '` | ' + str(row['exportedFileCount']) + ' | ' + row['status'] + ' |')
lines += [
    '',
    'Exactly the nine production JavaScript files and Hebrew/English/Arabic locale files were exported with `git archive` to isolated `/tmp` directories. Only `git apply --check` ran; no patch was applied. Temporary exports were removed after checking.',
    '',
    '**This proves patch-context compatibility only.** It is not a merge, tenant runtime test, schema/grant verification, branded build, provider test, deployment or release approval. Full locale files and tenant-specific state were not replaced.',
    '',
    'Any subsequent change to the twelve production files or the main/tenant inputs invalidates this result; regenerate the patch and rerun this script after the final billing candidate is committed.',
    '',
    'Exact source hashes, commands, exit codes and archive hashes: [`patch-compatibility.json`](patch-compatibility.json).',
]
(OUT / 'patch-compatibility.md').write_text('\n'.join(lines) + '\n')
print(json.dumps({'patchSha256': result['patchSha256'], 'stable': before == after, 'results': [{key: row[key] for key in ['tenant', 'sourceCommit', 'exportedFileCount', 'exitCode', 'status']} for row in rows]}, indent=2))
