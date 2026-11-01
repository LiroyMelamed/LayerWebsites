#!/usr/bin/python3
"""Linux kernel/process fixtures. No systemd, real converter, DB or provider.

All resource names, processes and files are generated below a unique owned temp
directory. Tests import the real wrapper; only the resource inspector/inner are
synthetic. The CLI refuses an existing/non-owned or non-fixture directory.
"""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest

SOURCE = Path(__file__).with_name('managed-admission.py')


def load():
    spec = importlib.util.spec_from_file_location('admission', SOURCE)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def inspect_fake(config):
    if (config.private / 'unobservable').exists():
        raise ValueError('UNOBSERVABLE_FIXTURE')
    return {p.name for p in (config.private / 'units').iterdir()}, {p.name for p in (config.private / 'jobs').iterdir()}


def configuration(root):
    m = load()
    return m.Config(root / 'state', root / 'private', root / 'inner.py',
        hashlib.sha256((root / 'inner.py').read_bytes()).hexdigest(), owner=os.geteuid(),
        deadline=2.5, inspector=inspect_fake)


INNER = r'''#!/usr/bin/python3
import json,os,signal,subprocess,sys,time,uuid
from pathlib import Path
root=Path(__file__).parent;private=root/'private';name=uuid.uuid4().hex
stage=private/'jobs'/name;stage.mkdir(mode=0o700)
unit='melamedia-qa-word-'+uuid.uuid4().hex+'.service';marker=private/'units'/unit;marker.touch()
report=private/('active-'+str(os.getpid())+'.json')
report.write_text(json.dumps({'unit':unit,'stageId':name,'reaperUnit':'melamedia-qa-word-reap-'+name,'reaperMaxDelaySeconds':72,'mode':'convert'}));report.chmod(0o600)
(root/('trace-'+name+'.json')).write_text(json.dumps({'args':sys.argv[1:],'pid':os.getpid(),'unit':unit,'stageId':name}))
delay=2.2 if sys.argv[1]=='two' else 1.3
reaper="import time,shutil;from pathlib import Path;time.sleep("+str(delay)+");p=Path("+repr(str(marker))+");p.unlink(missing_ok=True);shutil.rmtree("+repr(str(stage))+",ignore_errors=True)"
subprocess.Popen(['/usr/bin/python3','-c',reaper],start_new_session=True,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
cancelled=False
def cancel(*a):
 global cancelled
 cancelled=True
signal.signal(signal.SIGTERM,cancel)
started=time.monotonic()
while not (root/sys.argv[1]).exists() and not cancelled and time.monotonic()-started<6:time.sleep(.01)
if cancelled:time.sleep(.2)
marker.unlink(missing_ok=True)
stage.rmdir() if stage.exists() else None
report.unlink(missing_ok=True)
sys.exit(1 if cancelled else 0)
'''


class Admission(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='legal-word-admission-fixture-', dir=BASE))
        for relative in ('state', 'private', 'private/units', 'private/jobs'):
            (self.root / relative).mkdir(mode=0o700)
        (self.root / 'inner.py').write_text(INNER)
        (self.root / 'inner.py').chmod(0o700)
        self.children = []

    def tearDown(self):
        # Only exact fixture-created processes. Never discover/kill by name.
        for p in self.children:
            if p.poll() is None:
                p.terminate()
        for p in self.children:
            try:
                p.wait(timeout=4)
            except subprocess.TimeoutExpired:
                p.kill(); p.wait()
            p.stdout.close(); p.stderr.close()
        for report in (self.root / 'state').glob('slot-*.json'):
            value = json.loads(report.read_text())
            for key in ('innerPid', 'guardianPid'):
                if key in value:
                    try:
                        os.kill(value[key], signal.SIGKILL)
                    except ProcessLookupError:
                        pass
        # Independent fake reapers live at most2.2s; avoid deleting their root
        # before they have completed. No production resources are referenced.
        time.sleep(2.3)
        shutil.rmtree(self.root)

    def start(self, release='release'):
        p = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), 'child', str(self.root), release],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        self.children.append(p)
        return p

    def busy(self):
        p = self.start('never')
        self.assertEqual(p.wait(timeout=1), 75)

    def reports(self, count):
        end = time.monotonic() + 2
        while time.monotonic() < end:
            reports = [json.loads(p.read_text()) for p in (self.root / 'state').glob('slot-*.json')]
            if len(reports) == count and all('unit' in p for p in reports):
                return sorted(reports, key=lambda p: p['slot'])
            time.sleep(.01)
        self.fail('bounded fixture startup did not expose actual unit/stage')

    def released(self):
        end = time.monotonic() + 4
        while time.monotonic() < end:
            if not list((self.root / 'private/jobs').iterdir()) and not list((self.root / 'private/units').iterdir()):
                return
            time.sleep(.02)
        self.fail('bounded fake reaper did not finish')

    def test_two_slots_busy_then_normal_release_and_persistent_inodes(self):
        one = self.start('release-one'); self.reports(1)
        two = self.start('release-two')
        self.reports(2)
        inodes = {p.name:p.stat().st_ino for p in (self.root / 'state').glob('*.lock')}
        self.busy()
        self.assertEqual(len(list(self.root.glob('trace-*.json'))), 2)
        (self.root / 'release-one').touch(); (self.root / 'release-two').touch()
        self.assertEqual(one.wait(timeout=3), 0); self.assertEqual(two.wait(timeout=3), 0)
        third = self.start('release-one'); self.assertEqual(third.wait(timeout=2), 0)
        self.assertEqual(inodes, {p.name:p.stat().st_ino for p in (self.root / 'state').glob('*.lock')})
        traces = [json.loads(p.read_text()) for p in self.root.glob('trace-*.json')]
        self.assertEqual(sorted(p['args'] for p in traces), [['release-one'], ['release-one'], ['release-two']])

    def test_caller_sigkill_keeps_lease_until_inner_cleanup(self):
        one = self.start('one'); self.reports(1)
        two = self.start('two'); rows = self.reports(2)
        os.killpg(one.pid, signal.SIGKILL); one.wait(timeout=1)
        self.busy()
        (self.root / 'two').touch(); self.assertEqual(two.wait(timeout=3), 0)
        self.released()
        # Caller death closes the socket; detached guardian lets the incumbent
        # TERM handler finish and removes only its exact resource journal.
        end=time.monotonic()+2
        while list((self.root/'state').glob('slot-*.json')) and time.monotonic()<end:time.sleep(.02)
        self.assertEqual(list((self.root/'state').glob('slot-*.json')), [])

    def test_guardian_crash_inherited_kernel_lease_and_all_holder_crash_journal(self):
        one = self.start('one'); self.reports(1)
        two = self.start('two'); rows = self.reports(2); first = rows[0]
        os.kill(first['guardianPid'], signal.SIGKILL)
        self.assertEqual(one.wait(timeout=1), 75)
        self.busy()  # inner coordinator still inherits the slot's flock FD
        os.kill(first['innerPid'], signal.SIGKILL)
        self.busy()  # fd is now free, but exact stage/unit are still alive
        # Reaper completes slot0 while legitimate slot1 continues. Reuse the
        # exact cleaned slot, without requiring slot1 to become idle.
        end=time.monotonic()+3
        while (self.root/'private/jobs'/first['stageId']).exists() and time.monotonic()<end:time.sleep(.02)
        self.assertTrue((self.root/'private/jobs'/rows[1]['stageId']).exists(), 'other slot must still own live resources')
        (self.root/'new').touch(); three=self.start('new')
        self.assertEqual(three.wait(timeout=2),0)
        (self.root/'two').touch();self.assertEqual(two.wait(timeout=3),0)

    def test_malformed_journal_symlink_and_unobservable_resources_fail_closed(self):
        cfg=configuration(self.root); m=load()
        (cfg.state/'slot-0.json').write_text('{broken');(cfg.state/'slot-0.json').chmod(0o600)
        self.assertEqual(m.run(cfg, ['unused']),75)
        (cfg.state/'slot-0.json').unlink()
        (cfg.state/'coordinator.lock').unlink()
        (cfg.state/'coordinator.lock').symlink_to(self.root/'inner.py')
        self.assertEqual(m.run(cfg, ['unused']),75)
        (cfg.state/'coordinator.lock').unlink()
        (cfg.private/'unobservable').touch()
        self.assertEqual(m.run(cfg, ['unused']),75)
        self.assertEqual(list(self.root.glob('trace-*.json')),[])

    def test_changed_inner_hash_never_executes(self):
        cfg=configuration(self.root);(self.root/'inner.py').write_text(INNER+'\n# drift\n')
        self.assertEqual(load().run(cfg,['unused']),75)
        self.assertEqual(list(self.root.glob('trace-*.json')),[])

    def test_unaccounted_resource_is_not_reclaimed_or_deleted(self):
        stage=self.root/'private/jobs'/('a'*32);stage.mkdir()
        self.busy();self.assertTrue(stage.is_dir())
        self.assertEqual(list(self.root.glob('trace-*.json')),[])

    def test_bounded_guardian_retains_uncertain_journal(self):
        # The fake inspector becomes unavailable while the job is running.
        p=self.start('never');self.reports(1);(self.root/'private/unobservable').touch()
        self.assertEqual(p.wait(timeout=4),75)
        self.assertTrue(list((self.root/'state').glob('slot-*.json')))
        self.busy()


if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='child':
        root=Path(sys.argv[2]);sys.exit(load().run(configuration(root),sys.argv[3:]))
    if sys.platform!='linux':raise SystemExit('Linux fixture target required')
    if len(sys.argv)!=2:raise SystemExit('Unique existing owned fixture parent required')
    BASE=Path(sys.argv.pop())
    if (not BASE.name.startswith('legal-word-admission-fixture-') or BASE.resolve()!=BASE
            or BASE.stat().st_uid!=os.geteuid() or BASE.stat().st_mode&0o077):
        raise SystemExit('Owned fixture path required')
    unittest.main(verbosity=2)
