from pathlib import Path
import ast,subprocess,json,hashlib,shlex,datetime
b=Path('/tmp/layer-billing-sql-qa-proposal-20261102')
meta=json.loads((b/'final-package-v3.json').read_text())
archive=b/meta['archive'];data=archive.read_bytes()
assert hashlib.sha256(data).hexdigest()==meta['archiveSha256']
source=(b/'stage_qa_sql_payload-v3.py').read_text();ast.parse(source)
(b/'executed-staging-source-v3.py').write_text(source)
cmd='/usr/bin/python3 -I -S -c '+shlex.quote(source)+' --approved-staging'
r={'startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'archiveSha256':meta['archiveSha256'],'stagingSourceSha256':hashlib.sha256(source.encode()).hexdigest()}
try:
 p=subprocess.run(['ssh','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no','-o','ConnectTimeout=10','root@37.60.230.148',cmd],input=data,capture_output=True,timeout=120)
 r.update(sshExit=p.returncode,stderrBytes=len(p.stderr))
 try:r['remote']=json.loads(p.stdout)
 except ValueError:r.update(status='UNSTRUCTURED_RESPONSE_INSPECT_REMOTE_BEFORE_RETRY',stdoutBytes=len(p.stdout))
except subprocess.TimeoutExpired:r['status']='UNCERTAIN_TIMEOUT_INSPECT_REMOTE_BEFORE_RETRY'
r['finishedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(b/'approved-staging-result-v3.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r))
