#!/usr/bin/env python3
"""Construct new local delivery refs from clean cutoff parents; never move QA refs.

Only Git object/index/ref operations are performed. Product inputs must exactly
match the already-qualified source. No app, provider, database or network starts.
"""
from pathlib import Path
import argparse, hashlib, json, os, re, subprocess, tempfile

P=argparse.ArgumentParser()
P.add_argument('--repo',type=Path,required=True)
P.add_argument('--audit-head',required=True)
P.add_argument('--output',type=Path,required=True)
P.add_argument('--dry-run',action='store_true')
a=P.parse_args(); ROOT=a.repo.resolve(); AUDIT=a.audit_head
SCOPE='docs/releases/card-save-billing-20261101/'
GUARD=SCOPE+'comprehensive-qa/offline-network-guard.cjs'
CASES=[
 ('Melamedia','545779e4b99e111959f4684167dfdf46da1f3186','efe1ee371ad96bc76963ac1848076055cb83066b','melamedia'),
 ('AshrafEssa','3359e65cdc082dbc50c30a0e1bd7284df854cf06','9eaebbdb6c23d56d974546e233b8905d19570ef5','ashraf'),
 ('MorLevi','586f93e5ac5148ba5ec0059cb5430ebbc4e92e6c','b05d66f9f7873753e520c554f4b2c1c540e6682b','mor'),
 ('MelamedLaw','d6ef0c9a6aaa2f7f53b8b501575b973e0ffff092','21d51f5766e5df0b0ac497fce4cc9d16bdd8bbf5','melamed'),
]
def git(*args,env=None,check=True,input=None):
 return subprocess.run(['git',*args],cwd=ROOT,env=env,input=input,text=True,capture_output=True,check=check)
def val(*args):return git(*args).stdout.strip()
def inputs(ref):
 rows=[]
 for item in git('ls-tree','-r','-z',ref).stdout.split('\0'):
  if not item:continue
  mode,kind,rest=item.split(' ',2);oid,path=rest.split('\t',1)
  if not path.startswith(SCOPE) or path==GUARD:rows.append([path,mode,kind,oid])
 return rows
def digest(rows):return hashlib.sha256(json.dumps(rows,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
assert val('rev-parse',AUDIT)==AUDIT
assert git('merge-base','--is-ancestor','6a3bd299227291feb0065ae3afa89a1f3ba2967a',AUDIT,check=False).returncode==0
result={'commonAuditHead':AUDIT,'commonQualifiedRuntime':'6a3bd299227291feb0065ae3afa89a1f3ba2967a','cutoffMain':'074df7520497a0cd6bd95ad70353201c905f0aa6','productComparisonExcludesOnly':SCOPE,'explicitIncludedAuditInput':GUARD,'execution':'No application/test/build execution is claimed on delivery commits; exact tracked input equality carries actual qualified receipts.','targets':[]}
for tenant,base,tested,key in CASES:
 assert git('merge-base','--is-ancestor',base,tested,check=False).returncode==0
 assert git('merge-base','--is-ancestor','6a3bd299227291feb0065ae3afa89a1f3ba2967a',tested,check=False).returncode==0
 ref='refs/heads/codex/billing-delivery-'+key+'-20261101'
 assert git('show-ref','--verify','--quiet',ref,check=False).returncode!=0, 'Ref already exists; never overwrite '+ref
 merged=git('merge-tree','--write-tree',base,AUDIT,check=False)
 assert merged.returncode in (0,1),merged.stderr
 tree=merged.stdout.splitlines()[0];assert re.fullmatch('[0-9a-f]{40}',tree)
 conflicts=sorted(set(re.findall(r'^\d{6} [0-9a-f]{40} [123]\t(.+)$',merged.stdout,re.M)))
 resolved=[]
 if merged.returncode:
  expected=['frontend/src/i18n/locales/'+x+'.json'for x in ['ar','en','he']]
  assert tenant=='MelamedLaw' and conflicts==expected, (tenant,conflicts)
  with tempfile.TemporaryDirectory(prefix='billing-delivery-index-')as d:
   env={**os.environ,'GIT_INDEX_FILE':str(Path(d)/'index')}
   git('read-tree',tree,env=env)
   for path in expected:
    blob=val('rev-parse',tested+':'+path)
    git('update-index','--add','--cacheinfo','100644',blob,path,env=env)
    resolved.append({'path':path,'source':tested,'blob':blob})
   tree=git('write-tree',env=env).stdout.strip()
 old,new=inputs(tested),inputs(tree)
 assert old==new, (tenant,'Product/code/config/test/other-doc input mismatch')
 message='Merge qualified billing release into clean '+tenant+' delivery candidate\n\nSource inputs exactly match qualified runtime '+tested+'.\nOnly sanitized release evidence is imported; existing local QA branches stay intact.\nNo push, deployment, provider or customer operation is performed.\n'
 commit=None
 if not a.dry_run:
  commit=git('commit-tree',tree,'-p',base,'-p',AUDIT,input=message).stdout.strip()
  git('update-ref',ref,commit,'0'*40)
  assert inputs(commit)==old
 result['targets'].append({'target':tenant,'deliveryRef':ref,'deliveryCommit':commit,'deliveryTree':tree,'upstreamClientCutoff':base,'actualQualifiedRuntime':tested,'productInputsEqual':True,'trackedProductInputCount':len(old),'inputManifestSha256':digest(old),'qualifiedInputManifestSha256':digest(new),'localeResolutionsFromTestedBlobs':resolved,'parents':[base,AUDIT]})
 print(tenant,ref,commit,flush=True)
a.output.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
