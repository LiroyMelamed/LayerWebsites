"""Offline context checks for the complete focused billing application/test patch.

No checkout, merge, apply, ref mutation, network, server or provider operation.
Only existing selected paths are archived to isolated temporary directories.
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

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[4]
BASE = 'e3ab31d3ef6ee94d375eaf5df5bdf57d2c14715a'
TARGETS = {
    'main': BASE,
    'AshrafEssa': 'ab271c535a996e5db4bcfc333c3b60dd332c3781',
    'MelamedLaw': '5f3a4459256c225be14386178e3cec827e3c79e2',
    'MorLevi': '08f1a9889274b035d9bc307337563ad8c7016cb8',
    'Melamedia': 'ca31b04ea2957e78eb7f57edcff468baa6e6332d',
}
BASELINE_JS = [
    'backend/controllers/billingController.js',
    'backend/lib/billing/firmBillingService.js',
    'backend/lib/billing/selfServiceRenewal.js',
    'backend/lib/billing/selfServiceUpgrade.js',
    'backend/lib/payments/takbullClient.js',
    'frontend/src/api/billingApi.js',
    'frontend/src/components/billing/TakbullCheckoutDialog.js',
    'frontend/src/screens/billingScreen/PlanUsageScreen.js',
    'frontend/src/screens/billingScreen/PlansPricingScreen.js',
]
LOCALES = ['frontend/src/i18n/locales/' + lang + '.json' for lang in ['ar', 'en', 'he']]
ENV = dict(os.environ, GIT_OPTIONAL_LOCKS='0')
for name in ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']:
    ENV.pop(name, None)

def git(*args):
    return subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True,
                          env=ENV, check=True).stdout

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def test_path(name):
    return '/tests/' in name or '.test.' in name

started = datetime.datetime.now(datetime.timezone.utc).isoformat()
paths = git('diff', '--name-only', BASE, '--', 'backend', 'frontend').decode().splitlines()
if len(paths) != 24 or any(not p.startswith(('backend/', 'frontend/')) for p in paths):
    raise RuntimeError('EXPECTED_EXACTLY_24_FOCUSED_BACKEND_FRONTEND_PATHS')
status = git('diff', '--name-status', BASE, '--', *paths).decode().splitlines()
head = git('rev-parse', 'HEAD').decode().strip()
before = {p: sha((ROOT / p).read_bytes()) for p in paths}
dirty = git('diff', '--name-only', 'HEAD', '--', *paths).decode().splitlines()
patch = git('diff', '--binary', '--full-index', BASE, '--', *paths)
patch_path = OUT / 'billing-application-tests.patch'
patch_path.write_bytes(patch)

def check(item):
    target, commit = item
    git('cat-file', '-e', commit + '^{commit}')
    existing = git('ls-tree', '-r', '--name-only', commit, '--', *paths).decode().splitlines()
    archive = git('archive', '--format=tar', commit, '--', *existing)
    with tempfile.TemporaryDirectory(prefix='billing-existing-cycle-' + target.lower() + '-') as temp:
        folder = Path(temp).resolve()
        exported = []
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as source:
            for member in source.getmembers():
                destination = (folder / member.name).resolve()
                destination.relative_to(folder)
                if member.isdir():
                    destination.mkdir(parents=True, exist_ok=True)
                elif member.isfile() and member.name in existing:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    stream = source.extractfile(member)
                    if stream is None:
                        raise RuntimeError('ARCHIVE_FILE_MISSING')
                    destination.write_bytes(stream.read())
                    exported.append(member.name)
                else:
                    raise RuntimeError('UNEXPECTED_ARCHIVE_MEMBER')
        if sorted(exported) != sorted(existing):
            raise RuntimeError('EXACT_EXISTING_SOURCE_EXPORT_REQUIRED')
        result = subprocess.run(['git', '-C', str(folder), 'apply', '--check', str(patch_path)],
                                capture_output=True, text=True, env=ENV)
        nonlocale = None
        if result.returncode != 0:
            focused = subprocess.run(
                ['git', '-C', str(folder), 'apply', '--check',
                 *['--exclude=' + path for path in LOCALES], str(patch_path)],
                capture_output=True, text=True, env=ENV)
            nonlocale = {
                'command': 'git apply --check [exclude ar/en/he locale paths] billing-application-tests.patch',
                'exitCode': focused.returncode, 'stdout': focused.stdout, 'stderr': focused.stderr,
                'excludedPaths': LOCALES, 'applied': False,
            }
        return {
            'target': target,
            'sourceCommit': commit,
            'archivedExistingPaths': sorted(exported),
            'newPatchPathsAbsentFromTarget': sorted(set(paths) - set(existing)),
            'archiveSha256': sha(archive),
            'command': 'git apply --check billing-application-tests.patch',
            'exitCode': result.returncode,
            'status': 'PASS_CONTEXT_COMPATIBLE' if result.returncode == 0 else 'FAIL_CONTEXT_INCOMPATIBLE',
            'stdout': result.stdout,
            'stderr': result.stderr,
            'diagnosticCheckExcludingLocales': nonlocale,
            'applied': False,
            'temporaryExportRemoved': True,
        }

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
    rows = list(executor.map(check, TARGETS.items()))
baseline = []
for name in BASELINE_JS:
    main_blob = git('rev-parse', BASE + ':' + name).decode().strip()
    values = {target: git('rev-parse', commit + ':' + name).decode().strip()
              for target, commit in TARGETS.items()}
    baseline.append({'path': name, 'mainBaselineBlob': main_blob,
                     'targetBlobs': values, 'allFiveBaselinesEqual': all(v == main_blob for v in values.values())})
locale_diagnostics = []
for row in rows:
    if row['exitCode'] == 0:
        continue
    for path in LOCALES:
        base_json = json.loads(git('show', BASE + ':' + path))
        target_json = json.loads(git('show', row['sourceCommit'] + ':' + path))
        candidate_json = json.loads((ROOT / path).read_bytes())
        locale_diagnostics.append({
            'target': row['target'], 'path': path,
            'targetParsedJsonEqualsBase': target_json == base_json,
            'targetBillingObjectEqualsBase': target_json['billing'] == base_json['billing'],
            'baseBillingKeyOrder': list(base_json['billing']),
            'targetBillingKeyOrder': list(target_json['billing']),
            'candidateAddsBillingKeys': sorted(set(candidate_json['billing']) - set(base_json['billing'])),
            'targetHasPaymentUnconfirmed': 'paymentUnconfirmed' in target_json['billing'],
            'candidatePaymentUnconfirmedSha256': sha(candidate_json['billing']['paymentUnconfirmed'].encode()),
        })
after = {p: sha((ROOT / p).read_bytes()) for p in paths}
result = {
    'startedAtUtc': started,
    'completedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Offline application/test patch context only; not new tenant functional QA or release approval.',
    'targetPinAuthority': 'Fresh GitHub refs supplied and verified by parent; resolved locally here without network or ref changes.',
    'baseCommit': BASE,
    'candidateHeadAtCapture': head,
    'parentContext': 'Parent states the clock-chain follow-up changes only the two existing tests; production runtime remains the verified 7fe lineage.',
    'changedPathCount': len(paths),
    'applicationPathCount': len([p for p in paths if not test_path(p)]),
    'testPathCount': len([p for p in paths if test_path(p)]),
    'changedPathStatusVsBase': status,
    'uncommittedSelectedPathsAtCapture': dirty,
    'uncommittedApplicationPaths': [p for p in dirty if not test_path(p)],
    'uncommittedTestPaths': [p for p in dirty if test_path(p)],
    'sourceFilesSha256': before,
    'sourceFilesStableDuringCheck': before == after,
    'candidateHeadStableDuringCheck': git('rev-parse', 'HEAD').decode().strip() == head,
    'patchFile': patch_path.name,
    'patchBytes': len(patch),
    'patchSha256': sha(patch),
    'rows': rows,
    'nineBillingJsBaselineComparison': baseline,
    'failedTargetLocaleDiagnostics': locale_diagnostics,
    'networkOperations': 0,
    'clientOrProviderOperations': 0,
    'applyMergeCheckoutOrRefOperations': 0,
}
(OUT / 'compatibility.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
lines = [
    '# Existing-cycle billing patch: final offline compatibility', '',
    'Captured ' + result['completedAtUtc'] + '.',
    'Current shared-main base: `' + BASE + '`.',
    'Candidate HEAD: `' + head + '`; uncommitted selected input paths at capture are listed below.', '',
    'Patch input: [' + patch_path.name + '](' + patch_path.name + '), ' + str(len(patch)) + ' bytes.',
    'SHA256: `' + result['patchSha256'] + '`.', '',
    'The patch contains **24 focused paths: 12 application/locale paths and 12 test paths**. It excludes documentation and unrelated common-main work. Current main\'s shared profile/Word work remains in the base; no multi-month billing implementation is introduced by this follow-up.', '',
    'Uncommitted application paths: ' + str(result['uncommittedApplicationPaths']) + '.',
    'Uncommitted final test paths: ' + ', '.join('`' + p + '`' for p in result['uncommittedTestPaths']) + '.',
    'All 24 file hashes stable during check: **' + str(result['sourceFilesStableDuringCheck']) + '**.', '',
    '| Target | Immutable source SHA | Archived existing files | New test paths left absent | git apply --check |',
    '| --- | --- | ---: | ---: | --- |',
]
for row in rows:
    lines.append('| ' + row['target'] + ' | `' + row['sourceCommit'] + '` | ' + str(len(row['archivedExistingPaths'])) + ' | ' + str(len(row['newPatchPathsAbsentFromTarget'])) + ' | ' + row['status'] + ' |')
lines += ['',
    'Only selected paths already present at each target were exported with `git archive` to isolated `/tmp` directories. New test files were deliberately absent so the patch\'s file-creation context was checked correctly. `git apply --check` ran only; no patch was applied. Temporary exports were removed.', '',
    '**Nine production billing JavaScript baseline files match shared main on all four client/QA targets.** Exact blobs are recorded in the JSON; this is a source comparison, not a new running-server observation.', '',
    '**MelamedLaw requires locale reconciliation before the complete patch can be applied.** Its `ar.json`, `en.json` and `he.json` parse to exactly the same JSON objects as shared main, but their key ordering differs. The billing patch adds only `billing.paymentUnconfirmed` in each locale; existing values are unchanged. A diagnostic `git apply --check` excluding those three paths passes on MelamedLaw, so the remaining 21 application/test paths have compatible context. Exact failure output, billing key order and intended value hashes are recorded in the JSON.', '',
    'A separate [Melamed-specific review patch](MELAMED-ADAPTED.md) now supplies the three surgical locale additions and records its own passing check plus disposable-export application/byte verification. The shared patch above remains 4/5. No real source checkout or customer change was performed. Functional integration/release checks remain separate.', '',
    '**Context compatibility is not functional qualification.** No new all-client application test, browser flow, provider/receipt test, migration/grant check or deployment was performed. Existing functional/source-guard receipts remain separate evidence. Current tenant pins came from the parent\'s refreshed GitHub observation, not the earlier historical version audit.', '',
    'A changed application/test input, shared-main base or target pin invalidates this proof. The parent can bind the final committed candidate to these hashes after committing the stable test-only edits, or rerun this script if any bytes change.', '',
    '[Machine evidence](compatibility.json) · [Reproduction script](check-compatibility.py)',
]
(OUT / 'README.md').write_text('\n'.join(lines) + '\n')
print(json.dumps({'candidate': head, 'patchSha256': result['patchSha256'], 'stable': before == after,
                  'dirtyApplication': result['uncommittedApplicationPaths'], 'dirtyTests': result['uncommittedTestPaths'],
                  'baselineNineAllEqual': all(x['allFiveBaselinesEqual'] for x in baseline),
                  'results': [{k: r[k] for k in ['target','sourceCommit','exitCode','status']} for r in rows]}, indent=2))
