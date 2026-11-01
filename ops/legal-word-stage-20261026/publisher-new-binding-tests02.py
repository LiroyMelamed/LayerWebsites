#!/usr/bin/env python3
"""Only newly added inner/outer and rollback-source binding cases; no transport tests."""
from pathlib import Path
import copy, datetime, hashlib, json, socket, sys, tempfile

ROOT = Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2')
OUT = ROOT / 'outputs/word-stage-candidate-20261026/frontend'
PUBLISHER = OUT / 'publish-word-stage02.py'
H = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
ledgers = [ROOT / 'outputs/signing-implementation-20261007/TEST-LEDGER.md', ROOT / 'outputs/office-whatsapp-20261023/TEST-LEDGER.md']
for p in ledgers: p.read_text()
source_before = H(PUBLISHER)
assert source_before == 'dfaf360e0c23b91de819f3a39886dc005c12b5d4e111b336f09599a5626518c5'
sys.dont_write_bytecode = True
def no_network(*args, **kwargs): raise RuntimeError('SYNTHETIC_BINDING_TEST_FORBIDS_NETWORK')
socket.socket.connect = no_network; socket.create_connection = no_network; socket.getaddrinfo = no_network
module = {'__name__': 'publisher_new_binding_qualification', '__file__': str(PUBLISHER)}
exec(compile(PUBLISHER.read_bytes(), str(PUBLISHER), 'exec'), module)
run = Path(tempfile.mkdtemp(prefix='publisher-new-binding02-', dir='/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/legal-release-20261026'))
history = run / 'history'; history.mkdir(); module['BACKEND_HISTORY'] = history
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
results = []

def verify_receipt(tenant):
    return {'at': now, 'tenant': tenant, 'phase': 'verify', 'exitCode': 0,
        'candidateCommit': module['SOURCES'][tenant], 'sourceCommit': module['SOURCES'][tenant], 'contractSha256': 'a'*64,
        'observation': {'at': now, 'phase': 'verify', 'contractSha256': 'a'*64,
            'result': 'PASS_FRESH_BACKEND_CODE_SCHEMA_SINGLE_CONFIG_OFF_BINDING', 'tenant': tenant,
            'branch': module['BRANCHES'][tenant], 'candidateCommit': module['SOURCES'][tenant], 'sourceCommit': module['SOURCES'][tenant],
            'predicates': {k: True for k in module['PREDICATES']}, 'state': {'process': {'status': 'online'}}}}

def rollback_receipt(tenant):
    value = verify_receipt(tenant)
    value.update(phase='rollback', sourceCommit=module['ROLLBACKS'][tenant], recoveryApprovalSha256='b'*64)
    value['observation'] = {'at': now, 'phase': 'rollback', 'contractSha256': 'a'*64,
        'result': 'PASS_CONDITIONAL_FORWARD_BASE_TREE_AND_OWNED_CONFIG_ROLLBACK', 'tenant': tenant,
        'sourceCommit': module['ROLLBACKS'][tenant], 'recoveryApprovalSha256': 'b'*64,
        'healthProof': {'ready': True}, 'wholeDatabaseRestorePerformed': False, 'additiveSchemaAndHistoryRetained': True,
        'originalEnvironmentBytesRestored': True, 'state': {'branch': module['BRANCHES'][tenant], 'process': {'status': 'online'}}}
    return value

def check(name, tenant, value, phase='rollback', expected=None):
    p = run / (name + '.synthetic.json'); p.write_text(json.dumps(value))
    binding = {'path': str(p), 'sha256': H(p)}
    failure, actual, returned = None, None, None
    try:
        returned = module['backend_gate']({'backendProof': binding}, tenant, phase, True)
        if expected: failure = 'Unsafe binding accepted; expected ' + expected
        elif returned['sourceCommit'] != value['sourceCommit']: failure = 'Returned wrong source'
    except module['Stop'] as exc:
        actual = str(exc)
        if actual != expected: failure = 'Wrong rejection: ' + actual + ', expected ' + str(expected)
    except BaseException as exc: failure = type(exc).__name__ + ': ' + str(exc)
    results.append({'name': name, 'tenant': tenant, 'publisherPhase': phase, 'pass': failure is None,
        'expectedRejection': expected, 'actualRejection': actual, 'returned': returned, 'failure': failure,
        'fixtureSha256': H(p), 'fixture': str(p)})

for tenant in module['TARGETS']:
    check(tenant + '-valid-frontend-only-recovery-keeps-verified-candidate', tenant, verify_receipt(tenant))
    check(tenant + '-valid-actual-backend-rollback-requires-exact-forward-rollback-source', tenant, rollback_receipt(tenant))
tenant = 'ashrafessa'
v = verify_receipt(tenant); v['observation']['contractSha256'] = 'c'*64
check('verify-inner-outer-contract-mismatch', tenant, v, 'publish', 'BACKEND_INNER_OUTER_BINDING_CHANGED')
v = verify_receipt(tenant); v['observation']['phase'] = 'activate'
check('verify-inner-outer-phase-mismatch', tenant, v, 'publish', 'BACKEND_INNER_OUTER_BINDING_CHANGED')
v = rollback_receipt(tenant); v['observation']['contractSha256'] = 'c'*64
check('rollback-inner-outer-contract-mismatch', tenant, v, expected='BACKEND_INNER_OUTER_BINDING_CHANGED')
v = rollback_receipt(tenant); v['observation']['phase'] = 'verify'
check('rollback-inner-outer-phase-mismatch', tenant, v, expected='BACKEND_INNER_OUTER_BINDING_CHANGED')
v = rollback_receipt(tenant); v['observation']['recoveryApprovalSha256'] = 'c'*64
check('rollback-inner-outer-recovery-approval-mismatch', tenant, v, expected='ROLLBACK_RECOVERY_BINDING_CHANGED')
v = rollback_receipt(tenant); del v['recoveryApprovalSha256']
check('rollback-outer-recovery-approval-missing', tenant, v, expected='ROLLBACK_RECOVERY_BINDING_CHANGED')
v = rollback_receipt(tenant); v['sourceCommit'] = module['SOURCES'][tenant]; v['observation']['sourceCommit'] = module['SOURCES'][tenant]
check('actual-rollback-cannot-claim-candidate-source', tenant, v, expected='BACKEND_SOURCE_OR_CONTRACT_BINDING')
v = verify_receipt(tenant); v['sourceCommit'] = module['ROLLBACKS'][tenant]; v['observation']['sourceCommit'] = module['ROLLBACKS'][tenant]
check('frontend-only-recovery-cannot-use-rollback-source-as-verify', tenant, v, expected='BACKEND_SOURCE_OR_CONTRACT_BINDING')
v = rollback_receipt(tenant)
check('rollback-receipt-cannot-authorize-publish', tenant, v, 'publish', 'BACKEND_TARGET_OR_PHASE')
after = H(PUBLISHER)
receipt = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'result': 'PASS_15_NEW_INNER_OUTER_AND_ROLLBACK_SOURCE_BINDING_CASES' if all(r['pass'] for r in results) and source_before == after else 'FAIL_NEW_BINDING_CASES',
    'scriptSha256': source_before, 'scriptSha256After': after, 'testSha256': H(Path(__file__)), 'sourceStable': source_before == after,
    'syntheticOnly': True, 'newCasesOnly': True, 'prior10GenericBindingCasesNotRerun': True,
    'noTransportOrProductSuiteExecuted': True, 'noRemoteOrProviderOrSourceMutation': True, 'results': results, 'runCache': str(run)}
dest = OUT / 'publisher-new-binding-tests02.json'
with dest.open('x') as stream: stream.write(json.dumps(receipt, indent=2) + '\n')
for ledger in ledgers:
    with ledger.open('a') as stream:
        stream.write('\n- ' + receipt['at'] + ' New frontend publisher inner/outer contract+phase and rollback recovery/source synthetic cases ' + receipt['result'] + ' ' + str(sum(r['pass'] for r in results)) + '/' + str(len(results)) + '; evidence ' + str(dest.relative_to(ROOT)) + ' SHA' + H(dest) + '; publisherSHA' + source_before + '. Valid frontend-only versus actual backend rollback tested for all3 clients; mismatch/missing bindings rejected. No old10/transport/product/browser/remote/provider/source-mutation rerun. Source/interface/fixture drift invalidates affected cases; all failures retained.\n')
print(json.dumps({'result': receipt['result'], 'cases': len(results), 'passed': sum(r['pass'] for r in results), 'receipt': str(dest), 'sha256': H(dest)}))
raise SystemExit(0 if receipt['result'].startswith('PASS') else 1)
