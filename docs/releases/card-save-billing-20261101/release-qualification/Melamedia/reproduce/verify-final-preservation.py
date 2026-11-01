#!/usr/bin/env python3
import argparse,datetime,hashlib,json,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,required=True);p.add_argument('--tenant',choices=['Melamedia','MelamedLaw'],required=True);a=p.parse_args();r=a.repo.resolve();o=r/'docs/releases/card-save-billing-20261101/release-qualification'/a.tenant
base={'Melamedia':'545779e4b99e111959f4684167dfdf46da1f3186','MelamedLaw':'d6ef0c9a6aaa2f7f53b8b501575b973e0ffff092'}[a.tenant];main='074df7520497a0cd6bd95ad70353201c905f0aa6';donor='6a3bd299227291feb0065ae3afa89a1f3ba2967a';originalMain='9f01a42dcf85ec36a1e4a6d980c86f44e1eab5e9';previous=json.load((o/'pinned-6fab/preservation.json').open())
sha=lambda b:hashlib.sha256(b).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=r)
head=git('rev-parse','HEAD').decode().strip();preservation=[]
for old in previous['preservedPaths']:
 f=old['path'];expected=sha(git('show',base+':'+f));actual=sha((r/f).read_bytes());preservation.append({'path':f,'currentClientBaselineSha256':expected,'actualSha256':actual,'preserved':expected==actual,'originalPreparationSha256':old['originalPreparationSha256']})
rows=[]
for f in git('diff','--name-only',originalMain,donor,'--','backend','frontend').decode().splitlines():
 expected=git('show',donor+':'+f);actual=(r/f).read_bytes();row={'path':f,'donorSha256':sha(expected),'candidateSha256':sha(actual),'exactBytesMatch':expected==actual}
 if '/i18n/locales/'in f:
  old=json.loads(git('show',base+':'+f));merged=json.loads(actual);new=merged['billing'].pop('paymentUnconfirmed');row.update({'allBaseClientValuesPreserved':merged==old,'addedKey':'billing.paymentUnconfirmed','addedValueMatchesDonor':new==json.loads(expected)['billing']['paymentUnconfirmed']});assert row['allBaseClientValuesPreserved']and row['addedValueMatchesDonor']
 else:assert row['exactBytesMatch']
 rows.append(row)
delta=[]
for f in git('diff','--name-only',originalMain,main).decode().splitlines():
 expected=sha(git('show',main+':'+f));baseline=sha(git('show',base+':'+f));actual=sha((r/f).read_bytes());row={'path':f,'currentSharedMainSha256':expected,'currentClientBaselineSha256':baseline,'actualSha256':actual,'matchesCurrentSharedMain':expected==actual,'currentClientBaselinePreserved':baseline==actual};assert row['matchesCurrentSharedMain']and row['currentClientBaselinePreserved'];delta.append(row)
ancestry={label:subprocess.run(['git','merge-base','--is-ancestor',ref,'HEAD'],cwd=r).returncode==0 for label,ref in [('cutoffClientBaseline',base),('cutoffSharedMain',main),('cutoffDonor',donor)]};assert all(ancestry.values())and all(x['preserved']for x in preservation)
result={'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tenant':a.tenant,'runtimeCandidate':head,'cutoffSharedMain':main,'cutoffClientBaseline':base,'cutoffDonor':donor,'initialClientBaseline':previous['initialClientBaseline'],'ancestry':ancestry,'preservedPaths':preservation,'preservedPathCount':len(preservation),'donorChangedPaths':rows,'donorChangedPathCount':len(rows),'allDonorNonLocaleRuntimeTestFrontendPathsExact':True,'allClientLocaleValuesPreserved':True,'cutoffSharedMainDelta':delta,'allCutoffSharedMainDeltaPathsMatch':True,'cutoffPolicy':'Any later remote movement is a release hold, not covered by these receipts. No further ref chasing.','ownerWaivedPeriods':'Owner-waived periods were preserved; customer-specific evidence stays private outside Git.','noCustomerDataProviderOrLiveAccess':True};(o/'preservation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'tenant':a.tenant,'runtime':head,'preserved':len(preservation),'donorPaths':len(rows),'currentClientMainDelta':len(delta),'allAncestors':ancestry}))
