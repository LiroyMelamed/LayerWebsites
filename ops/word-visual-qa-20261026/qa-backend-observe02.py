#!/usr/bin/env python3
"""Fixed-target, read-only QA observation. No SSH without --observe.

Root reviews this source before executing. No app imports, application-row SQL,
environment writes, installs, source changes, restarts or recovery actions.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import uuid

OUT = Path(__file__).resolve().parent
W = Path('/Users/liroymelamed/Projects/LayerWebsites/.worktrees/word-ux-qa-20261026')
PROTECTED = Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2')
LEDGERS = [PROTECTED / 'outputs/signing-implementation-20261007/TEST-LEDGER.md',
           PROTECTED / 'outputs/office-whatsapp-20261023/TEST-LEDGER.md']
HOST = 'root@37.60.230.148'

REMOTE = r'''
import base64, datetime, fcntl, hashlib, json, os, re, shutil, signal, stat, subprocess, sys, time
from pathlib import Path
ROOT = Path('/root/Melamedia')
EXPECTED_HEAD = '1161fd687db381833552db78a70723573792ab97'
MIGRATION = '2026-10-26_01_signing_word_authoring_renders.sql'
HEALTH = __HEALTH__
START = time.monotonic()
LOCKS = []
LAST_SUBPROCESS_FAILURE = None
def digest(value):
    return hashlib.sha256(value).hexdigest()
def require(ok, code):
    if not ok: raise RuntimeError(code)
def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def command_variant(command):
    executable=Path(command[0]).name
    if executable=='git':
        tail=command[4:]
        if tail==['rev-parse','HEAD']: return 'GIT_HEAD'
        if tail==['symbolic-ref','--quiet','--short','HEAD']: return 'GIT_SYMBOLIC_BRANCH'
        if tail==['status','--porcelain=v1','-z','--untracked-files=no']: return 'GIT_TRACKED_STATUS'
        if tail==['ls-files','-z','--','backend']: return 'GIT_BACKEND_TRACKED_FILES'
    if executable=='pm2' and command[1:]==['jlist']: return 'PM2_JLIST_EXISTING_DAEMON'
    if executable in ('node','nodejs'):
        if command[1:]==['--version']: return 'NODE_VERSION'
        if len(command)==3 and command[1]=='-e': return 'NODE_SELECTED_DOTENV_METADATA'
    if executable=='runuser': return 'POSTGRES_PEER_READ_ONLY_SCHEMA_METADATA'
    return 'UNCLASSIFIED_FIXED_OBSERVER_SUBCOMMAND'
def bounded(command, data=None, seconds=5, env=None, allow_detached_symbolic_ref=False):
    global LAST_SUBPROCESS_FAILURE
    left = 41 - (time.monotonic()-START)
    require(left > 0, 'OBSERVATION_BUDGET_EXHAUSTED')
    result = subprocess.run(command,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                            timeout=max(0.1,min(seconds,left)),env=env)
    if result.returncode == 1 and allow_detached_symbolic_ref:
        require(command==['git','--no-optional-locks','-C',str(ROOT),'symbolic-ref','--quiet','--short','HEAD']
            and result.stdout==b'' and result.stderr==b'','INVALID_DETACHED_SYMBOLIC_REF_RESULT')
        return b''
    if result.returncode != 0:
        LAST_SUBPROCESS_FAILURE={'commandKind':Path(command[0]).name,'commandVariant':command_variant(command),'exitCode':result.returncode,
            'stdoutSha256':digest(result.stdout),'stderrSha256':digest(result.stderr)}
        raise RuntimeError('SUBPROCESS_FAILED')
    require(len(result.stdout) <= 12*1024*1024, 'SUBPROCESS_OUTPUT_BOUND')
    return result.stdout
def plain_file(path, max_bytes=32*1024*1024):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode) and info.st_size <= max_bytes, 'UNSAFE_FILE')
    descriptor = os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        opened = os.fstat(descriptor)
        require((opened.st_dev,opened.st_ino,opened.st_size)==(info.st_dev,info.st_ino,info.st_size), 'FILE_CAS_CHANGED')
        data = b''
        while len(data) <= max_bytes:
            part = os.read(descriptor,min(1024*1024,max_bytes+1-len(data)))
            if not part: break
            data += part
        require(len(data)<=max_bytes, 'FILE_SIZE_BOUND')
        after = os.fstat(descriptor)
        require((opened.st_size,opened.st_mtime_ns,opened.st_ctime_ns)==(after.st_size,after.st_mtime_ns,after.st_ctime_ns), 'FILE_CHANGED_DURING_READ')
        return data
    finally: os.close(descriptor)
def acquire(path, shared, create=False):
    created = False
    flags = os.O_CLOEXEC|os.O_NOFOLLOW|(os.O_RDWR if create else os.O_RDONLY)
    if create:
        try:
            fd = os.open(path,flags|os.O_CREAT|os.O_EXCL,0o600); created=True
        except FileExistsError: fd=os.open(path,flags)
    else: fd=os.open(path,flags)
    info=os.fstat(fd)
    require(stat.S_ISREG(info.st_mode) and info.st_uid==0 and info.st_nlink==1, 'UNSAFE_COORDINATION_LOCK')
    try: fcntl.flock(fd,(fcntl.LOCK_SH if shared else fcntl.LOCK_EX)|fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd); return False, created
    LOCKS.append(fd)
    return True, created
def git(*args, allow_detached_symbolic_ref=False):
    return bounded(['git','--no-optional-locks','-C',str(ROOT),*args],env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'},allow_detached_symbolic_ref=allow_detached_symbolic_ref)
def source_state():
    require(ROOT.resolve(strict=True)==ROOT and not ROOT.is_symlink() and ROOT.is_dir(), 'UNSAFE_QA_ROOT')
    head=git('rev-parse','HEAD').decode().strip()
    require(re.fullmatch('[0-9a-f]{40}',head) is not None,'INVALID_HEAD')
    branch=git('symbolic-ref','--quiet','--short','HEAD',allow_detached_symbolic_ref=True).decode().strip()
    detached=branch==''
    status=git('status','--porcelain=v1','-z','--untracked-files=no')
    names=git('ls-files','-z','--','backend').split(b'\0')
    require(0<len(names)<=10001,'TRACKED_SOURCE_BOUND')
    hashes={}; total=0
    for raw in names:
        if not raw: continue
        name=raw.decode('utf-8')
        pieces=name.split('/')
        require(pieces[0]=='backend' and len(pieces)>1 and all(p not in ('','.', '..') for p in pieces)
            and not any(c in name for c in ('\0','\r','\n','\\')) and 'node_modules' not in pieces and '.git' not in pieces,'UNSAFE_TRACKED_SOURCE')
        require(not any(p.startswith('.env') and p not in ('.env.example','.env.production.example') for p in pieces),'ACTUAL_ENV_TRACKED_SOURCE_REJECTED')
        current=ROOT
        for piece in pieces:
            current=current/piece
            require(not current.is_symlink(),'TRACKED_SOURCE_SYMLINK')
        data=plain_file(current)
        total+=len(data); require(total<=512*1024*1024,'SOURCE_TOTAL_BOUND')
        hashes[name]=digest(data)
    return {'head':head,'branch':'DETACHED' if detached else 'Melamedia' if branch=='Melamedia' else 'UNEXPECTED_BRANCH',
        'detachedHead':detached,'namedBranchReady':branch=='Melamedia',
        'branchSha256':digest(branch.encode()),'expectedHead':head==EXPECTED_HEAD,'trackedClean':not status,
        'trackedStatusSha256':digest(status),'backendFiles':hashes,'backendFileCount':len(hashes),
        'backendTreeSha256':digest(canonical(hashes))}
def proc(pid):
    require(isinstance(pid,int) and pid>1,'INVALID_PROCESS_ID')
    root=Path('/proc')/str(pid)
    text=(root/'stat').read_text()
    suffix=text[text.rfind(')')+2:].split()
    require(len(suffix)>19,'INVALID_PROCESS_STAT')
    environ=(root/'environ').read_bytes()
    require(len(environ)<=2*1024*1024,'PROCESS_ENV_BOUND')
    return {'startTicks':suffix[19],'environSha256':digest(environ)},environ
def pm2_state():
    daemon=plain_file(Path('/root/.pm2/pm2.pid'),128).decode().strip()
    require(daemon.isdigit() and Path('/proc',daemon).is_dir(),'PM2_DAEMON_NOT_RUNNING')
    pm2=shutil.which('pm2'); require(bool(pm2),'PM2_NOT_AVAILABLE')
    entries=json.loads(bounded([pm2,'jlist'],seconds=6))
    require(isinstance(entries,list) and 1<=len(entries)<=40,'PM2_INVENTORY_BOUND')
    result=[]; own=None; own_raw=None
    for item in entries:
        meta=item.get('pm2_env') or {}; name=item.get('name') or meta.get('name')
        require(isinstance(name,str) and re.fullmatch('[A-Za-z0-9_.-]{1,100}',name),'PM2_NAME_REJECTED')
        pid=item.get('pid')
        entry={'name':name,'pmId':item.get('pm_id'),'pid':pid,'status':meta.get('status'),
            'startMs':meta.get('pm_uptime'),'restarts':meta.get('restart_time'),'unstableRestarts':meta.get('unstable_restarts'),
            'cwdSha256':digest(str(meta.get('pm_cwd')).encode()),'execSha256':digest(str(meta.get('pm_exec_path')).encode())}
        controls={key:meta[key] for key in ['autorestart','watch','ignore_watch','watch_options','max_memory_restart','restart_delay',
            'exp_backoff_restart_delay','max_restarts','cron_restart','listen_timeout','wait_ready','shutdown_with_message','treekill','kill_retry_time'] if key in meta}
        entry['controlsSha256']=digest(canonical(controls))
        if isinstance(pid,int) and pid>1 and Path('/proc',str(pid)).is_dir():
            details,raw=proc(pid); entry.update(details)
        else: raw=None; entry.update({'startTicks':None,'environSha256':None})
        if name=='melamedia-api':
            require(own is None and raw is not None,'QA_PROCESS_NOT_UNIQUE_RUNNING')
            cwd=meta.get('pm_cwd'); executable=meta.get('pm_exec_path')
            require(cwd in (str(ROOT),str(ROOT/'backend')) and executable==str(ROOT/'backend/server.js'),'QA_PROCESS_TARGET_MISMATCH')
            require(Path('/proc',str(pid),'cwd').resolve(strict=True)==Path(cwd),'QA_PROCESS_CWD_MISMATCH')
            entry['cwd']=cwd;entry['execPath']=executable
            entry['execMode']=meta.get('exec_mode') if meta.get('exec_mode') in ('fork_mode','cluster_mode') else 'UNRECOGNIZED'
            entry['instances']=meta.get('instances') if type(meta.get('instances')) is int else None
            entry['watchPresent']='watch' in meta
            entry['watchEnabled']=bool(meta.get('watch'))
            entry['watchExactlyFalse']=meta.get('watch') is False
            entry['autorestart']=meta.get('autorestart') if type(meta.get('autorestart')) is bool else None
            own=entry; own_raw=raw
        result.append(entry)
    require(own is not None,'QA_PROCESS_MISSING')
    return {'processes':sorted(result,key=lambda p:(p['name'],str(p['pmId']))),'own':own},own_raw
def dependencies(pid):
    root=ROOT/'backend/node_modules'
    require(root.is_dir(),'INSTALLED_DEPENDENCIES_MISSING')
    selected=['pg/package.json','pg/lib/index.js','pg/lib/client.js','pdf-lib/package.json','pdf-lib/cjs/index.js',
        'pdfjs-dist/package.json','pdfjs-dist/legacy/build/pdf.mjs','pdfjs-dist/legacy/build/pdf.worker.mjs',
        'saxes/package.json','saxes/saxes.js','dotenv/package.json','dotenv/lib/main.js','express/package.json','express/index.js']
    files={}; versions={}
    for name in selected:
        path=root/name
        if not path.exists(): files[name]=None; continue
        data=plain_file(path); files[name]=digest(data)
        if name.endswith('/package.json'):
            version=json.loads(data).get('version')
            require(isinstance(version,str) and re.fullmatch('[0-9A-Za-z.+_-]{1,100}',version),'PACKAGE_VERSION_REJECTED')
            versions[name[:-13]]=version
    installed=root/'.package-lock.json'
    executable=Path('/proc',str(pid),'exe').resolve(strict=True)
    require(executable.name in ('node','nodejs'),'QA_INTERPRETER_NOT_NODE')
    version=bounded([str(executable),'--version'],seconds=2).decode().strip()
    require(re.fullmatch('v[0-9]+\.[0-9]+\.[0-9]+',version),'NODE_VERSION_REJECTED')
    return {'files':files,'versions':versions,'installedManifestSha256':digest(plain_file(installed)) if installed.exists() else None,
        'nodeVersion':version,'nodeBinarySha256':digest(plain_file(executable,128*1024*1024))},executable
PARSER = r"""
const fs=require('node:fs'); const crypto=require('node:crypto');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const dotenv=require('/root/Melamedia/backend/node_modules/dotenv/lib/main.js').parse(Buffer.from(input.dotenv,'base64'));
const initial=input.initial;
const flag=(object,key)=>{const present=Object.hasOwn(object,key);const value=String(object[key]??'');
 const normalized=key==='MULTI_TENANT_MODE'?value.trim().toLowerCase():value;
 return {present,enabled:key==='MULTI_TENANT_MODE'?normalized==='true':value==='1',
 recognized:!present||(key==='MULTI_TENANT_MODE'?['','true','false'].includes(normalized):['','0','1'].includes(value))};};
const view=object=>Object.fromEntries(['MULTI_TENANT_MODE','TENANT_DB_ISOLATION_ENABLED'].map(key=>[key,flag(object,key)]));
const effective={...dotenv,...initial};
console.log(JSON.stringify({initial:view(initial),dotenv:view(dotenv),effective:view(effective),
 databaseNameMatches:effective.DB_NAME==='melamedia',databaseHostLocal:['','localhost','127.0.0.1','::1'].includes(effective.DB_HOST??''),
 databasePortDefault:['','5432'].includes(String(effective.DB_PORT??'')),
 databaseUserSha256:crypto.createHash('sha256').update(String(effective.DB_USER??'')).digest('hex')}));
"""
def modes(env_bytes,initial_bytes,node):
    require(len(env_bytes)<=2*1024*1024,'DOTENV_BOUND')
    initial={}
    allowed={b'MULTI_TENANT_MODE',b'TENANT_DB_ISOLATION_ENABLED',b'DB_NAME',b'DB_HOST',b'DB_PORT',b'DB_USER'}
    for record in initial_bytes.split(b'\0'):
        key,sep,value=record.partition(b'=')
        if sep and key in allowed:
            require(key.decode() not in initial,'DUPLICATE_INITIAL_MODE_OR_DB_KEY')
            initial[key.decode()]=value.decode('utf-8')
    result=json.loads(bounded([str(node),'-e',PARSER],json.dumps({'dotenv':base64.b64encode(env_bytes).decode(),'initial':initial}).encode(),seconds=3))
    require(set(result)=={'initial','dotenv','effective','databaseNameMatches','databaseHostLocal','databasePortDefault','databaseUserSha256'},'MODE_PARSER_SHAPE')
    return result
SQL = r"""BEGIN READ ONLY;
SELECT json_build_object(
 'databaseNameMatches',current_database()='melamedia',
 'tables',(SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.name),'[]'::json) FROM (
   SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force,pg_get_userbyid(c.relowner) AS owner,
     (SELECT COALESCE(json_agg(json_build_object('name',p.polname,'permissive',p.polpermissive,'command',p.polcmd,
       'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::json)
       FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
     (SELECT COALESCE(json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull)
       ORDER BY a.attnum),'[]'::json) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
     (SELECT COALESCE(json_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname),'[]'::json) FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
     (SELECT COALESCE(json_agg(pg_get_triggerdef(g.oid) ORDER BY g.tgname),'[]'::json) FROM pg_trigger g WHERE g.tgrelid=c.oid AND NOT g.tgisinternal) AS triggers,
     (SELECT COALESCE(json_agg(indexdef ORDER BY indexname),'[]'::json) FROM pg_indexes i WHERE i.schemaname='public' AND i.tablename=c.relname) AS indexes,
     (SELECT COALESCE(json_agg(json_build_object('grantee',grantee,'privilege',privilege_type) ORDER BY grantee,privilege_type),'[]'::json)
       FROM information_schema.role_table_grants g WHERE g.table_schema='public' AND g.table_name=c.relname) AS grants
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
     AND c.relname IN ('signing_word_sources','signing_word_source_versions','signing_word_previews','signing_word_authoring_renders')
 ) t),
 'migrationHistoryColumns',(SELECT COALESCE(json_agg(json_build_object('name',column_name,'type',data_type,'nullable',is_nullable,'default',column_default)
   ORDER BY ordinal_position),'[]'::json) FROM information_schema.columns WHERE table_schema='public' AND table_name='schema_migrations'),
 'migrationHistoryRows',(SELECT COALESCE(json_agg(json_build_object('filename',filename,'appliedAt',applied_at) ORDER BY filename),'[]'::json)
   FROM public.schema_migrations WHERE filename='2026-10-26_01_signing_word_authoring_renders.sql')
); COMMIT;"""
def schema(mode):
    require(mode['databaseNameMatches'] and mode['databaseHostLocal'] and mode['databasePortDefault'],'QA_DATABASE_TARGET_NOT_LOCAL_MELAMEDIA')
    psql=shutil.which('psql'); runuser=shutil.which('runuser')
    require(bool(psql and runuser),'POSTGRES_PEER_METADATA_UNAVAILABLE')
    raw=bounded([runuser,'-u','postgres','--',psql,'-X','-w','-h','/var/run/postgresql','-p','5432','-d','melamedia',
        '-tA','-v','ON_ERROR_STOP=1','-c',SQL],seconds=6,
        env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C','PGOPTIONS':'-c default_transaction_read_only=on -c statement_timeout=3000','PGCONNECT_TIMEOUT':'3'})
    lines=[line for line in raw.decode().splitlines() if line.startswith('{')]
    require(len(lines)==1,'SCHEMA_METADATA_OUTPUT_SHAPE')
    data=json.loads(lines[0]); require(data['databaseNameMatches'],'PEER_DATABASE_MISMATCH')
    for table in data['tables']:
        owner=table.pop('owner'); table['ownerSha256']=digest(owner.encode())
        table['ownedByRuntimeUser']=table['ownerSha256']==mode['databaseUserSha256']
        table['metadataSha256']=digest(canonical(table))
    data['migrationHistoryShapeSha256']=digest(canonical(data['migrationHistoryColumns']))
    data['migrationHistoryRowsSha256']=digest(canonical(data['migrationHistoryRows']))
    data['metadataSha256']=digest(canonical(data))
    return data
def health():
    if not HEALTH: return {'requested':False}
    import urllib.request,urllib.error
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs): return None
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    result={}
    for name,url in [('local','http://127.0.0.1:3003/health'),('public','https://api-melamedia.mela-media.co.il/health')]:
        try:
            try: response=opener.open(urllib.request.Request(url,headers={'User-Agent':'Mela-QA-readonly-observe/1'}),timeout=3)
            except urllib.error.HTTPError as error: response=error
            with response:
                data=response.read(65537); require(len(data)<=65536,'HEALTH_RESPONSE_BOUND')
                result[name]={'status':response.status,'bytes':len(data),'bodySha256':digest(data)}
        except Exception as error: result[name]={'errorType':type(error).__name__}
    return result
def resources(processes):
    # Volatile resource values are observed once and never enter state equality.
    info=Path('/proc/meminfo').read_text()
    available=re.search(r'^MemAvailable:\s+(\d+)\s+kB$',info,re.M)
    require(available is not None,'MEM_AVAILABLE_UNAVAILABLE')
    rows=[]; own=None
    for entry in processes:
        pid=entry['pid']; rss=0
        if isinstance(pid,int) and pid>1:
            status=Path('/proc',str(pid),'status').read_text()
            match=re.search(r'^VmRSS:\s+(\d+)\s+kB$',status,re.M)
            require(match is not None,'PROCESS_RSS_UNAVAILABLE')
            rss=int(match.group(1))*1024
        rows.append({'name':entry['name'],'pmId':entry['pmId'],'pid':pid,'rssBytes':rss})
        if entry['name']=='melamedia-api': own=rss
    minimum=5*768*1024*1024+1024*1024*1024+384*1024*1024
    memory=int(available.group(1))*1024
    return {'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'memAvailableBytes':memory,
        'ownVmRssBytes':own,'allPm2RssBytes':sum(row['rssBytes'] for row in rows),'pm2Rss':rows,
        'existingConverterBudgetSlots':5,'converterBytesPerSlot':768*1024*1024,'applicationReserveBytes':1024*1024*1024,
        'additionalSingleQaMapWorkerHeadroomBytes':384*1024*1024,'conservativeMinimumAvailableBytes':minimum,
        'meetsConservativeAvailableMemoryGate':memory>=minimum,
        'limits':'Point-in-time resource observation; headroom assumes exactly one QA fork and at most one new map worker per process.'}
def snapshot():
    source=source_state(); pm2,raw=pm2_state();deps,node=dependencies(pm2['own']['pid'])
    env=plain_file(ROOT/'backend/.env',2*1024*1024)
    mode=modes(env,raw,node)
    return {'source':source,'ownEnvSha256':digest(env),'dependencies':deps,'pm2':pm2,'modes':mode,'schema':schema(mode)}
def main():
    require(Path('/run/lock').resolve(strict=True)==Path('/run/lock'),'UNSAFE_LOCK_DIRECTORY')
    okay,_=acquire('/run/lock/melamedia-release-maintenance.lock',True)
    if not okay: return {'result':'BUSY_NO_OBSERVATION','busyLock':'maintenance','observed':False},75
    okay,created=acquire('/run/lock/melamedia-legal-melamedia-release.lock',False,True)
    if not okay: return {'result':'BUSY_NO_OBSERVATION','busyLock':'qa','observed':False},75
    before=snapshot(); endpoints=health(); after=snapshot(); resource=resources(after['pm2']['processes'])
    stable=before==after
    qualified=stable and before['source']['expectedHead'] and before['source']['branch']=='Melamedia' and before['source']['trackedClean']
    recognized=all(flag['recognized'] for flag in before['modes']['effective'].values())
    return {'result':'OBSERVED_READ_ONLY_STABLE' if qualified and recognized else 'OBSERVED_DRIFT_OR_BASELINE_MISMATCH',
        'observed':True,'before':before,'after':after,'stateStable':stable,'effectiveModesRecognized':recognized,
        'qaProcessOnline':after['pm2']['own']['status']=='online',
        'qaSingleFork':after['pm2']['own']['execMode']=='fork_mode' and after['pm2']['own']['instances']==1,
        'qaWatchExactlyFalse':after['pm2']['own']['watchExactlyFalse'],'resources':resource,
        'health':endpoints,'coordinationLockCreated':created,'elapsedSeconds':round(time.monotonic()-START,3),
        'limits':['Metadata and hashes only; no application rows or provider/control values disclosed.',
        'Health status/hash is not authenticated feature QA, RLS qualification, deployment or recovery proof.']},0 if qualified and recognized else 2
def alarm(_signum,_frame): raise RuntimeError('OBSERVATION_TIME_BUDGET')
signal.signal(signal.SIGALRM,alarm); signal.alarm(43)
try:
    value,code=main()
except Exception as error:
    known=str(error) if isinstance(error,RuntimeError) else None
    value={'result':'OBSERVATION_FAILED','observed':False,'errorCode':known if known and re.fullmatch('[A-Z0-9_]{1,100}',known) else type(error).__name__,
           'elapsedSeconds':round(time.monotonic()-START,3),'partialObservationPossible':True,'subprocessFailure':LAST_SUBPROCESS_FAILURE}
    code=1
finally:
    signal.alarm(0)
    for fd in reversed(LOCKS): os.close(fd)
sys.stdout.write(json.dumps(value,sort_keys=True)+'\n')
sys.exit(code)
'''


def sha(data):
    return hashlib.sha256(data).hexdigest()


def private_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--observe', action='store_true', help='Execute this fixed read-only observation once after source review.')
    parser.add_argument('--health', action='store_true', help='Also GET the two fixed QA health endpoints; status/body hash only.')
    args = parser.parse_args()
    if not args.observe:
        print(json.dumps({'result': 'PLAN_ONLY_NOT_EXECUTED', 'host': HOST, 'root': '/root/Melamedia',
            'locks': ['SH /run/lock/melamedia-release-maintenance.lock', 'EX /run/lock/melamedia-legal-melamedia-release.lock'],
            'execute': 'python3 qa-backend-observe02.py --observe [--health]', 'noMutation': 'No app/source/env/schema/provider changes; coordination-lock metadata and local evidence only.'}))
        return 0
    at = datetime.datetime.now(datetime.timezone.utc)
    name = 'qa-backend-observe-' + at.strftime('%Y%m%dT%H%M%S%fZ') + '-' + uuid.uuid4().hex[:8]
    private = OUT / 'private-qa-backend-observe02'
    stdout_path, stderr_path = private / (name + '.stdout'), private / (name + '.stderr')
    payload = REMOTE.replace('__HEALTH__', 'True' if args.health else 'False').encode()
    command = ['ssh', '-T', '-i', str(Path.home() / '.ssh/id_ed25519'), '-o', 'IdentitiesOnly=yes',
        '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ForwardAgent=no', '-o', 'ForwardX11=no',
        '-o', 'ClearAllForwardings=yes', '-o', 'ConnectTimeout=8', '-o', 'ConnectionAttempts=1',
        '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2', HOST,
        'timeout --signal=TERM --kill-after=2s 46s python3 -']
    receipt = {'at': at.isoformat(), 'kind': 'READ_ONLY_QA_BASELINE_OBSERVATION', 'host': HOST,
        'driverSha256': sha(Path(__file__).read_bytes()), 'remotePayloadSha256': sha(payload), 'argv': command,
        'healthRequested': args.health, 'result': 'SETUP_FAILED_NOT_EXECUTED', 'sshAttempted': False,
        'limits': ['No test/deploy/migration/restart/authentication/provider action.',
                   'Raw transport is private0600; application/environment contents and PM2 raw jlist are never emitted.']}
    code = 1
    try:
        receipt['ledgersReadBefore'] = {str(path): sha(path.read_bytes()) for path in LEDGERS}
        private.mkdir(mode=0o700, exist_ok=True)
        info = private.lstat()
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700:
            raise RuntimeError('UNSAFE_LOCAL_PRIVATE_EVIDENCE_DIRECTORY')
        receipt['localHead'] = subprocess.check_output(['git', '-C', str(W), 'rev-parse', 'HEAD'], text=True, timeout=3).strip()
        migration = W / 'backend/migrations/2026-10-26_01_signing_word_authoring_renders.sql'
        receipt['localProposedMigrationSha256'] = sha(migration.read_bytes())
        private_write(stdout_path, b''); private_write(stderr_path, b'')
        with stdout_path.open('ab') as stdout, stderr_path.open('ab') as stderr:
            receipt['sshAttempted'] = True
            try:
                code = subprocess.run(command, input=payload, stdout=stdout, stderr=stderr, timeout=55).returncode
            except subprocess.TimeoutExpired:
                code = 124
            except OSError as error:
                code = 125; stderr.write(('LOCAL_TRANSPORT_ERROR:' + type(error).__name__).encode())
        raw = stdout_path.read_bytes()
        receipt['transportExitCode'] = code
        if len(raw) > 5*1024*1024:
            receipt['result'] = 'INVALID_REMOTE_OUTPUT_BOUND'
        else:
            try:
                observation = json.loads(raw)
                if not isinstance(observation, dict) or observation.get('result') not in (
                    'BUSY_NO_OBSERVATION', 'OBSERVED_READ_ONLY_STABLE', 'OBSERVED_DRIFT_OR_BASELINE_MISMATCH', 'OBSERVATION_FAILED'):
                    raise ValueError('shape')
                expected_codes = {'OBSERVED_READ_ONLY_STABLE': 0, 'BUSY_NO_OBSERVATION': 75,
                    'OBSERVED_DRIFT_OR_BASELINE_MISMATCH': 2, 'OBSERVATION_FAILED': 1}
                if code != expected_codes[observation['result']]:
                    raise ValueError('result')
                receipt['observation'] = observation; receipt['result'] = observation['result']
            except (ValueError, UnicodeError):
                receipt['result'] = 'TRANSPORT_OR_REMOTE_OUTPUT_FAILED'
        for label, path in [('privateStdout', stdout_path), ('privateStderr', stderr_path)]:
            state = path.lstat()
            if not stat.S_ISREG(state.st_mode) or stat.S_ISLNK(state.st_mode) or stat.S_IMODE(state.st_mode) != 0o600:
                raise RuntimeError('EVIDENCE_MODE_INVALID')
            receipt[label] = {'path': str(path), 'sha256': sha(path.read_bytes()), 'bytes': state.st_size, 'mode': '0600'}
    except Exception as error:
        receipt['result'] = 'SETUP_FAILED_NOT_EXECUTED' if not receipt['sshAttempted'] else 'LOCAL_POSTVALIDATION_FAILED'
        receipt['localErrorType'] = type(error).__name__
    receipt_path = OUT / (name + '.json')
    private_write(receipt_path, (json.dumps(receipt, indent=2, sort_keys=True) + '\n').encode())
    receipt_sha = sha(receipt_path.read_bytes())
    line = ('\n- ' + at.isoformat() + ' QA BACKEND READ-ONLY OBSERVATION, local commit ' + receipt.get('localHead', 'unavailable')
        + ', result ' + receipt['result'] + ', transportExit ' + str(receipt.get('transportExitCode', 'not-executed'))
        + '. Evidence ' + str(receipt_path) + ' SHA256 ' + receipt_sha
        + '. Driver/payload hashes and safe source/env/dependency/process/schema metadata bound in receipt. No unit/feature test, app rows, deployment, migration, restart, auth, provider, dispatch or recovery execution claim.\n')
    failures = []
    for path in LEDGERS:
        try:
            descriptor = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write(line.encode())
        except OSError:
            failures.append(str(path))
    print(json.dumps({'receipt': str(receipt_path), 'sha256': receipt_sha, 'result': receipt['result'],
        'head': receipt.get('observation', {}).get('after', {}).get('source', {}).get('head'),
        'stateStable': receipt.get('observation', {}).get('stateStable'),
        'modeFlags': receipt.get('observation', {}).get('after', {}).get('modes', {}).get('effective'),
        'qaProcessOnline': receipt.get('observation', {}).get('qaProcessOnline'),
        'qaSingleFork': receipt.get('observation', {}).get('qaSingleFork'),
        'qaWatchExactlyFalse': receipt.get('observation', {}).get('qaWatchExactlyFalse'),
        'resourceGate': receipt.get('observation', {}).get('resources', {}).get('meetsConservativeAvailableMemoryGate'),
        'ledgerAppendFailures': failures}))
    return 0 if receipt['result'] == 'OBSERVED_READ_ONLY_STABLE' and not failures else 1


if __name__ == '__main__':
    raise SystemExit(main())
