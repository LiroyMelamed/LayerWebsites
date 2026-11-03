"""Mapped-role QA catalog + schema-only stream. No customer data rows or live writes."""
from pathlib import Path
import datetime,hashlib,json,os,re,subprocess
OUT=Path(__file__).parent;PRIVATE=OUT/'private/current-qa-schema';PRIVATE.mkdir(parents=True,exist_ok=True,mode=0o700);PRIVATE.chmod(0o700);(OUT/'private').chmod(0o700)
NODE=r'''
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const root='/root/Melamedia',backend=root+'/backend',meta={startedAtUtc:new Date().toISOString(),databaseScope:'existing Melamedia QA database only',schemaOnly:true,customerRowQueries:0,productionWrites:0,newRolesOrGrants:0};
const H=x=>crypto.createHash('sha256').update(x).digest('hex');
(async()=>{let client;
try{
 if(cp.spawnSync('pgrep',['-f','PM2.*God Daemon'],{stdio:'ignore'}).status!==0)throw Error('EXISTING_PM2_DAEMON_REQUIRED');
 const ps=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:15000})).filter(x=>x.name==='melamedia-api');if(ps.length!==1)throw Error('PROCESS_MAPPING_NOT_UNIQUE');const e=ps[0].pm2_env||{};if(![root,backend].includes(e.pm_cwd))throw Error('PROCESS_SOURCE_MAPPING_CHANGED');
 const file=require(backend+'/node_modules/dotenv').parse(fs.readFileSync(backend+'/.env'));const env={...file,...(e.env||{}),...e};if(env.DB_NAME!=='melamedia'||env.DB_USER!=='melamedia_app'||!['localhost','127.0.0.1','::1'].includes(String(env.DB_HOST||'localhost'))||String(env.DB_PORT||5432)!=='5432')throw Error('MAPPED_QA_ROLE_DATABASE_NOT_CONFIRMED');
 const {Client}=require(backend+'/node_modules/pg');let ssl=false;if(env.DB_SSL==='true'){ssl={rejectUnauthorized:env.DB_SSL_REJECT_UNAUTHORIZED!=='false'};if(env.DB_SSL_CA_PATH)ssl.ca=fs.readFileSync(env.DB_SSL_CA_PATH,'utf8');}
 client=new Client({host:env.DB_HOST||'localhost',port:5432,database:'melamedia',user:'melamedia_app',password:env.DB_PASSWORD,ssl,connectionTimeoutMillis:8000,options:'-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=1000'});await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const identity=(await client.query("SELECT current_user,current_database() AS db,current_setting('transaction_read_only') AS ro,current_setting('server_version') AS server_version")).rows[0];if(identity.current_user!=='melamedia_app'||identity.db!=='melamedia'||identity.ro!=='on')throw Error('READONLY_QA_IDENTITY_MISMATCH');
 meta.identity=identity;meta.extensions=(await client.query("SELECT e.extname,e.extversion,n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname IN ('vector','pgcrypto') ORDER BY e.extname")).rows;meta.publicTableCount=Number((await client.query("SELECT count(*) AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')")).rows[0].n);meta.userSchemaCount=Number((await client.query("SELECT count(*) AS n FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'")).rows[0].n);
 await client.query('ROLLBACK');await client.end();client=null;meta.catalogTransactionEnded='ROLLBACK';meta.codeBaseline=cp.execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();meta.backendTree=cp.execFileSync('git',['-C',root,'rev-parse','HEAD:backend'],{encoding:'utf8'}).trim();meta.pgDumpVersion=cp.execFileSync('pg_dump',['--version'],{encoding:'utf8'}).trim();
 const denv={PATH:process.env.PATH,LANG:'C',PGHOST:env.DB_HOST||'localhost',PGPORT:'5432',PGDATABASE:'melamedia',PGUSER:'melamedia_app',PGPASSWORD:env.DB_PASSWORD||'',PGAPPNAME:'codex-readonly-qa-schema-metadata',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=1000'};if(env.DB_SSL==='true'){denv.PGSSLMODE=env.DB_SSL_REJECT_UNAUTHORIZED==='false'?'require':'verify-full';if(env.DB_SSL_CA_PATH)denv.PGSSLROOTCERT=env.DB_SSL_CA_PATH;}else denv.PGSSLMODE='disable';
 const args=['--schema-only','--no-owner','--no-privileges','--no-comments','--no-security-labels','--no-publications','--no-subscriptions','--lock-wait-timeout=5s','--format=plain','--dbname=melamedia'];meta.pgDumpArguments=args;meta.dumpRole='melamedia_app';meta.dumpHostScope='verified existing local5432 QA mapping';
 const child=cp.spawn('pg_dump',args,{env:denv,stdio:['ignore','pipe','pipe']});let stderr='',bytes=0;const hash=crypto.createHash('sha256');child.stdout.on('data',b=>{bytes+=b.length;hash.update(b);process.stdout.write(b);});child.stderr.on('data',b=>{if(stderr.length<32768)stderr+=b.toString();});const timer=setTimeout(()=>child.kill('SIGTERM'),90000);const status=await new Promise(resolve=>child.on('close',(code,signal)=>resolve({code,signal})));clearTimeout(timer);meta.dumpExit=status.code;meta.dumpSignal=status.signal;meta.schemaDumpBytes=bytes;meta.schemaDumpSha256=hash.digest('hex');meta.result=status.code===0?'PASS_CURRENT_QA_SCHEMA_ONLY_CAPTURE':/permission denied/i.test(stderr)?'HOLD_EXISTING_APP_ROLE_LACKS_SCHEMA_DUMP_PERMISSION':'HOLD_SCHEMA_DUMP_FAILED';meta.stderrBytes=Buffer.byteLength(stderr);meta.stderrSha256=H(stderr);meta.completedAtUtc=new Date().toISOString();process.stderr.write('SCHEMA_METADATA='+JSON.stringify(meta)+'\n');process.exitCode=status.code===0?0:1;
}catch(e){if(client){try{await client.query('ROLLBACK');}catch{}try{await client.end();}catch{}}meta.result='HOLD_READONLY_QA_METADATA';meta.errorCode=e.code||e.name;meta.reason=/^[A-Z_]+$/.test(e.message||'')?e.message:'QA_METADATA_FAILED_PRIVATE_DIAGNOSTIC_SUPPRESSED';meta.completedAtUtc=new Date().toISOString();process.stderr.write('SCHEMA_METADATA='+JSON.stringify(meta)+'\n');process.exitCode=1;}
})();
'''
PREFIX=r'''
import os,fcntl,subprocess,sys
fds=[]
for name in ['melamedia-release-maintenance','melamedia-legal-melamedia-release']:
 fd=os.open('/run/lock/'+name+'.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_SH|fcntl.LOCK_NB);fds.append(fd)
NODE=NODE_PLACEHOLDER
raise SystemExit(subprocess.run(['node','-e',NODE],stdout=sys.stdout.buffer,stderr=sys.stderr).returncode)
'''
if __name__=='__main__':
 target=PRIVATE/'schema-only.sql';fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
 with os.fdopen(fd,'wb')as output:
  proc=subprocess.run(['ssh','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','root@37.60.230.148','python3 -'],input=PREFIX.replace('NODE_PLACEHOLDER',repr(NODE),1).encode(),stdout=output,stderr=subprocess.PIPE,timeout=125)
 stderr=proc.stderr.decode(errors='replace');matches=re.findall(r'^SCHEMA_METADATA=(.*)$',stderr,re.M);meta=json.loads(matches[-1])if matches else{'result':'HOLD_NO_STRUCTURED_REMOTE_METADATA','stderrBytes':len(proc.stderr),'stderrSha256':hashlib.sha256(proc.stderr).hexdigest()};raw=target.read_bytes();meta.update(sshExit=proc.returncode,privateSchemaPath=str(target),localSchemaDumpBytes=len(raw),localSchemaDumpSha256=hashlib.sha256(raw).hexdigest());meta['streamHashMatches']=meta.get('schemaDumpSha256')==meta['localSchemaDumpSha256']
 if proc.returncode==0:
  text=raw.decode();filtered='\n'.join(line for line in text.splitlines()if line.strip()and not line.lstrip().startswith('--')and not re.match(r'^\\(?:un)?restrict(?:\s|$)',line))+'\n';meta['filteredDDLHash']=hashlib.sha256(filtered.encode()).hexdigest();meta['filteredDDLBytes']=len(filtered.encode());meta['filterDescription']='Normalization only: omit dump comment/blank lines and pg_dump restrict/unrestrict session tokens; no schema definitions are removed or executed.';meta['createTableStatements']=len(re.findall(r'^CREATE TABLE\s',text,re.M))
 (PRIVATE/'metadata.json').write_text(json.dumps(meta,indent=2)+'\n');(PRIVATE/'metadata.json').chmod(0o600);print(json.dumps({k:v for k,v in meta.items()if k not in['privateSchemaPath','pgDumpArguments']},indent=2))
