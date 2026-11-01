"""Read existing retention reports/directory metadata; never inspect archive payloads."""
import concurrent.futures
import datetime
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('existing_readiness', HERE / 'collect-readiness.py')
existing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(existing)
BODY = r'''
ALIASES={'MelamedLaw':('melamedlaw','melamed'),'MorLevi':('morlevi','morlevy'),'AshrafEssa':('ashrafessa','ashraf'),'Melamedia':('melamedia',)}
LOCKS={'MelamedLaw':'melamedlaw','MorLevi':'morlevy','AshrafEssa':'ashrafessa','Melamedia':'melamedia'}
def target_of(name):
 s=str(name).lower()
 return [t for t,a in ALIASES.items() if any(x in s for x in a)]
out={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Existing last-run/last-status report and bounded checkpoint directory-entry/stat metadata only; no payload read, inventory job, backup or restore','targets':{},'mutations':0,'archivePayloadReads':0}
for t in ALIASES:
 try:lock('melamedia-legal-'+LOCKS[t]+'-release');out['targets'][t]={'lockStatus':'EXISTING_SHARED_LOCK','candidateDirectoryCount':0,'metadataEntries':[]}
 except (FileNotFoundError,BlockingIOError):out['targets'][t]={'lockStatus':'DEFERRED_EXISTING_TENANT_LOCK'}
state=Path('/var/lib/melamedia-release-cleaner')
for filename in ['last-status.json','last-run.json']:
 p=state/filename
 if not p.is_file():out[filename]={'status':'MISSING_EXISTING_REPORT'};continue
 raw=p.read_bytes();d=json.loads(raw)
 row={'status':'EXISTING_REPORT_READ_ONLY','reportSha256':hashlib.sha256(raw).hexdigest()}
 for k in ['utc','createdAt','completedAt','mode','healthy','status']:
  if k in d:row[k]=d[k]
 keep=d.get('protected',{})
 row['targetProtectedMetadata']={t:{'entries':sum(t in target_of(p) for p in keep),'rollbackReserveReasonCount':sum(t in target_of(p) and reason=='rollback-reserve' for p,reason in keep.items())} for t in ALIASES}
 row['targetHeldProjects']=[{k:v for k,v in h.items() if k in ['project','reason','available']} for h in d.get('heldProjects',[]) if target_of(h.get('project',''))]
 out[filename]=row
for root in [Path('/var/lib/melamedia-releases'),Path('/root/customer-release-backups')]:
 if not root.is_dir() or root.is_symlink():continue
 entries=sorted((p for p in root.iterdir() if p.is_dir() and not p.is_symlink()),key=lambda p:p.stat().st_mtime,reverse=True)[:50]
 for parent in entries:
  candidates=[parent]
  # Historical legal-release containers can contain a direct per-tenant child.
  if parent.name.startswith('legal-release-'):
   candidates.extend(p for p in parent.iterdir() if p.is_dir() and not p.is_symlink())
  for p in candidates:
   for target in target_of(p.name):
    t=out['targets'][target]
    if t['lockStatus']!='EXISTING_SHARED_LOCK':continue
    child=list(p.iterdir())
    t['candidateDirectoryCount']+=1
    t['metadataEntries'].append({'directoryNameSha256':hashlib.sha256(p.name.encode()).hexdigest(),'mtimeUtc':datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc).isoformat(),'directEntries':len(child),'directArchiveFiles':sum(x.is_file() and not x.is_symlink() and any(x.name.endswith(s) for s in ['.dump','.tar','.tar.gz','.tgz','.zip','.cms']) for x in child)})
for t in out['targets'].values():
 t['completeInactiveRollbackCount']=None;t['status']='HOLD_COMPLETE_INACTIVE_ROLLBACKS_NOT_CERTIFIED'
out['newReadback']=False;out['restoreExecuted']=False
print(json.dumps(out))
'''

def main():
    result = {'startedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {pool.submit(existing.remote, host, existing.COMMON + BODY): label
                for label, host in [('backend', '37.60.230.148'), ('frontend', '84.46.253.85')]}
        for job in concurrent.futures.as_completed(jobs):
            result[jobs[job]] = job.result()
    result['completedAtUtc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (HERE / 'retention-readiness.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: {'sshExit': v.get('sshExit'), 'targets': {t: {x: y for x, y in r.items() if x != 'metadataEntries'} for t, r in v.get('targets', {}).items()}, 'last-run.json': v.get('last-run.json')} for k, v in result.items() if isinstance(v, dict)}, indent=2))

if __name__ == '__main__':
    main()
