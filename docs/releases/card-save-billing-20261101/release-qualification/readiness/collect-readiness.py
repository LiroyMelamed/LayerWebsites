"""Existing-access catalog/backup metadata only; no customer rows or mutations."""
import concurrent.futures
import datetime
import json
from pathlib import Path
import subprocess

OUT = Path(__file__).parent
TARGETS = [
    dict(tenant='MelamedLaw', root='/root/LayerWebsites', process='melamed-backend', database='melamedlaw', role='liroym', lock='melamedlaw'),
    dict(tenant='MorLevi', root='/root/MorLevi', process='morlevy-api', database='morlevy', role='morlevy_app', lock='morlevy'),
    dict(tenant='AshrafEssa', root='/root/AshrafEssa', process='ashrafessa-api', database='ashrafessa', role='ashrafessa_app', lock='ashrafessa'),
    dict(tenant='Melamedia', root='/root/Melamedia', process='melamedia-api', database='melamedia', role='melamedia_app', lock='melamedia'),
]
NODE = r'''
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const T=TARGET, backend=T.root+'/backend', envPath=backend+'/.env';
const out={target:T.tenant,atUtc:new Date().toISOString(),scope:'catalogs and grants only; no customer or billing rows',providerCalls:0,customerRowQueries:0};
const H=x=>crypto.createHash('sha256').update(x).digest('hex');
(async()=>{let client;
 try{
  const running=cp.spawnSync('pgrep',['-f','PM2.*God Daemon'],{encoding:'utf8'});if(running.status!==0)throw Error('EXISTING_PM2_DAEMON_REQUIRED');
  const all=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:15000}));const matches=all.filter(p=>p.name===T.process);
  if(matches.length!==1)throw Error('PROCESS_MAPPING_NOT_UNIQUE');const e=matches[0].pm2_env||{};
  if(![backend,T.root].includes(e.pm_cwd))throw Error('PROCESS_SOURCE_MAPPING_CHANGED');
  const file=require(backend+'/node_modules/dotenv').parse(fs.readFileSync(envPath));const env={...file,...(e.env||{}),...e};
  if(env.DB_NAME!==T.database||env.DB_USER!==T.role||!['127.0.0.1','localhost','::1'].includes(String(env.DB_HOST||'localhost'))||String(env.DB_PORT||5432)!=='5432')throw Error('DB_MAPPING_NOT_CONFIRMED');
  out.existingMappedAppRoleConfirmed=true;out.processOnline=e.status==='online';
  let ssl=false;if(env.DB_SSL==='true'){ssl={rejectUnauthorized:env.DB_SSL_REJECT_UNAUTHORIZED!=='false'};if(env.DB_SSL_CA_PATH)ssl.ca=fs.readFileSync(path.resolve(backend,env.DB_SSL_CA_PATH),'utf8');}
  const {Client}=require(backend+'/node_modules/pg');
  client=new Client({host:env.DB_HOST||'localhost',port:5432,database:env.DB_NAME,user:env.DB_USER,password:env.DB_PASSWORD,ssl,connectionTimeoutMillis:8000,
   options:'-c default_transaction_read_only=on -c statement_timeout=8000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=20000'});
  await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const identity=(await client.query("SELECT current_user,current_database() AS db,current_setting('transaction_read_only') AS ro")).rows[0];
  if(identity.ro!=='on'||identity.db!==T.database||identity.current_user!==T.role)throw Error('READONLY_IDENTITY_NOT_CONFIRMED');
  out.transactionReadOnly=true;
  out.role=(await client.query('SELECT rolsuper AS superuser,rolbypassrls AS bypass_rls,rolcanlogin AS can_login FROM pg_roles WHERE rolname=current_user')).rows[0];
  const names=['users','signingfiles','signing_owner_contexts','signing_word_sources','signing_word_previews','signing_word_authoring_renders','firm_billing','firm_payment_intents','firm_payment_methods','firm_payment_events','signup_intents'];
  out.tables=(await client.query(`SELECT c.relname AS name,c.relkind AS kind,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
   has_table_privilege(current_user,c.oid,'SELECT') AS can_select,has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
   has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,has_table_privilege(current_user,c.oid,'DELETE') AS can_delete
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,[names])).rows;
  out.profileColumn=(await client.query("SELECT data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='client_profile'")).rows;
  const constraints=(await client.query(`SELECT c.conname AS name,c.contype AS type,r.relname AS table_name,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND ((r.relname='users' AND c.conname='users_client_profile_bounded_object') OR r.relname='signing_word_authoring_renders') ORDER BY r.relname,c.conname`)).rows;
  out.constraints=constraints.map(c=>({name:c.name,type:c.type,table:c.table_name,definitionSha256:H(c.definition),
   objectBound:c.table_name==='users'?c.definition.includes('object'):undefined,sizeBound:c.table_name==='users'?c.definition.includes('8192'):undefined}));
  out.authoringColumns=(await client.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='signing_word_authoring_renders' ORDER BY ordinal_position")).rows;
  out.authoringTriggers=(await client.query(`SELECT t.tgname AS name,t.tgenabled AS enabled,p.proname AS function_name,pg_get_triggerdef(t.oid) AS definition,pg_get_functiondef(p.oid) AS function_definition
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE n.nspname='public' AND c.relname='signing_word_authoring_renders' AND NOT t.tgisinternal ORDER BY t.tgname`)).rows.map(t=>({name:t.name,enabled:t.enabled,function:t.function_name,definitionSha256:H(t.definition),functionSha256:H(t.function_definition)}));
  out.policies=(await client.query("SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[]) ORDER BY tablename,policyname",[names])).rows.map(p=>({table:p.tablename,name:p.policyname,command:p.cmd,definitionSha256:H(JSON.stringify(p))}));
  out.authoringIndexes=(await client.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='signing_word_authoring_renders' ORDER BY indexname")).rows.map(i=>({name:i.indexname,definitionSha256:H(i.indexdef),unique:i.indexdef.includes('UNIQUE')}));
  const by=Object.fromEntries(out.tables.map(x=>[x.name,x]));
  const trigger=out.authoringTriggers.find(x=>x.name==='signing_word_authoring_renders_immutable'&&x.function==='signing_word_record_immutable'&&x.enabled!=='D');
  const bound=out.constraints.find(x=>x.table==='users'&&x.objectBound&&x.sizeBound);
  out.checks={allRequiredTablesPresent:names.every(n=>by[n]),profileJsonb:out.profileColumn[0]?.udt_name==='jsonb',profileBoundedObject:Boolean(bound),authoringImmutableTrigger:Boolean(trigger),
   appRoleSelectInsert:by.signing_word_authoring_renders?.can_select===true&&by.signing_word_authoring_renders?.can_insert===true,
   authoringInsertMatchesIncumbentSigningfiles:!by.signingfiles?.can_insert||by.signing_word_authoring_renders?.can_insert===true,
   nonSuperuser:out.role?.superuser===false,nonBypassRls:out.role?.bypass_rls===false};
  out.status=Object.values(out.checks).every(Boolean)?'CATALOG_CHECKS_PASS':'CATALOG_REVIEW_REQUIRED';
  await client.query('ROLLBACK');out.transactionEnded='ROLLBACK';
 }catch(e){if(client)try{await client.query('ROLLBACK');}catch{}out.status='BLOCKED_READONLY_METADATA';out.errorCode=e.code||e.name;out.reason=/^[A-Z_]+$/.test(e.message||'')?e.message:'METADATA_QUERY_FAILED_NO_PRIVATE_DIAGNOSTIC';}
 finally{if(client)await client.end().catch(()=>{});out.completedAtUtc=new Date().toISOString();console.log(JSON.stringify(out));}
})();
'''

COMMON = r'''
import datetime,os,fcntl,json,hashlib,subprocess
from pathlib import Path
fds=[]
def lock(name):
 fd=os.open('/run/lock/'+name+'.lock',os.O_RDONLY|os.O_NOFOLLOW)
 try:fcntl.flock(fd,fcntl.LOCK_SH|fcntl.LOCK_NB)
 except Exception:os.close(fd);raise
 fds.append(fd)
try:lock('melamedia-release-maintenance')
except (FileNotFoundError,BlockingIOError):
 print(json.dumps({'status':'DEFERRED_EXISTING_MAINTENANCE_LOCK'}));raise SystemExit(0)
def backup():
 p=Path('/var/lib/melamedia-backup-watch/latest-health.json')
 if not p.is_file():return {'status':'MISSING_EXISTING_BACKUP_HEALTH_REPORT'}
 raw=p.read_bytes();v=json.loads(raw);now=datetime.datetime.now(datetime.timezone.utc)
 try:age=(now-datetime.datetime.fromisoformat(v.get('utc','').replace('Z','+00:00'))).total_seconds()
 except Exception:age=None
 checks=v.get('checks',[]);fail=v.get('failures',[])
 return {'status':'EXISTING_REPORT_READ_ONLY','reportSha256':hashlib.sha256(raw).hexdigest(),'reportedAtUtc':v.get('utc'),'ageSeconds':age,'healthyReported':v.get('healthy') is True,
 'failureCount':len(fail) if isinstance(fail,list) else None,'checkCount':len(checks) if isinstance(checks,list) else None,
 'checkKeys':sorted({k for c in checks if isinstance(c,dict) for k in c}) if isinstance(checks,list) else [],
 'allChecksReportVerifiedReadback':bool(checks) and all(c.get('offsite')=='verified_readback' for c in checks),
 'freshWithinTwoHourReleaseGate':age is not None and 0<=age<7200,'independentNewReadback':False,'restoreExecuted':False,
 'targetCheckSummaries':[{k:c[k] for k in ['project','database','name','offsite','status','age_hours','ageHours','size','bytes','sha256','lastBackupUtc'] if k in c} for c in checks if isinstance(c,dict) and any(x in str(c.get('project',''))+' '+str(c.get('database',''))+' '+str(c.get('name','')) for x in ['melamed','ashraf','morlev','Melamed','Ashraf','MorLevi'])]}
'''

def remote(host, code):
    p=subprocess.run(['ssh','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','root@'+host,'python3 -'],input=code,capture_output=True,text=True,timeout=125)
    try:data=json.loads(p.stdout)
    except ValueError:data={'status':'UNSTRUCTURED_RESPONSE','stdoutBytes':len(p.stdout),'stderrBytes':len(p.stderr)}
    return {'sshExit':p.returncode,**data}

def backend_code():
    body=COMMON+'\nTARGETS='+repr(TARGETS)+'\nNODE='+repr(NODE)+r'''
out={'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'backup':backup(),'schemaRows':[]}
for t in TARGETS:
 try:lock('melamedia-legal-'+t['lock']+'-release')
 except (FileNotFoundError,BlockingIOError):
  out['schemaRows'].append({'target':t['tenant'],'status':'DEFERRED_EXISTING_TENANT_LOCK'});continue
 code=NODE.replace('TARGET',json.dumps(t),1)
 p=subprocess.run(['node','-e',code],capture_output=True,text=True,timeout=60)
 try:v=json.loads(p.stdout)
 except ValueError:v={'target':t['tenant'],'status':'UNSTRUCTURED_METADATA_RESPONSE','stdoutBytes':len(p.stdout),'stderrBytes':len(p.stderr)}
 v['collectorExit']=p.returncode;out['schemaRows'].append(v)
out['providerCalls']=0;out['customerRowQueries']=0;out['mutations']=0
print(json.dumps(out))
'''
    return body

def main():
    result={'startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Existing backup-health report metadata and catalog-only SELECTs, existing app role/DB mapping, read-only transaction and locks. No customer rows, provider, app modules, jobs, DB backup/restore, new access or mutation.'}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs={pool.submit(remote,'37.60.230.148',backend_code()):'backend',pool.submit(remote,'84.46.253.85',COMMON+"\nprint(json.dumps({'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'backup':backup(),'mutations':0}))\n"):'frontend'}
        for job in concurrent.futures.as_completed(jobs):
            try:result[jobs[job]]=job.result()
            except Exception as e:result[jobs[job]]={'status':'FAILED_READONLY_OBSERVATION','errorType':type(e).__name__}
    result['completedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    (OUT/'remote-readiness.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'evidence':str(OUT/'remote-readiness.json'),'backendBackup':result.get('backend',{}).get('backup'),'frontendBackup':result.get('frontend',{}).get('backup'),'schema':[{k:r.get(k) for k in ['target','status','checks','reason','errorCode']} for r in result.get('backend',{}).get('schemaRows',[])]},indent=2))

if __name__=='__main__':main()
