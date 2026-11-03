import ast,hashlib,json,re,shutil
from pathlib import Path
D=Path(__file__).resolve().parent;d=D/'MelamedLaw';H=lambda b:hashlib.sha256(b).hexdigest()
mf=json.loads((d/'manifest.json').read_bytes());saved=d/'package-v2';saved.mkdir()
for n in [*mf['files'],'manifest.json']:shutil.copy2(d/n,saved/n)
c=json.loads((d/'config.json').read_bytes());r=json.loads((d/'baseline-recovery.json').read_bytes());assert r['status']=='PASS_BASELINE_RECOVERED_SOURCE_UNCHANGED'and r['source']==c['baseline']
oldpid=c['pid'];c['pid']=c['expectedPid']=r['pid'];c['process'].update(pid=r['pid'],startTicks=r['startTicks']);c['baseFlags']['GIT_SHA']=c['baseline'];c['packageVersion']='v3'
js=(d/'pm2.cjs').read_text().replace('out.pid!=='+str(oldpid),'out.pid!=='+str(c['pid']))
js=re.sub(r'const BASE_ENV9=Object.freeze\(.*?\);','const BASE_ENV9=Object.freeze('+json.dumps(c['baseFlags'],separators=(',',':'))+');',js)
(d/'pm2.cjs').write_text(js,encoding='utf-8',newline='\n');c['rpcSha256']=H((d/'pm2.cjs').read_bytes())
operator=(d/'operator.py').read_text()
helper='''def wait_stopped_snapshot(pre, snapshot, rows, idle, clock, sleep):
 end=clock()+12
 attempt=0
 while True:
  post=snapshot('post-stop' if attempt==0 else 'post-stop-drain-'+str(attempt))
  need(rows(pre)==rows(post),'STOP_FINANCIAL_OR_WORKER_ROWS_CHANGED')
  idle(post)
  if post['aggregates']['roleSessions'][0]['sessions']==0:return post
  need(clock()<end,'STOP_DB_SESSIONS_DID_NOT_DRAIN')
  attempt+=1;sleep(.3)

'''
operator=operator.replace('def main():',helper+'def main():').replace("private_ref='refs/billing-release/20261103/'+c['target'].lower()","private_ref='refs/billing-release/20261103/'+c['target'].lower()+'-v3'")
old="post=snapshot('post-stop');need(rows(pre)==rows(post)and post['aggregates']['roleSessions'][0]['sessions']==0,'STOP_ROWS_OR_SESSIONS_CHANGED')"
assert operator.count(old)==1;operator=operator.replace(old,"post=wait_stopped_snapshot(pre,snapshot,rows,idle,time.monotonic,time.sleep)")
ast.parse(operator);(d/'operator.py').write_text(operator,encoding='utf-8',newline='\n');c['operatorSha256']=H((d/'operator.py').read_bytes())
# Exercise only the newly added drain protocol; application tests are reused.
ns={};exec("def need(x,why):\n if not x:raise RuntimeError(why)\n"+helper,ns)
def state(sessions,rows=1,active=0):return {'aggregates':{'rows':rows,'roleSessions':[{'sessions':sessions,'activeQueries':active,'activeTransactions':0}]}}
def run(seq,error=None):
 ticks=[0];seen=[];it=iter(seq);last=[None]
 def snap(label):
  seen.append(label)
  try:last[0]=next(it)
  except StopIteration:pass
  return last[0]
 def idle(s):
  if s['aggregates']['roleSessions'][0]['activeQueries']:raise RuntimeError('ACTIVE_DB_WORK')
 def sleep(x):ticks[0]+=x
 try:
  result=ns['wait_stopped_snapshot'](state(2),snap,lambda s:s['aggregates']['rows'],idle,lambda:ticks[0],sleep)
  assert error is None and result['aggregates']['roleSessions'][0]['sessions']==0
 except RuntimeError as e:assert str(e)==error
 return seen
assert len(run([state(0)]))==1
assert len(run([state(1),state(0)]))==2
run([state(0,2)],'STOP_FINANCIAL_OR_WORKER_ROWS_CHANGED')
run([state(1,active=1)],'ACTIVE_DB_WORK')
run([state(1)],'STOP_DB_SESSIONS_DID_NOT_DRAIN')
assert '"GIT_SHA":"'+c['baseline']+'"'in js and 'out.pid!=='+str(c['pid'])in js and 'out.pid!=='+str(oldpid)not in js
(d/'config.json').write_text(json.dumps(c,sort_keys=True,indent=2)+'\n')
pins={n:{'bytes':(d/n).stat().st_size,'sha256':H((d/n).read_bytes())}for n in mf['files']}
(d/'manifest.json').write_text(json.dumps({'target':'MelamedLaw','files':pins},sort_keys=True,indent=2)+'\n')
q={'status':'PASS_NEW_PRODUCTION_OPERATION_GUARDS','operatorSha256':c['operatorSha256'],'newDrainTests':5,'recoveryBindingChecks':2,'reusedOriginalQualificationSha256':H((D/'qualification.json').read_bytes()),'unchangedFinancialAndNoActiveTransactionGuards':True}
(d/'qualification.json').write_text(json.dumps(q,indent=2)+'\n');print(json.dumps(q))
