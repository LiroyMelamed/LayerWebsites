"""Reviewed Idm-only phases. Imported locally without executing production actions."""
import datetime,fcntl,hashlib,json,os,pathlib,re,shlex,shutil,stat,subprocess,tarfile,time,uuid
ROOT=pathlib.Path('/root/Idm');STAGE=pathlib.Path('/root/idm-backend-retirement-20261025-v2');VHOST=pathlib.Path('/etc/nginx/sites-enabled/idm-api')
PG_SOCKET='/var/run/postgresql';PG_PORT='5432';PG_ROLE='postgres';CLUSTER_PIN=None
PRIVILEGED_EXECUTOR=subprocess.run
sha=lambda b:hashlib.sha256(b).hexdigest()
canon=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
class Stop(Exception):pass
def need(ok,code):
    if not ok:raise Stop(code)
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def run(args,**kw):
    return subprocess.check_output(args,stderr=subprocess.PIPE,timeout=kw.pop('timeout',60),env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'},**kw)
def digest(p):
    h=hashlib.sha256()
    with p.open('rb')as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def write(p,v):
    with p.open('xb')as f:f.write(v if isinstance(v,bytes)else canon(v)+b'\n');f.flush();os.fsync(f.fileno())
    p.chmod(0o600)
def journal(event,**kw):
    with (STAGE/'journal.private.jsonl').open('ab')as f:f.write(canon({'at':stamp(),'event':event,**kw})+b'\n');f.flush();os.fsync(f.fileno())
def git(*args):return run(['git','-C',str(ROOT),*args]).decode().strip()
def source_gate(C):
    need(ROOT.is_dir()and not ROOT.is_symlink()and ROOT.resolve()==ROOT,'ROOT_IDENTITY_CHANGED')
    for k in ['core.hooksPath','core.fsmonitor']:
        p=subprocess.run(['git','-C',str(ROOT),'config','--get',k],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'});need(p.returncode in(0,1)and(not p.stdout.strip()or k=='core.fsmonitor'and p.stdout.strip()==b'false'),'CUSTOM_GIT_EXECUTION_REQUIRES_REVIEW')
    hooks=pathlib.Path(git('rev-parse','--git-path','hooks'));hooks=hooks if hooks.is_absolute()else ROOT/hooks
    need(not any(os.access(hooks/n,os.X_OK)for n in['post-checkout','pre-merge-commit','post-merge','post-index-change']),'EXECUTABLE_GIT_HOOK_REQUIRES_REVIEW')
    for arg in ['--git-dir','--git-common-dir']:
        p=pathlib.Path(git('rev-parse',arg));p=p if p.is_absolute()else ROOT/p;need(str(p.resolve()).startswith(str(ROOT)+'/'),'GIT_METADATA_PROVIDER_OUTSIDE_IDM')
    objects=pathlib.Path(git('rev-parse','--git-path','objects'));objects=objects if objects.is_absolute()else ROOT/objects;need(str(objects.resolve()).startswith(str(ROOT)+'/'),'GIT_OBJECT_PROVIDER_OUTSIDE_IDM');alternates=objects/'info/alternates';need(not alternates.exists()or not alternates.read_bytes().strip(),'EXTERNAL_GIT_ALTERNATE_REQUIRES_SEPARATE_PRESERVATION')
    need(git('rev-parse','HEAD')==C['sourceCommit']and git('symbolic-ref','--short','HEAD')=='Idm'and not git('status','--porcelain','--untracked-files=no'),'IDM_SOURCE_CAS_CHANGED')
    for line in pathlib.Path('/proc/self/mountinfo').read_text().splitlines():
        p=line.split(' - ',1)[0].split()[4].replace('\\040',' ');need(p!=str(ROOT)and not p.startswith(str(ROOT)+'/'),'MOUNT_INSIDE_IDM_ROOT')
NODE_STATE=r'''
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');const h=b=>crypto.createHash('sha256').update(b).digest('hex'),s=x=>Array.isArray(x)?x.map(s):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,s(x[k])])):x,ch=x=>h(JSON.stringify(s(x)));const list=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})),p=list.find(x=>x.pm_id===6);if(p&&(p.name!=='idm-api'||p.pm2_env.pm_cwd!=='/root/Idm/backend'||p.pm2_env.pm_exec_path!=='/root/Idm/backend/server.js'))throw Error('IDM_PROCESS_IDENTITY_CHANGED');const excluded=new Set(['status','pm_uptime','restart_time','unstable_restarts','prev_restart_delay','created_at','axm_actions','axm_monitor','axm_options','axm_dynamic','vizion_running','versioning']);const result={own:p||null,otherLaunchPrivate:list.filter(x=>x.pm_id!==6).map(x=>({id:x.pm_id,name:x.name,launch:Object.fromEntries(Object.entries(x.pm2_env).filter(([k])=>!excluded.has(k)))})).sort((a,b)=>a.id-b.id),others:list.filter(x=>x.pm_id!==6).map(x=>({id:x.pm_id,pid:x.pid,status:x.pm2_env.status,restarts:x.pm2_env.restart_time})).sort((a,b)=>a.id-b.id)};if(fs.existsSync('/root/Idm/backend/.env')){const raw=fs.readFileSync('/root/Idm/backend/.env'),parsed=require('/root/Idm/backend/node_modules/dotenv').parse(raw),nested=p?.pm2_env.env||{},root={},effective={...parsed,...nested};for(const k of new Set([...Object.keys(parsed),...Object.keys(nested)]))if(p&&Object.hasOwn(p.pm2_env,k)){root[k]=p.pm2_env[k];effective[k]=p.pm2_env[k];}result.envSha256=h(raw);result.nestedSha256=ch(nested);result.rootSha256=ch(root);result.effectiveSha256=ch(effective);}process.stdout.write(JSON.stringify(result));
'''
def state():return json.loads(run(['node','-e',NODE_STATE],timeout=20))
def own_gate(C,s,stopped=False):
    p=s['own'];need(p is not None and p['pm2_env']['status']==('stopped'if stopped else'online'),'OWN_PROCESS_STATE_CHANGED')
    if not stopped:need(p['pid']==C['expectedPid'],'OWN_PROCESS_PID_CHANGED')
    for key,expected in C['environmentFingerprints'].items():need(s.get(key)==expected,'IDM_ENVIRONMENT_CAS_CHANGED')
def privileged(tool,args,**kw):
    env={k:v for k,v in os.environ.items()if not k.startswith('PG')};env['GIT_OPTIONAL_LOCKS']='0'
    command=['runuser','-u','postgres','--','/usr/bin/'+tool,'--host='+PG_SOCKET,'--port='+PG_PORT,'--username='+PG_ROLE,*args]
    x=PRIVILEGED_EXECUTOR(command,env=env,stderr=subprocess.PIPE,stdout=kw.pop('stdout',subprocess.PIPE),timeout=kw.pop('timeout',60),**kw);need(x.returncode==0,'BOUND_LOCAL_POSTGRES_COMMAND_FAILED');return x.stdout
def raw_sql(q,database='postgres'):
    return json.loads(privileged('psql',['-X','-A','-t','-q','--dbname='+database,'-v','ON_ERROR_STOP=1'],input=("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='20s'; "+q+'; COMMIT;').encode()).strip())
def cluster_identity():
    need(PG_PORT.isdigit(),'PRIVILEGED_POSTGRES_PORT_FORMAT_CHANGED');p=raw_sql("SELECT json_build_object('systemIdentifier',system_identifier::text,'dataDirectorySha256',encode(sha256(convert_to(current_setting('data_directory'),'UTF8')),'hex'),'serverVersionNum',current_setting('server_version_num')::int,'port5432',current_setting('port')='"+PG_PORT+"','localUnixSocket',inet_server_addr()IS NULL)FROM pg_control_system()")
    need(p['port5432']is True and p['localUnixSocket']is True,'REVIEWED_LOCAL_POSTGRES_CLUSTER_REQUIRED');return p
def verify_cluster():
    need(CLUSTER_PIN is not None and cluster_identity()==CLUSTER_PIN,'POSTGRES_CLUSTER_IDENTITY_CHANGED')
def sql(q,database='postgres'):
    verify_cluster();return raw_sql(q,database)
def db_gate(C,zero=False):
    d=sql("SELECT json_build_object('oid',(SELECT oid FROM pg_database WHERE datname='idm'),'sessions',(SELECT count(*) FROM pg_stat_activity WHERE datname='idm'),'prepared',(SELECT count(*) FROM pg_prepared_xacts WHERE database='idm'),'slots',(SELECT count(*) FROM pg_replication_slots WHERE database='idm'),'subscriptions',(SELECT count(*) FROM pg_subscription WHERE subdbid=(SELECT oid FROM pg_database WHERE datname='idm')))")
    need(str(d['oid'])==str(C['databaseOid'])and d['prepared']==0 and d['slots']==0 and d['subscriptions']==0,'DATABASE_OID_OR_DEPENDENCY_CHANGED')
    if zero:need(d['sessions']==0,'UNEXPECTED_IDM_DATABASE_CONNECTION')
    return d
OBJECT_SQL="""SELECT json_build_object('relations',(SELECT coalesce(json_agg(json_build_array(n.nspname,c.relname,c.relkind,r.rolname,coalesce((SELECT string_agg(x::text,',' ORDER BY x::text)FROM unnest(c.relacl)x),''))ORDER BY n.nspname,c.relname),'[]'::json)FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname NOT IN('pg_catalog','information_schema')AND n.nspname NOT LIKE 'pg_toast%'AND c.relkind IN('r','p','v','m','S','f')),'columns',(SELECT coalesce(json_agg(json_build_array(n.nspname,c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated)ORDER BY n.nspname,c.relname,a.attnum),'[]'::json)FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attnum>0 AND NOT a.attisdropped AND n.nspname NOT IN('pg_catalog','information_schema')AND n.nspname NOT LIKE 'pg_toast%'),'constraints',(SELECT coalesce(json_agg(json_build_array(n.nspname,c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid))ORDER BY n.nspname,c.relname,k.conname),'[]'::json)FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema')AND n.nspname NOT LIKE 'pg_toast%'),'routines',(SELECT coalesce(json_agg(json_build_array(n.nspname,p.proname,p.prokind,pg_get_function_identity_arguments(p.oid),r.rolname,coalesce((SELECT string_agg(x::text,',' ORDER BY x::text)FROM unnest(p.proacl)x),''))ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]'::json)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname NOT IN('pg_catalog','information_schema')),'types',(SELECT coalesce(json_agg(json_build_array(n.nspname,t.typname,t.typtype)ORDER BY n.nspname,t.typname),'[]'::json)FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema')AND n.nspname NOT LIKE 'pg_toast%'),'extensions',(SELECT coalesce(json_agg(json_build_array(extname,extversion)ORDER BY extname),'[]'::json)FROM pg_extension),'defaultAcls',(SELECT coalesce(json_agg(json_build_array(r.rolname,coalesce(n.nspname,''),a.defaclobjtype,(SELECT string_agg(x::text,',' ORDER BY x::text)FROM unnest(a.defaclacl)x))ORDER BY r.rolname,n.nspname,a.defaclobjtype),'[]'::json)FROM pg_default_acl a JOIN pg_roles r ON r.oid=a.defaclrole LEFT JOIN pg_namespace n ON n.oid=a.defaclnamespace))"""
TABLES_SQL="SELECT coalesce(json_agg(json_build_array(schemaname,tablename)ORDER BY schemaname,tablename),'[]'::json)FROM pg_tables WHERE schemaname NOT IN('pg_catalog','information_schema')"
def dereg_gate(C,D):
    need(isinstance(D,dict)and sha(canon(D)+b'\n')==C['approvedDeregistrationCanonicalSha256'],'ACTUAL_REVIEWED_DEREGISTRATION_REQUIRED')
    need(D.get('result')=='PASS_IDM_ONLY_BACKUP_RETENTION_DEREGISTRATION'and D.get('tenant')=='idm'and D.get('sourceAndConfigPreimagesRetained')is True,'SUCCESSFUL_IDM_DEREGISTRATION_REQUIRED')
    required=C['requiredDeregistrationPredicates'];need(all(D.get('predicates',{}).get(k)is True for k in required),'DEREGISTRATION_PREDICATE_MISSING');need(digest(pathlib.Path('/usr/local/sbin/melamedia-backup-retention.py'))==D['installedRetentionSourceSha256'],'REVIEWED_RETENTION_SOURCE_CHANGED');after=D['configBeforeAfterSha256']['after'];need({'/etc/melamedia-backup.d/config.json','/etc/melamedia-backup.d/retention.json'}.issubset(after),'DEREGISTERED_CONFIG_BINDINGS_MISSING')
    for p,expected in after.items():need(digest(pathlib.Path(p))==expected,'DEREGISTERED_CONFIG_DRIFT')
def other_gate(s):
    need(s['others']==json.loads((STAGE/'other-processes.private.json').read_text()),'OTHER_PM2_PROCESS_CHANGED');need(s['otherLaunchPrivate']==json.loads((STAGE/'other-launch-values.private.json').read_text()),'OTHER_PM2_LAUNCH_VALUES_CHANGED')
def active_consumers_gate(C,proof):
    need(isinstance(proof,dict)and proof.get('backendHost')=='37.60.230.148'and proof.get('allParentKnownActiveRootsIncluded')is True and isinstance(proof.get('additionalActiveRoots'),list),'PARENT_ACTIVE_CONSUMER_INVENTORY_REQUIRED')
    pm=json.loads(run(['pm2','jlist'],timeout=20));starts=[];hits=[];visited=set();entries=0;started=time.monotonic();broad={'/','/root','/var','/opt','/usr'}
    def pointer(p,owner):
        if not isinstance(p,str)or not p:return
        p=pathlib.Path(p);p=p if p.is_absolute()else pathlib.Path(owner['cwd'])/p
        if str(p)==str(ROOT)or str(p).startswith(str(ROOT)+'/'):hits.append({'processId':owner['id'],'pointerSha256':sha(str(p).encode())});return
        try:resolved=p.resolve(strict=True)
        except FileNotFoundError:return
        if str(resolved)==str(ROOT)or str(resolved).startswith(str(ROOT)+'/'):hits.append({'processId':owner['id'],'pointerSha256':sha(str(p).encode())})
        elif resolved.is_dir():
            need(str(resolved)not in broad,'BROAD_ACTIVE_CONSUMER_ROOT_UNCLASSIFIED');starts.append((resolved,owner))
    for p in pm:
        if p['pm_id']==6:continue
        e=p['pm2_env'];owner={'id':p['pm_id'],'cwd':e.get('pm_cwd')or'/'};cwd=pathlib.Path(owner['cwd']);script=e.get('pm_exec_path');pointer(script,owner)
        if str(cwd)not in broad:pointer(str(cwd),owner)
        else:
            pointer(str(cwd/'node_modules'),owner)
            if script and str(pathlib.Path(script).parent)not in broad:pointer(str(pathlib.Path(script).parent),owner)
        env=e.get('env')or{}
        for k in ['NODE_PATH']:
            for v in str(e.get(k,env.get(k,''))).split(':'):
                if v:pointer(v,owner)
        for k in ['node_args','args','NODE_OPTIONS']:
            value=e.get(k,env.get(k,[]));tokens=value if isinstance(value,list)else shlex.split(value or'');preload=False
            for token in tokens:
                token=str(token)
                if str(ROOT)in token:hits.append({'processId':owner['id'],'runtimeField':k,'literalIdmReference':True})
                if preload:pointer(token,owner);preload=False
                if token in ['-r','--require','--import','--loader','--experimental-loader']:preload=True
                elif token.startswith(('--require=','--import=','--loader=','--experimental-loader=')):pointer(token.split('=',1)[1],owner)
                elif'='in token and token.split('=',1)[1].startswith(('/','./','../')):pointer(token.split('=',1)[1],owner)
                elif token.startswith(('/','./','../')):pointer(token,owner)
    need(len(proof['additionalActiveRoots'])<=100 and all(isinstance(p,str)and pathlib.Path(p).is_absolute()for p in proof['additionalActiveRoots']),'INVALID_REVIEWED_ADDITIONAL_ACTIVE_ROOTS')
    for p in proof['additionalActiveRoots']:pointer(p,{'id':None,'cwd':'/'})
    while starts:
        root,owner=starts.pop();identity=(root.stat().st_dev,root.stat().st_ino)
        if identity in visited:continue
        for parent,children,names in os.walk(root,followlinks=False):
            d=pathlib.Path(parent);directoryIdentity=(d.stat().st_dev,d.stat().st_ino)
            if directoryIdentity in visited:children[:]=[];continue
            visited.add(directoryIdentity)
            need(time.monotonic()-started<90 and entries<500000,'ACTIVE_CONSUMER_SCAN_BOUND_EXCEEDED')
            for name in list(children)+names:
                p=d/name;entries+=1
                if p.is_symlink():pointer(str(p),owner)
                elif name=='.git':
                    if p.is_file():
                        raw=p.read_text()[:4096]
                        if raw.startswith('gitdir: '):pointer(raw[8:].strip(),owner)
                    elif p.is_dir():
                        alt=p/'objects/info/alternates'
                        if alt.is_file():
                            for v in alt.read_text().splitlines():pointer(str(p/'objects'/v)if not pathlib.Path(v).is_absolute()else v,owner)
                    if name in children:children.remove(name)
    result={'at':stamp(),'registeredPm2ProcessesChecked':len(pm)-1,'visitedConcreteActiveDirectories':len(visited),'metadataEntriesChecked':entries,'hits':hits,'noRawRuntimeArgsEnvironmentOrCustomerPathsExported':True};write(STAGE/('active-consumer-proof-'+uuid.uuid4().hex+'.private.json'),result);need(not hits,'OTHER_ACTIVE_CONSUMER_REFERENCES_IDM');return result
def nginx_hashes():
    paths=[pathlib.Path('/etc/nginx/nginx.conf')]
    for d in ['/etc/nginx/sites-enabled','/etc/nginx/conf.d']:
        if pathlib.Path(d).exists():paths.extend(p for p in pathlib.Path(d).iterdir()if p.is_file())
    return{str(p):digest(p)for p in paths if p!=VHOST}
def nginx_gate():need(nginx_hashes()==json.loads((STAGE/'other-nginx-hashes.private.json').read_text()),'OTHER_NGINX_CONFIG_CHANGED')
def nginx(action):run(['nginx','-t']if action=='test'else['systemctl','reload','nginx'],timeout=30)
def _tombstone_probe(scheme,port,remaining):
    started=time.monotonic();limit=min(1.5,remaining);args=['curl','--silent','--show-error','--noproxy','*','--max-time',str(limit),'--resolve','api-idm.mela-media.co.il:'+str(port)+':127.0.0.1','-o','/dev/null','-w','%{http_code}',scheme+'://api-idm.mela-media.co.il/health']
    try:
        x=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=limit);raw=x.stdout.decode(errors='replace');return{'exitCode':x.returncode,'status':int(raw)if re.fullmatch('[0-9]{3}',raw)else None,'durationMs':round((time.monotonic()-started)*1000),'errorClass':None if x.returncode==0 else'CURL_TRANSPORT'}
    except subprocess.TimeoutExpired:return{'exitCode':124,'status':None,'durationMs':round((time.monotonic()-started)*1000),'errorClass':'ABSOLUTE_TIMEOUT'}
def tombstone_smoke(clock=time.monotonic,sleep=time.sleep,probe=None,journal_fn=None,budget_s=8.0):
    need(isinstance(budget_s,(int,float))and 0<budget_s<=8,'INVALID_API410_CONVERGENCE_BUDGET');probe=probe or _tombstone_probe;journal_fn=journal_fn or journal;started=clock();deadline=started+budget_s;attempt=0
    while clock()<deadline:
        attempt+=1;all_ready=True
        for scheme,port in [('http',80),('https',443)]:
            remaining=deadline-clock()
            if remaining<=0:all_ready=False;break
            r=probe(scheme,port,remaining);journal_fn('api410-probe',attempt=attempt,scheme=scheme,status=r['status'],exitCode=r['exitCode'],durationMs=r['durationMs'],elapsedMs=round((clock()-started)*1000),errorClass=r.get('errorClass'));all_ready=all_ready and r['exitCode']==0 and r['status']==410
        if all_ready and clock()<=deadline:return
        remaining=deadline-clock()
        if remaining>0:sleep(min(.25,remaining))
    raise Stop('IDM_API_TOMBSTONE_NOT_410_WITHIN_BUDGET')
def install_tombstone_with_owned_rollback(body,original_sha):
    atomic(VHOST,body,original_sha)
    try:nginx('test');nginx('reload');nginx_gate();tombstone_smoke()
    except Exception:atomic(VHOST,(STAGE/'api-vhost.before.private').read_bytes(),sha(body));nginx('test');nginx('reload');raise
def atomic(path,data,expected):
    need(digest(path)==expected,'IMMEDIATE_FILE_CAS_FAILED');st=path.stat();tmp=(pathlib.Path('/etc/nginx')if path==VHOST else path.parent)/('.idm-retirement-'+uuid.uuid4().hex+'.tmp');write(tmp,data);os.chmod(tmp,stat.S_IMODE(st.st_mode));os.chown(tmp,st.st_uid,st.st_gid);need(digest(path)==expected,'SECOND_FILE_CAS_FAILED');os.replace(tmp,path)
def tombstone(raw):
    text=raw.decode();names=set(re.findall(r'\bserver_name\s+([^;]+);',re.sub(r'#[^\n]*','',text)));tokens=set(' '.join(names).split());expected={'api-idm.mela-media.co.il','api-idm.37.60.230.148.sslip.io'};need(tokens==expected,'UNRELATED_API_HOST_IN_VHOST')
    cert=re.findall(r'^\s*(ssl_certificate(?:_key)?)\s+([^;]+);',text,re.M);need(len(cert)==2 and{a for a,b in cert}=={'ssl_certificate','ssl_certificate_key'},'TLS_DIRECTIVE_AMBIGUITY');tls='\n'.join('    '+a+' '+b+';'for a,b in cert);hosts=' '.join(sorted(tokens));return('server {\n    listen 80;\n    server_name '+hosts+';\n    return 410;\n}\nserver {\n    listen 443 ssl;\n    server_name '+hosts+';\n'+tls+'\n    return 410;\n}\n').encode()
def manifest(root):
    st=root.lstat();need(stat.S_ISDIR(st.st_mode)and not root.is_symlink(),'ROOT_NOT_CANONICAL_DIRECTORY');files={};dirs={};links={};total=0
    for parent,children,names in os.walk(root,followlinks=False):
        p=pathlib.Path(parent);s=p.lstat();need(s.st_dev==st.st_dev,'CROSS_DEVICE_DIRECTORY');rel=p.relative_to(root).as_posix();dirs[rel]={'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid}
        for n in list(children):
            f=p/n
            if f.is_symlink():names.append(n);children.remove(n)
        for n in names:
            f=p/n;s=f.lstat();rel=f.relative_to(root).as_posix();need(s.st_dev==st.st_dev,'CROSS_DEVICE_FILE')
            if stat.S_ISLNK(s.st_mode):links[rel]={'target':os.readlink(f),'inode':s.st_ino,'mtimeNs':s.st_mtime_ns,'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid};continue
            need(stat.S_ISREG(s.st_mode),'UNSUPPORTED_SOURCE_FILE_TYPE');total+=s.st_size;need(len(files)<300000 and total<=8589934592,'SOURCE_ARCHIVE_SIZE_LIMIT');files[rel]={'sha256':digest(f),'bytes':s.st_size,'inode':s.st_ino,'mtimeNs':s.st_mtime_ns,'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid}
    return{'files':files,'directories':dirs,'symlinks':links,'rootDevice':st.st_dev,'rootInode':st.st_ino,'fileBytes':total}
def database_fingerprint():
    roles=sql("SELECT coalesce(json_agg(r.rolname ORDER BY r.rolname),'[]'::json) FROM pg_roles r WHERE r.oid IN(SELECT refobjid FROM pg_shdepend WHERE dbid=(SELECT oid FROM pg_database WHERE datname='idm')AND refclassid='pg_authid'::regclass UNION SELECT datdba FROM pg_database WHERE datname='idm')")
    objects=sql(OBJECT_SQL,'idm')
    tables=sql(TABLES_SQL,'idm');counts=[]
    for schema,table in tables:
        ident=lambda s:'"'+s.replace('"','""')+'"';counts.append([schema,table,sql('SELECT count(*) FROM '+ident(schema)+'.'+ident(table),'idm')])
    owner=sql("SELECT to_json(pg_get_userbyid(datdba))FROM pg_database WHERE datname='idm'");return{'roles':roles,'databaseOwner':owner,'objects':objects,'rowCounts':counts,'objectDigest':sha(canon(objects)),'rowCountDigest':sha(canon(counts))}
def archive_verify(p,expected):
    seen=set()
    with tarfile.open(p,'r:gz')as tf:
        for m in tf:
            name=m.name.rstrip('/');need(not name.startswith('/')and'..'not in pathlib.PurePosixPath(name).parts,'UNSAFE_ARCHIVE_MEMBER')
            if m.isdir():continue
            need(name in expected and name not in seen,'UNEXPECTED_ARCHIVE_MEMBER');e=expected[name]
            if'mode'in e:need((m.mode,m.uid,m.gid)==(e['mode'],e['uid'],e['gid']),'ARCHIVE_MEMBER_OWNERSHIP_OR_MODE_CHANGED')
            if e['type']=='link':need(m.issym()and m.linkname==e['target'],'ARCHIVE_SYMLINK_CHANGED')
            else:
                need(m.isfile(),'ARCHIVE_MEMBER_TYPE_CHANGED');h=hashlib.sha256();f=tf.extractfile(m)
                for b in iter(lambda:f.read(1048576),b''):h.update(b)
                need(h.hexdigest()==e['sha256'],'ARCHIVE_MEMBER_HASH_CHANGED')
            seen.add(name)
    need(seen==set(expected),'ARCHIVE_MEMBER_MISSING');return len(seen)
def owner_waiver_delete_gate(C,OWNER_WAIVER):
    r=json.loads((STAGE/'backup-receipt.json').read_text());need(r['contractSha256']==C['checkpointContractSha256'] and digest(STAGE/'payload.tar.gz.cms')==r['ciphertextSha256']==C['checkpointCiphertextSha256']and r['manifestSha256']==C['checkpointBackupManifestSha256'],'LOCAL_BACKUP_BINDING_CHANGED')
    need(isinstance(OWNER_WAIVER,dict)and sha(canon(OWNER_WAIVER)+b'\n')==C['approvedOwnerRecoveryWaiverCanonicalSha256'],'EXACT_OWNER_RECOVERY_WAIVER_REQUIRED')
    need(OWNER_WAIVER.get('tenant')=='idm'and OWNER_WAIVER.get('root')==str(ROOT)and OWNER_WAIVER.get('database')=='idm','EXACT_IDM_OWNER_WAIVER_SCOPE_REQUIRED')
    for k in ['directHumanInstruction','deleteWithoutVerifiedRestoreApproved','recoveryRequirementExplicitlyWaived','preserveOtherCustomersAndSharedDependencies','noOffsiteRestorePassClaimed']:
        need(OWNER_WAIVER.get(k)is True,'EXPLICIT_OWNER_RECOVERY_WAIVER_REQUIRED')
    need(OWNER_WAIVER.get('sourceCommit')==C['sourceCommit']and str(OWNER_WAIVER.get('databaseOid'))==str(C['databaseOid'])and OWNER_WAIVER.get('checkpointContractSha256')==C['checkpointContractSha256'],'OWNER_WAIVER_CHECKPOINT_BINDING_CHANGED');return r
def filter_idm_dump(raw):
    items=json.loads(raw);need(isinstance(items,list)and all(isinstance(x,dict)for x in items),'PM2_DUMP_FORMAT_UNKNOWN');matches=[]
    for i,x in enumerate(items):
        e=x.get('pm2_env')or x;name=x.get('name',e.get('name'));cwd=e.get('pm_cwd','');script=e.get('pm_exec_path','');related=name=='idm-api'or cwd==str(ROOT)or str(cwd).startswith(str(ROOT)+'/')or str(script).startswith(str(ROOT)+'/')
        exact=name=='idm-api'and cwd==str(ROOT/'backend')and script==str(ROOT/'backend/server.js')
        need(not related or exact,'UNKNOWN_PERSISTED_IDM_IDENTITY')
        if exact:matches.append(i)
    need(len(matches)<=1,'DUPLICATE_PERSISTED_IDM_IDENTITY')
    if not matches:return raw,False
    remaining=[x for i,x in enumerate(items)if i!=matches[0]];need([x for i,x in enumerate(items)if i!=matches[0]]==remaining,'NON_IDM_OBJECT_CHANGED');return canon(remaining)+b'\n',True
def parent_fd(rootfd,relative):
    parts=pathlib.PurePosixPath(relative).parts;need(parts and'..'not in parts and not relative.startswith('/'),'UNSAFE_RECORDED_DELETE_PATH');fd=os.dup(rootfd)
    for part in parts[:-1]:
        new=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);os.close(fd);fd=new
    return fd,parts[-1]
def remove_recorded_tree(root,m):
    need(manifest(root)==m,'QUARANTINE_MANIFEST_CHANGED');fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        for relative,e in m['files'].items():
            pfd,name=parent_fd(fd,relative)
            try:
                s=os.stat(name,dir_fd=pfd,follow_symlinks=False);need(stat.S_ISREG(s.st_mode)and(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns)==(m['rootDevice'],e['inode'],e['bytes'],e['mtimeNs']),'IMMEDIATE_RECORDED_FILE_DELETE_CAS_FAILED');os.unlink(name,dir_fd=pfd)
            finally:os.close(pfd)
        for relative,e in m['symlinks'].items():
            pfd,name=parent_fd(fd,relative)
            try:
                s=os.stat(name,dir_fd=pfd,follow_symlinks=False);need(stat.S_ISLNK(s.st_mode)and(s.st_dev,s.st_ino,s.st_mtime_ns)==(m['rootDevice'],e['inode'],e['mtimeNs'])and os.readlink(name,dir_fd=pfd)==e['target'],'IMMEDIATE_RECORDED_SYMLINK_DELETE_CAS_FAILED');os.unlink(name,dir_fd=pfd)
            finally:os.close(pfd)
        for relative in sorted((x for x in m['directories']if x!='.'),key=lambda x:len(pathlib.PurePosixPath(x).parts),reverse=True):
            pfd,name=parent_fd(fd,relative)
            try:os.rmdir(name,dir_fd=pfd)
            finally:os.close(pfd)
    finally:os.close(fd)
    root.rmdir()
def main(C,phase,DEREG,OWNER_WAIVER,CONSUMERS=None):
    global CLUSTER_PIN
    need(phase=='delete','OWNER_WAIVER_OPERATOR_IS_DELETE_ONLY')
    os.umask(0o077);os.nice(10);need(C.get('executionReady')is True,'FINAL_REVIEWED_BINDINGS_REQUIRED');need((PG_SOCKET,PG_PORT,PG_ROLE)==('/var/run/postgresql','5432','postgres'),'REVIEWED_PRIVILEGED_POSTGRES_BINDING_REQUIRED');need(C['tenant']=='idm'and C['root']==str(ROOT)and C['stage']==str(STAGE),'EXACT_IDM_SCOPE_REQUIRED')
    lock=os.open('/run/lock/melamedia-release-maintenance.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);app=os.open('/run/lock/melamedia-legal-idm-release.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(app,fcntl.LOCK_EX|fcntl.LOCK_NB)
    try:
        dereg_gate(C,DEREG)
        source_gate(C);s=state();own_gate(C,s,stopped=phase!='quiesce');actualCluster=cluster_identity();CLUSTER_PIN=actualCluster if phase=='quiesce'else json.loads((STAGE/'cluster-before.private.json').read_text());need(actualCluster==CLUSTER_PIN,'POSTGRES_CLUSTER_IDENTITY_CHANGED');db_gate(C,zero=phase!='quiesce')
        if phase=='quiesce':
            need(not STAGE.exists()and not STAGE.is_symlink(),'STAGE_ALREADY_EXISTS');need(VHOST.is_file()and not VHOST.is_symlink()and VHOST.resolve()==VHOST and digest(VHOST)==C['apiVhostSha256'],'API_VHOST_CHANGED');STAGE.mkdir(mode=0o700);write(STAGE/'.mela-retention-pin',{'owner':'Codex/root','reason':'Idm final encrypted source+DB recovery; preserve history','reviewDate':'2026-11-25'});write(STAGE/'own-pm2-before.private.json',s['own']);write(STAGE/'other-processes.private.json',s['others']);write(STAGE/'other-launch-values.private.json',s['otherLaunchPrivate']);write(STAGE/'other-nginx-hashes.private.json',nginx_hashes());write(STAGE/'api-vhost.before.private',VHOST.read_bytes());write(STAGE/'pm2-dump.before.private',pathlib.Path('/root/.pm2/dump.pm2').read_bytes());bak=pathlib.Path('/root/.pm2/dump.pm2.bak')
            if bak.exists():need(bak.is_file()and not bak.is_symlink(),'PM2_FALLBACK_NOT_REGULAR');write(STAGE/'pm2-dump-bak.before.private',bak.read_bytes())
            write(STAGE/'cluster-before.private.json',CLUSTER_PIN);body=tombstone(VHOST.read_bytes());write(STAGE/'api-vhost.tombstone.private',body);journal('quiesce-started')
            install_tombstone_with_owned_rollback(body,C['apiVhostSha256'])
            run(['pm2','stop','6']);after=state();own_gate(C,after,stopped=True);other_gate(after);db_gate(C,zero=True);need(digest(VHOST)==sha(body),'API_TOMBSTONE_CHANGED');write(STAGE/'quiesce-receipt.json',{'contractSha256':CONTRACT_SHA,'at':stamp(),'ownProcessStopped':True,'apiTombstoneSha256':sha(body),'databaseOid':C['databaseOid'],'deregistrationReceiptSha256':C['approvedDeregistrationCanonicalSha256']});journal('quiesce-complete');return{'result':'PASS_IDM_ONLY_REVERSIBLE_QUIESCENCE','tenant':'idm','contractSha256':CONTRACT_SHA,'databaseAndSourceStillPresent':True,'noDatabaseDataMutation':True}
        need(json.loads((STAGE/'quiesce-receipt.json').read_text())['contractSha256']==C['checkpointContractSha256'],'EXACT_QUIESCENCE_REQUIRED');other_gate(s);nginx_gate();need(digest(VHOST)==digest(STAGE/'api-vhost.tombstone.private'),'TOMBSTONE_CAS_CHANGED');tombstone_smoke()
        if phase=='backup':
            need(not(STAGE/'backup-receipt.json').exists(),'BACKUP_ALREADY_CAPTURED');recipient=pathlib.Path(C['publicRecipient']['path']);need(recipient.resolve()==recipient and recipient.is_file()and not recipient.is_symlink(),'PUBLIC_RECIPIENT_PATH_CHANGED');need(digest(recipient)==C['publicRecipient']['sha256'],'PUBLIC_RECIPIENT_CHANGED');m=manifest(ROOT);need(shutil.disk_usage('/root').free>m['fileBytes']*2+C['databaseSizeBytes']*3+134217728,'COMPRESSED_BACKUP_TRANSIENT_DISK_RESERVE_REQUIRED');write(STAGE/'root-manifest.private.json',m);fp=database_fingerprint();write(STAGE/'database-fingerprint.private.json',fp);dump=STAGE/'database.dump'
            verify_cluster()
            with dump.open('xb')as out:privileged('pg_dump',['-Fc','--dbname=idm'],stdout=out,timeout=120)
            dump.chmod(0o600);index=run(['pg_restore','--list',str(dump)]);run(['pg_restore','--file=/dev/null',str(dump)]);db_gate(C,zero=True);need(manifest(ROOT)==m,'ROOT_CHANGED_DURING_FINAL_BACKUP')
            expected={'root/Idm/'+p:{'type':'file',**{k:v[k]for k in['sha256','mode','uid','gid']}}for p,v in m['files'].items()};expected.update({'root/Idm/'+p:{'type':'link',**v}for p,v in m['symlinks'].items()});extras=['root-manifest.private.json','database-fingerprint.private.json','database.dump','own-pm2-before.private.json','api-vhost.before.private','pm2-dump.before.private','other-launch-values.private.json','cluster-before.private.json']
            if(STAGE/'pm2-dump-bak.before.private').exists():extras.append('pm2-dump-bak.before.private')
            expected.update({p:{'type':'file','sha256':digest(STAGE/p)}for p in extras});write(STAGE/'archive-manifest.private.json',expected);expected['archive-manifest.private.json']={'type':'file','sha256':digest(STAGE/'archive-manifest.private.json')};plain=STAGE/'payload.tar.gz';cipher=STAGE/'payload.tar.gz.cms';journal('compressed-final-backup-started')
            run(['tar','--create','--gzip','--file',str(plain),'--numeric-owner','--acls','--xattrs','--one-file-system','--hard-dereference','-C','/','root/Idm','-C',str(STAGE),*extras,'archive-manifest.private.json'],timeout=240);count=archive_verify(plain,expected);need(manifest(ROOT)==m,'SOURCE_CHANGED_DURING_ARCHIVE');plainsha=digest(plain);run(['openssl','cms','-encrypt','-binary','-aes-256-gcm','-outform','DER','-in',str(plain),'-out',str(cipher),str(recipient)],timeout=240);cipher.chmod(0o600);other_gate(state());nginx_gate();db_gate(C,zero=True)
            r={'at':stamp(),'tenant':'idm','result':'PASS_QUIESCED_FINAL_COMPRESSED_ENCRYPTED_BACKUP','contractSha256':CONTRACT_SHA,'manifestSha256':digest(STAGE/'archive-manifest.private.json'),'compressedPlaintextSha256':plainsha,'plaintextArchiveFormat':'tar.gz','ciphertextSha256':digest(cipher),'ciphertextBytes':cipher.stat().st_size,'remoteCiphertext':str(cipher),'verifiedMemberCount':count,'objectDigest':fp['objectDigest'],'rowCountDigest':fp['rowCountDigest'],'roleCount':len(fp['roles']),'databaseDumpSha256':digest(dump),'archiveListSha256':sha(index),'allUniqueRootFilesGitEnvAndIgnoredIncluded':True,'symlinksArchivedWithoutFollowingExternalTargets':True,'offsiteDatabaseRestoreStillRequired':True};write(STAGE/'backup-receipt.json',r);plain.unlink();dump.unlink();journal('encrypted-final-backup-complete',ciphertextSha256=r['ciphertextSha256']);return r
        need(phase=='delete','UNKNOWN_PHASE');owner_waiver_delete_gate(C,OWNER_WAIVER);m=json.loads((STAGE/'root-manifest.private.json').read_text());need(manifest(ROOT)==m,'ROOT_CHANGED_AFTER_VERIFIED_BACKUP');db_gate(C,zero=True);consumerProof=active_consumers_gate(C,CONSUMERS);journal('reviewed-idm-delete-started')
        dumpPath=pathlib.Path('/root/.pm2/dump.pm2');beforeDump=(STAGE/'pm2-dump.before.private').read_bytes();need(dumpPath.read_bytes()==beforeDump,'PERSISTED_PM2_STATE_CHANGED');bak=pathlib.Path('/root/.pm2/dump.pm2.bak');priorBak=STAGE/'pm2-dump-bak.before.private';need((bak.exists()and priorBak.exists()and bak.read_bytes()==priorBak.read_bytes())or(not bak.exists()and not priorBak.exists()),'FALLBACK_PM2_STATE_CHANGED')
        persistence=[(dumpPath,beforeDump,filter_idm_dump(beforeDump))]
        if priorBak.exists():persistence.append((bak,priorBak.read_bytes(),filter_idm_dump(priorBak.read_bytes())))
        quarantine=STAGE/'root-quarantine';need(not quarantine.exists()and not quarantine.is_symlink()and STAGE.stat().st_dev==ROOT.stat().st_dev,'QUARANTINE_TARGET_OR_DEVICE_CHANGED');run(['pm2','delete','6']);other_gate(state());need(state()['own']is None,'IDM_PROCESS_NOT_REMOVED')
        for p,original,(filtered,changed)in persistence:
            need(p.read_bytes()==original,'PM2_DUMP_UNKNOWN_ACTOR_DRIFT')
            if changed:atomic(p,filtered,sha(original))
            need(p.read_bytes()==filtered,'PERSISTED_PM2_FILTER_READBACK_FAILED');need(filter_idm_dump(filtered)[1]is False,'IDM_PM2_RESURRECTION_ENTRY_REMAINS')
        if not priorBak.exists():need(not bak.exists(),'MISSING_PM2_FALLBACK_MUST_REMAIN_MISSING')
        roles=json.loads((STAGE/'database-fingerprint.private.json').read_text())['roles'];role_literals=','.join("'"+x.replace("'","''")+"'"for x in roles);need(bool(roles),'ROLE_PRESERVATION_SET_EMPTY')
        otherDbQuery="SELECT coalesce(json_agg(json_build_array(oid,datname,datdba,datallowconn)ORDER BY oid),'[]'::json)FROM pg_database WHERE datname<>'idm'";otherDatabases=sql(otherDbQuery);verify_cluster();privileged('psql',['-X','-v','ON_ERROR_STOP=1','--dbname=postgres','-c','ALTER DATABASE "idm" ALLOW_CONNECTIONS false']);db_gate(C,zero=True);verify_cluster();privileged('psql',['-X','-v','ON_ERROR_STOP=1','--dbname=postgres','-c','DROP DATABASE "idm"']);need(sql("SELECT to_json(NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='idm'))"),'DATABASE_DROP_NOT_OBSERVED');need(sql('SELECT coalesce(json_agg(rolname ORDER BY rolname),\'[]\'::json)FROM pg_roles WHERE rolname IN('+role_literals+')')==roles,'SHARED_ROLE_PRESERVATION_CHECK_FAILED');need(sql(otherDbQuery)==otherDatabases,'OTHER_DATABASE_CATALOG_CHANGED');journal('exact-database-idm-dropped-no-roles-touched')
        source_gate(C);need(manifest(ROOT)==m,'IMMEDIATE_ROOT_DELETE_CAS_FAILED');os.rename(ROOT,quarantine);need(manifest(quarantine)==m,'QUARANTINE_MANIFEST_CHANGED');remove_recorded_tree(quarantine,m);need(not ROOT.exists()and not quarantine.exists(),'IDM_ROOT_REMOVAL_INCOMPLETE');other_gate(state());nginx_gate();tombstone_smoke();journal('exact-idm-root-retired')
        return{'at':stamp(),'result':'PASS_EXACT_IDM_BACKEND_AND_DATABASE_RETIRED','tenant':'idm','contractSha256':CONTRACT_SHA,'exactDatabaseIdmDropped':True,'exactRootIdmRemoved':True,'pm2Id6RemovedAndActivePlusFallbackPersistenceIdmFree':True,'otherPersistedProcessIdentitiesRetained':True,'transitiveActiveConsumerProof':consumerProof,'allSharedRolesAndOtherProcessesPreserved':True,'apiTombstoneAndAllCertificateLogDnsR2HistoryPreserved':True,'ownerRecoveryRequirementExplicitlyWaived':True,'offsiteFullRestoreNotClaimed':True,'existingCipherRetainedPendingSeparateIdmOnlyBackupDeletionInventory':True}
    except Exception as e:
        if STAGE.is_dir():journal('phase-failed-no-blind-retry',phase=phase,errorClass=type(e).__name__,code=str(e)if isinstance(e,Stop)else'OPERATION_FAILED')
        return{'result':'STOPPED_NO_BLIND_RETRY','tenant':'idm','phase':phase,'code':str(e)if isinstance(e,Stop)else'OPERATION_FAILED','partialMutationPossible':True}
    finally:fcntl.flock(app,fcntl.LOCK_UN);os.close(app);fcntl.flock(lock,fcntl.LOCK_UN);os.close(lock)
