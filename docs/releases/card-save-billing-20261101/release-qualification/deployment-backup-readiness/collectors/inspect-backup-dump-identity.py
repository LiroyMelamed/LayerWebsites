"""Read installed producer source only; no database connection/export or new access."""
from pathlib import Path
import datetime,json,subprocess
R=Path(__file__).parent
CODE=r'''
import ast,datetime,fcntl,hashlib,json,os
from pathlib import Path
fds=[]
for name in ['melamedia-release-maintenance','melamedia-legal-melamedia-release']:
 fd=os.open('/run/lock/'+name+'.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_SH|fcntl.LOCK_NB);fds.append(fd)
p=Path('/usr/local/sbin/melamedia-server-backup.py');raw=p.read_bytes();digest=hashlib.sha256(raw).hexdigest();expected='085b3d946f475d1ad8ebd78f60aed389d6fea661963e34389b8991d339b2d160'
if digest!=expected:print(json.dumps({'result':'HOLD_INSTALLED_SOURCE_DRIFT','sha256':digest}));raise SystemExit
root=ast.parse(raw);rows=[]
def fmt(n):
 if isinstance(n,ast.Constant)and isinstance(n.value,str):
  if n.value in ['runuser','sudo','-u','postgres','--','pg_dump','-Fc','--dbname','--format=custom','--schema-only','--no-owner','--no-privileges','--no-acl']or n.value.startswith('--lock-wait-timeout='):return n.value
  return '<literal-redacted>'
 if isinstance(n,ast.Subscript)and isinstance(n.value,ast.Name)and n.value.id=='project'and isinstance(n.slice,ast.Constant)and n.slice.value=='database':return '<configured project database>'
 return '<dynamic-source-expression>'
for n in ast.walk(root):
 if isinstance(n,ast.List)and any(isinstance(x,ast.Constant)and x.value=='pg_dump'for x in n.elts):rows.append({'line':n.lineno,'commandStructure':[fmt(x)for x in n.elts]})
print(json.dumps({'result':'PASS_SOURCE_ONLY_IDENTITY_INSPECTION','capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourcePath':str(p),'sourceSha256':digest,'pgDumpCommandStructures':rows,'dbConnections':0,'exports':0,'envValuesRead':False,'roleOrGrantChanges':0,'sourceOnlyNotExportAuthorization':True}))
'''
p=subprocess.run(['ssh','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','root@37.60.230.148','python3 -'],input=CODE,capture_output=True,text=True,timeout=50)
try:d=json.loads(p.stdout)
except ValueError:d={'result':'HOLD_UNSTRUCTURED_SOURCE_INSPECTION','stdoutBytes':len(p.stdout),'stderrBytes':len(p.stderr)}
d['sshExit']=p.returncode;(R/'private/backup-dump-identity.json').write_text(json.dumps(d,indent=2)+'\n');(R/'private/backup-dump-identity.json').chmod(0o600);print(json.dumps(d,indent=2))
