"""Prepare/check a Melamed-specific review patch in disposable exports only.

The parent explicitly authorized applying this patch only to the owned temporary
archive for byte/semantic verification. No source checkout, refs, network,
provider or customer data are changed.
"""
import datetime
import difflib
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[4]
CLIENT = '5f3a4459256c225be14386178e3cec827e3c79e2'
ENV = dict(os.environ, GIT_OPTIONAL_LOCKS='0')
for name in ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']:
    ENV.pop(name, None)

def git(*args):
    return subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True,
                          env=ENV, check=True).stdout

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def blob(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()

started = datetime.datetime.now(datetime.timezone.utc).isoformat()
shared = json.loads((OUT / 'compatibility.json').read_text())
paths = list(shared['sourceFilesSha256'])
locales = ['frontend/src/i18n/locales/' + lang + '.json' for lang in ['ar', 'en', 'he']]
head = git('rev-parse', 'HEAD').decode().strip()
before = {path: sha((ROOT / path).read_bytes()) for path in paths}
if len(paths) != 24 or before != shared['sourceFilesSha256']:
    raise RuntimeError('SHARED_PROOF_INPUT_CHANGED')
source_patch = (OUT / shared['patchFile']).read_bytes()
if sha(source_patch) != shared['patchSha256']:
    raise RuntimeError('SHARED_PATCH_HASH_MISMATCH')

adapted_locale = {}
locale_evidence = []
locale_sections = {}
for path in locales:
    original = git('show', CLIENT + ':' + path)
    old = json.loads(original)
    candidate = json.loads((ROOT / path).read_bytes())
    desired = candidate['billing']['paymentUnconfirmed']
    if 'paymentUnconfirmed' in old['billing']:
        raise RuntimeError('NEW_BILLING_KEY_ALREADY_EXISTS_REQUIRES_REVIEW')
    # Billing is a shallow object in these immutable target files. Insert one
    # entry after its current final item, keeping every old byte in order.
    start = original.index(b'  "billing": {\n')
    end = original.index(b'\n  },', start)
    if original[:end].endswith(b','):
        raise RuntimeError('UNEXPECTED_TRAILING_COMMA')
    addition = b',\n    "paymentUnconfirmed": ' + json.dumps(desired, ensure_ascii=False).encode()
    updated = original[:end] + addition + original[end:]
    parsed = json.loads(updated)
    without_new = dict(parsed, billing=dict(parsed['billing']))
    del without_new['billing']['paymentUnconfirmed']
    if without_new != old or parsed['billing']['paymentUnconfirmed'] != desired:
        raise RuntimeError('LOCALE_SEMANTIC_PRESERVATION_FAILED')
    restored = updated[:end] + updated[end + len(addition):]
    if restored != original:
        raise RuntimeError('LOCALE_ORIGINAL_BYTES_NOT_PRESERVED')
    adapted_locale[path] = updated
    header = ('diff --git a/' + path + ' b/' + path + '\nindex ' + blob(original) + '..' + blob(updated) + ' 100644\n').encode()
    hunk = b''.join(difflib.diff_bytes(
        difflib.unified_diff, original.splitlines(keepends=True), updated.splitlines(keepends=True),
        fromfile=('a/' + path).encode(), tofile=('b/' + path).encode()))
    locale_sections[path] = header + hunk
    locale_evidence.append({
        'path': path, 'oldSha256': sha(original), 'adaptedSha256': sha(updated),
        'addedKey': 'billing.paymentUnconfirmed', 'newValueSha256': sha(desired.encode()),
        'oneAddedKeyOnly': without_new == old, 'allOldValuesPreserved': True,
        'allOldBytesPreservedByOneInsertion': restored == original,
        'insertionOffset': end, 'insertionBytes': len(addition),
    })

sections = re.split(br'(?=^diff --git )', source_patch, flags=re.M)
adapted_sections = []
nonlocale_unchanged = []
seen = []
for section in sections:
    if not section:
        continue
    first = section.splitlines()[0]
    match = re.fullmatch(br'diff --git a/(.+) b/\1', first)
    if not match:
        raise RuntimeError('UNEXPECTED_PATCH_HEADER')
    path = match.group(1).decode()
    seen.append(path)
    adapted_sections.append(locale_sections.get(path, section))
    if path not in locales:
        nonlocale_unchanged.append(path)
if sorted(seen) != sorted(paths) or len(nonlocale_unchanged) != 21:
    raise RuntimeError('EXPECTED_EXACT_24_PATCH_PATHS')
adapted = b''.join(adapted_sections)
patch_path = OUT / 'melamed-billing-application-tests.patch'
patch_path.write_bytes(adapted)

existing = git('ls-tree', '-r', '--name-only', CLIENT, '--', *paths).decode().splitlines()
archive = git('archive', '--format=tar', CLIENT, '--', *existing)
with tempfile.TemporaryDirectory(prefix='billing-melamed-adapted-') as temp:
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
                destination.write_bytes(source.extractfile(member).read())
                exported.append(member.name)
            else:
                raise RuntimeError('UNEXPECTED_ARCHIVE_MEMBER')
    if sorted(exported) != sorted(existing):
        raise RuntimeError('EXACT_SOURCE_EXPORT_REQUIRED')
    checked = subprocess.run(['git', '-C', str(folder), 'apply', '--check', str(patch_path)],
                             capture_output=True, text=True, env=ENV)
    if checked.returncode:
        raise RuntimeError('ADAPTED_CHECK_FAILED: ' + checked.stderr)
    applied = subprocess.run(['git', '-C', str(folder), 'apply', str(patch_path)],
                             capture_output=True, text=True, env=ENV)
    if applied.returncode:
        raise RuntimeError('DISPOSABLE_APPLY_FAILED: ' + applied.stderr)
    verification = []
    for path in paths:
        actual = (folder / path).read_bytes()
        expected = adapted_locale[path] if path in locales else (ROOT / path).read_bytes()
        verification.append({'path': path, 'actualSha256': sha(actual),
                             'expectedSha256': sha(expected), 'exactBytesMatch': actual == expected,
                             'expectation': 'surgical target locale merge' if path in locales else 'candidate working tree'})
    actual_files = sorted(str(path.relative_to(folder)) for path in folder.rglob('*') if path.is_file())
    if actual_files != sorted(paths) or not all(row['exactBytesMatch'] for row in verification):
        raise RuntimeError('POST_APPLY_EXPORT_SOURCE_MISMATCH')
    for path in locales:
        actual = json.loads((folder / path).read_bytes())
        old = json.loads(git('show', CLIENT + ':' + path))
        new = actual['billing'].pop('paymentUnconfirmed')
        desired = json.loads((ROOT / path).read_bytes())['billing']['paymentUnconfirmed']
        if actual != old or new != desired:
            raise RuntimeError('POST_APPLY_LOCALE_PRESERVATION_FAILED')

after = {path: sha((ROOT / path).read_bytes()) for path in paths}
result = {
    'startedAtUtc': started, 'completedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Melamed-specific review patch with surgical locale adaptation; context/byte verification, not functional QA.',
    'targetCommit': CLIENT, 'sharedMainBase': shared['baseCommit'], 'candidateHeadAtCapture': head,
    'sharedPatchSha256': sha(source_patch), 'sharedPatchAllTargetResult': '4 PASS, MelamedLaw locale context FAIL',
    'adaptedPatchFile': patch_path.name, 'adaptedPatchSha256': sha(adapted), 'adaptedPatchBytes': len(adapted),
    'pathCount': len(paths), 'nonLocalePatchSectionsIdenticalToShared': nonlocale_unchanged,
    'archivedExistingPaths': sorted(existing), 'newPatchPathsLeftAbsent': sorted(set(paths) - set(existing)),
    'archiveSha256': sha(archive),
    'check': {'command': 'git apply --check melamed-billing-application-tests.patch', 'exitCode': checked.returncode,
              'stdout': checked.stdout, 'stderr': checked.stderr, 'status': 'PASS_CONTEXT_COMPATIBLE'},
    'disposableExportApply': {'authorizedByParent': True, 'appliedOnlyToOwnedTemporaryExport': True,
                             'exitCode': applied.returncode, 'stdout': applied.stdout, 'stderr': applied.stderr,
                             'temporaryExportRemoved': True},
    'localePreservation': locale_evidence, 'postApplyFileVerification': verification,
    'all21NonLocaleFilesEqualCandidate': all(row['exactBytesMatch'] for row in verification if row['path'] not in locales),
    'allThreeLocalesEqualSurgicalMerge': all(row['exactBytesMatch'] for row in verification if row['path'] in locales),
    'sourceFilesSha256': before, 'sourceFilesStableDuringCheck': before == after,
    'candidateHeadStableDuringCheck': git('rev-parse', 'HEAD').decode().strip() == head,
    'uncommittedSelectedPathsAtCapture': shared['uncommittedSelectedPathsAtCapture'],
    'networkOperations': 0, 'realSourceCheckoutOrRefMutations': 0, 'customerOrProviderOperations': 0,
}
(OUT / 'melamed-adapted.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
(OUT / 'MELAMED-ADAPTED.md').write_text('\n'.join([
    '# MelamedLaw-specific billing review patch', '',
    'Captured ' + result['completedAtUtc'] + '.',
    'Immutable target: `' + CLIENT + '`; shared-main base: `' + shared['baseCommit'] + '`.',
    'Candidate input: `' + head + '` with the two final test edits recorded in [shared evidence](compatibility.json).', '',
    '**PASS:** the adapted 24-path patch passes `git apply --check` on the MelamedLaw export. After applying only to that disposable export, all nine billing JavaScript files and 12 test files exactly match the candidate working tree. All three locales match their surgical merge; every old locale value is unchanged.', '',
    'The [shared patch](billing-application-tests.patch) still has the truthful **4/5** result: MelamedLaw fails only because its locale key order differs. This [Melamed-specific patch](' + patch_path.name + ') replaces only those three locale hunks. Its other 21 patch sections are byte-identical to the shared patch. Each locale change adds `billing.paymentUnconfirmed` from the candidate by one contiguous byte-sequence insertion (including the necessary comma), retaining all pre-existing bytes and key order. No whole-file JSON serialization is used.', '',
    'Adapted patch SHA256: `' + result['adaptedPatchSha256'] + '` (' + str(len(adapted)) + ' bytes).',
    'Shared patch SHA256: `' + result['sharedPatchSha256'] + '`.', '',
    'Only 19 existing selected files were archived; five new tests were intentionally absent before checking/applying. The parent authorized application exclusively to this owned temporary export. It was removed afterward. No actual source checkout, branch/ref, customer data, server or provider was changed; no network operation occurred.', '',
    '**This verifies patch context and resulting source bytes, not functional QA or release approval.** Preserve tenant branding/configuration/data and run the coordinated shared-main integration/release checks separately. Changed source bytes, base or target pins require a new proof.', '',
    '[Machine evidence](melamed-adapted.json) · [Reproduction script](check-melamed-adapted.py) · [All-target shared result](README.md)',
]) + '\n')
print(json.dumps({'status': result['check']['status'], 'target': CLIENT,
                  'adaptedPatchSha256': result['adaptedPatchSha256'],
                  'all21NonLocaleFilesEqualCandidate': result['all21NonLocaleFilesEqualCandidate'],
                  'allThreeLocalesEqualSurgicalMerge': result['allThreeLocalesEqualSurgicalMerge'],
                  'sourceFilesStableDuringCheck': result['sourceFilesStableDuringCheck']}, indent=2))
