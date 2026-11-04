#!/usr/bin/env python3
"""Owner-authorized 72-hour backup expiry; require fresh verified replacements."""
import argparse,datetime as dt,fcntl,hashlib,importlib.util,json,os,re,shutil,subprocess,tempfile
from pathlib import Path
from email.utils import parsedate_to_datetime
from urllib.parse import quote
STATE=Path('/var/lib/melamedia-backup-retention')
CONFIG=Path('/etc/melamedia-backup.d/retention.json')

def acquire_lock(lock):
 try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);return True
 except BlockingIOError:return False

def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def eligible(item,now,hours=72):
 # Uploaded copies get a fresh lifetime; never infer age solely from their name.
 return dt.datetime.fromisoformat(item['last_modified']) < now-dt.timedelta(hours=hours)

def excluded_projects(config):
 values=config.get('excluded_projects',[])
 if not isinstance(values,list) or any(not isinstance(name,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,99}',name) for name in values):
  raise ValueError('invalid_excluded_projects')
 return frozenset(values)

def excluded_recovery_key(key,projects):
 # Match the exact recovery-project component, across hosts. Prefixes and other
 # projects keep their existing policy; local retirement is configured separately.
 if not projects or not isinstance(key,str):return False
 parts=key.split('/',3)
 return len(parts)==4 and parts[0]=='server-recovery' and parts[1] not in ('','.','..') and parts[2] in projects and bool(parts[3])

def remote_candidates(objects,now,projects=frozenset()):
 return [i for i in objects if i['key'].endswith(('.cms','.dump','.dump.gz','.log')) and eligible(i,now) and not excluded_recovery_key(i['key'],projects)]

def request(m,x,method,key,headers=(),body=None):
 base,user=m.storage_settings(x['env'],x['bucket'])
 cfg='user = '+user+'\nurl = '+m.curl_config(base+'/'+quote(key,safe='/'))+'\nheader = '+m.curl_config('x-amz-content-sha256: '+hashlib.sha256(body or b'').hexdigest())+'\n'
 for h in headers:cfg+='header = '+m.curl_config(h)+'\n'
 with tempfile.TemporaryDirectory(dir=STATE) as tmp:
  out=Path(tmp)/'response';head=Path(tmp)/'headers'
  args=['/usr/bin/curl','--disable','--config','-','--aws-sigv4','aws:amz:auto:s3','--silent','--connect-timeout','10','--max-time','45','--proto','=https','--globoff','--path-as-is','--output',str(out),'--dump-header',str(head),'--write-out','%{http_code}']
  args+=['--head'] if method=='HEAD' else ['--request',method]
  if body is not None:
   payload=Path(tmp)/'payload';payload.write_bytes(body);args+=['--data-binary','@'+str(payload)]
  r=subprocess.run(args,input=cfg.encode(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=50)
  assert r.returncode==0,'retention_request_failed'
  fields={line.split(':',1)[0].lower():line.split(':',1)[1].strip() for line in head.read_text().splitlines() if ':' in line}
  return int(r.stdout),fields

def checked_delete(m,target,item):
 status,h=request(m,target,'HEAD',item['key'])
 assert status==200 and h.get('etag','').strip('"')==item['etag'] and int(h.get('content-length','-1'))==item['bytes'],'candidate_changed'
 if item.get('last_modified'):
  expected=dt.datetime.fromisoformat(item['last_modified']).replace(microsecond=0)
  assert parsedate_to_datetime(h['last-modified'])==expected,'candidate_timestamp_changed'
 status,_=request(m,target,'DELETE',item['key'])
 assert status==204,'delete_failed'
 status,_=request(m,target,'HEAD',item['key']);assert status==404,'delete_not_confirmed'

def local_candidates(config,now):
 root=Path(config['root']);candidates=[]
 allowed=set(config['local_projects'])
 for name in allowed:
  folder=root/name
  if not folder.is_dir() or folder.is_symlink():continue
  for p in folder.iterdir():
   if p.is_symlink() or not p.is_dir() or not re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{8}',p.name):continue
   mf=p/'manifest.json';cipher=p/'bundle.cms'
   if not mf.is_file() or mf.is_symlink() or not cipher.is_file() or cipher.is_symlink():continue
   d=json.loads(mf.read_text());receipt=d.get('organization_offsite',{})
   if d.get('local_complete') is not True or (d.get('offsite')!='verified_readback' and receipt.get('status')!='verified_readback'):continue
   if dt.datetime.fromisoformat(d['created_at'])<now-dt.timedelta(hours=72):candidates.append({'path':str(p),'bytes':sum(x.stat().st_size for x in p.rglob('*') if x.is_file()),'manifest_sha':hashlib.sha256(mf.read_bytes()).hexdigest()})
 for x in config.get('legacy_local',[]):
  folder=Path(x['root'])
  if folder.is_symlink() or not folder.is_dir():continue
  for p in folder.iterdir():
   if p.is_symlink() or not p.is_file() or not re.fullmatch(x['pattern'],p.name):continue
   if dt.datetime.fromtimestamp(p.stat().st_mtime,dt.timezone.utc)<now-dt.timedelta(hours=72):candidates.append({'path':str(p),'bytes':p.stat().st_size,'mtime_ns':p.stat().st_mtime_ns})
 return candidates

def guard(config):
 # Defer quietly while a new generation is being built or published.
 for unit in config['producer_units']:
  state=subprocess.check_output(['systemctl','show',unit,'--property=ActiveState','--value']).decode().strip()
  if state in ['activating','active']:return False
 r=subprocess.run(['python3','-I','/usr/local/sbin/melamedia-backup-watch.py','freshness'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=180)
 assert r.returncode==0,'backup_health_blocks_expiry'
 h=json.loads(Path('/var/lib/melamedia-backup-watch/latest-health.json').read_text());assert h['healthy'] is True,'backup_health_blocks_expiry'
 return True

def main():
 os.umask(0o077);ap=argparse.ArgumentParser();ap.add_argument('--apply',action='store_true');ap.add_argument('--probe',action='store_true');args=ap.parse_args()
 STATE.mkdir(mode=0o700,exist_ok=True);config=json.loads(CONFIG.read_text());assert config['retention_hours']==72
 projects_excluded=excluded_projects(config)
 with (STATE/'.lock').open('a') as lock:
  if not acquire_lock(lock):print(json.dumps({'retention':'deferred_until_other_retention_finishes','deletions':0}));return
  if not guard(config):print(json.dumps({'retention':'deferred_until_producer_idle','deletions':0}));return
  m=load('objects','/usr/local/sbin/melamedia-object-snapshot.py');m.excluded=lambda key:False
  now=dt.datetime.now(dt.timezone.utc);all_candidates=[];counts=[]
  for x in config['targets']:
   assert all(p.startswith(('server-recovery/','db-backups/')) and p.endswith('/') for p in x['prefixes'])
   base,user=m.storage_settings(x['env'],x['bucket']);transport=m.Transport(base,user)
   with tempfile.TemporaryDirectory(dir=STATE) as tmp:objects,_=m.list_primary(transport,x['bucket'],x['prefixes'],Path(tmp))
   chosen=remote_candidates(objects.values(),now,projects_excluded)
   counts.append({'bucket':x['bucket'],'backup_objects':len(objects),'expired_objects':len(chosen),'expired_bytes':sum(i['bytes'] for i in chosen)})
   all_candidates.extend({'target':x,'object':i} for i in chosen)
  local=local_candidates(config,now)
  plan={'utc':now.isoformat(),'retention_hours':72,'remote':all_candidates,'local':local,'counts':counts,'applied':False}
  (STATE/'latest-plan-private.json').write_text(json.dumps(plan,indent=2))
  if args.probe:
   x=config['targets'][0];key=x['prefixes'][0]+'retention-owned-probe-'+os.urandom(8).hex()+'.txt';data=b'owned conditional-expiry safety probe'
   status,h=request(m,x,'PUT',key,['If-None-Match: *'],data);assert status==200,'probe_upload_failed'
   status,h=request(m,x,'HEAD',key);assert status==200
   checked_delete(m,x,{'key':key,'etag':h['etag'].strip('"'),'bytes':len(data)})
   print(json.dumps({'head_delete_confirmation_probe':'PASS','owned_probe_removed':True,'conditional_delete_supported':False}));return
  if args.apply:
   if not guard(config):print(json.dumps({'retention':'deferred_until_producer_idle','deletions':0}));return
   for item in all_candidates:
    checked_delete(m,item['target'],item['object'])
    with (STATE/'deletion-ledger-private.jsonl').open('a') as log:log.write(json.dumps({'utc':dt.datetime.now(dt.timezone.utc).isoformat(),**item})+'\n')
   for item in local:
    p=Path(item['path']);assert not p.is_symlink()
    if p.is_dir():assert hashlib.sha256((p/'manifest.json').read_bytes()).hexdigest()==item['manifest_sha'];shutil.rmtree(p)
    else:assert p.stat().st_mtime_ns==item['mtime_ns'];p.unlink()
   plan['applied']=True;(STATE/'latest-plan-private.json').write_text(json.dumps(plan,indent=2))
  summary={'utc':now.isoformat(),'retention_hours':72,'applied':args.apply,'remote_objects':len(all_candidates),'remote_bytes':sum(i['object']['bytes'] for i in all_candidates),'local_items':len(local),'local_bytes':sum(i['bytes'] for i in local),'counts':counts}
  (STATE/'latest-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
if __name__=='__main__':
 try:main()
 except Exception as e:print(json.dumps({'retention':'blocked_or_failed','type':type(e).__name__,'stage':str(e) if isinstance(e,AssertionError) else 'private_diagnostic'}));raise SystemExit(1)
