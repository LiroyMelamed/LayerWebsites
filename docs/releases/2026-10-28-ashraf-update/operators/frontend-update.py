import base64,datetime,fcntl,hashlib,json,os,shutil,tarfile,time,signal
from pathlib import Path
os.umask(0o022)
locks=[]
for name in ['melamedia-release-maintenance','melamedia-legal-ashrafessa-release']:
 fd=os.open('/run/lock/'+name+'.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
 def expired(signum,frame):raise TimeoutError('Maintenance lock still busy; no publication')
 signal.signal(signal.SIGALRM,expired);signal.alarm(45)
 try:fcntl.flock(fd,fcntl.LOCK_EX)
 finally:signal.alarm(0)
 locks.append(fd)
root=Path('/var/www/ashrafessa');assert root.is_dir() and not root.is_symlink()
sha=lambda b:hashlib.sha256(b).hexdigest()
old=(root/'index.html').read_bytes();oldmanifest=(root/'asset-manifest.json').read_bytes();newmanifest=base64.b64decode(MANIFEST)
merged,proof=merge_index(old,json.loads(oldmanifest),json.loads(newmanifest))
assert 'static/js/main.0fd18d40.js' in old.decode()
protected={str(p.relative_to(root)):sha(p.read_bytes()) for p in root.rglob('*') if p.is_file() and not p.is_symlink() and str(p.relative_to(root)) not in ['index.html','asset-manifest.json'] and not str(p.relative_to(root)).startswith('static/')}
receipt={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidate':'87e8eaa58830ee9b42772c1619e01814143dc28e','result':'FRONTEND_PREFLIGHT_NO_PUBLICATION','merge':proof,'protectedRootAssets':protected,'manifestOldHash':sha(oldmanifest)}
if MODE=='apply':
 archive=Path('/tmp/ashraf-update-static-20261028.tar.gz');assert sha(archive.read_bytes())==ARCHIVE_SHA
 check=Path('/var/lib/melamedia-releases/ashraf-update-20261028');check.mkdir(mode=0o700,parents=True,exist_ok=False)
 (check/'index.before.html').write_bytes(old);(check/'asset-manifest.before.json').write_bytes(oldmanifest);(check/'before.json').write_text(json.dumps(receipt))
 oldstatic={str(p.relative_to(root)):sha(p.read_bytes()) for p in (root/'static').rglob('*') if p.is_file()}
 with tarfile.open(archive,'r:gz') as tar:
  members=tar.getmembers();assert len(members)==len(FILES)
  for member in members:
   assert member.isfile() and member.name.startswith('static/') and '..' not in Path(member.name).parts and member.name in FILES
   content=tar.extractfile(member).read();assert sha(content)==FILES[member.name]
   target=root/member.name
   if target.exists():assert target.is_file() and not target.is_symlink() and sha(target.read_bytes())==FILES[member.name]
   else:
    target.parent.mkdir(parents=True,exist_ok=True);tmp=target.with_name(target.name+'.ashraf-update-tmp');tmp.write_bytes(content);tmp.chmod(0o644);os.replace(tmp,target)
 assert all(sha((root/p).read_bytes())==h for p,h in FILES.items())
 assert all(sha((root/p).read_bytes())==h for p,h in oldstatic.items())
 for name,content in [('asset-manifest.json',newmanifest),('index.html',merged)]:
  tmp=root/(name+'.ashraf-update-tmp');tmp.write_bytes(content);tmp.chmod(0o644);os.replace(tmp,root/name)
 assert sha((root/'index.html').read_bytes())==proof['newIndexSha256']
 assert all(sha((root/p).read_bytes())==h for p,h in protected.items())
 receipt.update(result='FRONTEND_PUBLISHED_STATIC_VERIFIED',addedStaticCount=len(FILES),oldChunksPreserved=True,rootAssetsPreserved=True,checkpoint=str(check))
 (check/'after.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt))
