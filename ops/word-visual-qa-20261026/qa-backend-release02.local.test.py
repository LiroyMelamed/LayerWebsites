"""Local synthetic contract gate fixtures only; never SSH or release phases.

Run only by the coordinating root with the required ledger/evidence wrapper.
These fabricated envelopes are test inputs, never release approval artifacts.
"""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

FILE = Path(__file__).with_name('qa-backend-release02.py')
SPEC = importlib.util.spec_from_file_location('qa_backend_release02_under_test', FILE)
operator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(operator)


class EvidenceSealTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='qa-operator-seal-fixture-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.no_ssh = mock.patch.object(operator.subprocess, 'run', side_effect=AssertionError('NO_SUBPROCESS_OR_SSH_IN_LOCAL_FIXTURE'))
        self.runner = self.no_ssh.start()
        self.addCleanup(self.no_ssh.stop)

    def packet(self, change=None, duplicate=False):
        candidate, main = 'b'*40, 'c'*40
        hashes = {'backend/package.json':'1'*64, 'backend/package-lock.json':'2'*64,
                  'backend/migrations/'+operator.MIGRATION:'3'*64}
        baseline = {'source':{'head':operator.BASE,'branch':'DETACHED','trackedClean':True,
                             'backendFiles':{k:v for k,v in hashes.items() if '/migrations/' not in k}},
                    'pm2':{'own':{'name':'melamedia-api','pmId':5,'execMode':'fork_mode','instances':None,'watchExactlyFalse':True}},
                    'modes':{'effective':{key:{'enabled':False,'recognized':True} for key in ['MULTI_TENANT_MODE','TENANT_DB_ISOLATION_ENABLED']}},
                    'dependencies':{'files':{'pg/package.json':'4'*64}}}
        source = {'baseCommit':operator.BASE,'candidateCommit':candidate,'mainAncestor':main,'candidateBackendHashes':hashes,
                  'guardScriptSha256':'5'*64,'manifestSha256':'6'*64}
        front = {'src/synthetic-fixture.js':'7'*64}
        evidence = {
            'backend_tests':{'syntheticFixtureOnly':True},'frontend_tests':{'syntheticFixtureOnly':True},
            'frontend_build':{'result':'PASS_COMPILE_SOURCE_STABLE_REVIEW_ARTIFACT_NOT_PUBLISHED','candidateCommit':candidate,
                'headAtFinish':candidate,'tenant':'melamedia','exitCode':0,'sourceStable':True,'dependencyStable':True,
                'publicAssetsRestoredAfterBuild':True,'localPublicEnvironmentScratchRestored':True,'sourceDrift':[],
                'scratchRestoreDrift':[],'apiOrigin':'https://api-melamedia.mela-media.co.il/api','node':'v24.19.0','nodeAfter':'v24.19.0',
                'installedManifestSha256':'8'*64,'installedManifestSha256After':'8'*64,'sourceHashesBefore':front,'sourceHashesAfter':copy.deepcopy(front)},
            'source_qualification':{'result':'PASS_QA_SOURCE_AND_EVIDENCE_BINDING','candidateCommit':candidate,'mainCommit':main,
                'candidateBackendHashes':copy.deepcopy(hashes),'frontendSourceHashes':copy.deepcopy(front),
                'sourceClean':True,'backendEvidenceValid':True,'frontendEvidenceValid':True,'mainFirst':True},
            'independent_review':{'decision':'APPROVE','scope':'QA_ONLY_BACKEND_RELEASE',
                'operatorSha256':operator.sha(FILE.read_bytes()),'observerSha256':operator.OBSERVER_SHA}}
        c={'schema':1,'target':copy.deepcopy(operator.TARGET),'source':source,
           'migration':{'filename':operator.MIGRATION,'sha256':hashes['backend/migrations/'+operator.MIGRATION]},
           'baselineState':baseline,'baselineReceipt':{},'seal':{'status':'SEALED','operatorSha256':operator.sha(FILE.read_bytes()),
               'observerSha256':operator.OBSERVER_SHA,'candidateCommit':candidate,'evidenceBindings':[]}}
        if change:change(c,evidence)
        baseline_path=self.root/'synthetic-baseline.json'
        baseline_path.write_text(json.dumps({'observation':{'stateStable':True,'after':c['baselineState']}}))
        c['baselineReceipt']={'path':str(baseline_path),'sha256':operator.sha(baseline_path.read_bytes())}
        for kind,value in evidence.items():
            p=self.root/(kind+'.synthetic-fixture.json');p.write_text(json.dumps(value))
            c['seal']['evidenceBindings'].append({'kind':kind,'path':str(p),'sha256':operator.sha(p.read_bytes())})
        if duplicate:c['seal']['evidenceBindings'].append(copy.deepcopy(c['seal']['evidenceBindings'][2]))
        path=self.root/'synthetic-contract.json';path.write_text(json.dumps(c))
        return path

    def rejected(self, change=None, duplicate=False):
        with self.assertRaises(ValueError):operator.load_contract(self.packet(change,duplicate))
        self.runner.assert_not_called()

    def test_current_complete_synthetic_packet_is_accepted_locally(self):
        c,_=operator.load_contract(self.packet())
        self.assertEqual(c['source']['candidateCommit'],'b'*40)
        self.runner.assert_not_called()

    def test_hashed_failed_build_is_rejected(self):
        self.rejected(lambda c,e:e['frontend_build'].update(result='FAIL'))

    def test_stale_build_candidate_is_rejected(self):
        self.rejected(lambda c,e:e['frontend_build'].update(candidateCommit='a'*40))

    def test_build_finish_head_mismatch_is_rejected(self):
        self.rejected(lambda c,e:e['frontend_build'].update(headAtFinish='a'*40))

    def test_wrong_operator_approval_is_rejected(self):
        self.rejected(lambda c,e:e['independent_review'].update(operatorSha256='0'*64))

    def test_nonapproval_and_failed_source_qualification_are_rejected(self):
        self.rejected(lambda c,e:e['independent_review'].update(decision='REJECT'))
        self.rejected(lambda c,e:e['source_qualification'].update(backendEvidenceValid=False))

    def test_wrong_source_candidate_and_main_are_rejected(self):
        self.rejected(lambda c,e:e['source_qualification'].update(candidateCommit='a'*40))
        self.rejected(lambda c,e:e['source_qualification'].update(mainCommit='a'*40))

    def test_wrong_backend_or_frontend_source_map_is_rejected(self):
        self.rejected(lambda c,e:e['source_qualification']['candidateBackendHashes'].update({'backend/package.json':'0'*64}))
        self.rejected(lambda c,e:e['source_qualification']['frontendSourceHashes'].update({'src/synthetic-fixture.js':'0'*64}))

    def test_duplicate_mandatory_kind_is_rejected(self):
        self.rejected(duplicate=True)

    def test_wrong_build_origin_or_runtime_is_rejected(self):
        self.rejected(lambda c,e:e['frontend_build'].update(apiOrigin='https://example.invalid/api'))
        self.rejected(lambda c,e:e['frontend_build'].update(nodeAfter='v22.23.2'))

    def test_dirty_scratch_or_drifting_build_is_rejected(self):
        self.rejected(lambda c,e:e['frontend_build'].update(localPublicEnvironmentScratchRestored=False))
        self.rejected(lambda c,e:e['frontend_build']['sourceHashesAfter'].update({'src/synthetic-fixture.js':'0'*64}))

    def test_wrong_target_fails_before_any_subprocess(self):
        self.rejected(lambda c,e:c['target'].update(root='/root/LayerWebsites'))


if __name__=='__main__':unittest.main()
