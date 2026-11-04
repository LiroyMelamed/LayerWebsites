
import os,re,fcntl,json,subprocess,datetime,time,hashlib,socket
from pathlib import Path
fds=[]
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def lock(name):
 fd=os.open('/run/lock/'+name+'.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_SH|fcntl.LOCK_NB);fds.append(fd)
FLAGS=['BILLING_OPERATIONS_ENABLED','BACKGROUND_JOBS_ENABLED','BILLING_RENEWAL_SCHEDULER_ENABLED','SIGNING_V2_WORKER_ENABLED','WHATSAPP_WORKER_ENABLED','WHATSAPP_DEMO_WORKER_ENABLED','COURT_DEMO_SYNC_WORKER_ENABLED','CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED','GIT_SHA','MULTI_TENANT_MODE','TENANT_DB_ISOLATION_ENABLED','SELF_SERVICE_SIGNUP_ENABLED','TAKBULL_MODE','QA_OUTBOUND_MODE','CENTRAL_SYSTEM_MESSAGES_CAPTURE_ENABLED','WHATSAPP_DEMO_ONLY','WHATSAPP_CONNECT_ONLY']
META=['kill_timeout','autorestart','exec_mode','instances','pm_id','pm_uptime','status','PM2_KILL_TIMEOUT']
DBKEYS=['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','DB_SSL','PORT']
SELECT=set(FLAGS+META+DBKEYS+['DATABASE_URL'])
def parse_value(v):
 v=v.strip()
 if v[:1] in ['"',"'",'`']:
  if len(v)<2 or v[-1:]!=v[:1]:raise Exception('UNSUPPORTED_MULTILINE_SELECTED_VALUE')
  return v[1:-1]
 return v.split('#',1)[0].strip()
def selected_file(p):
 out={}
 with p.open('rb')as f:
  for line in f:
   line=line.lstrip()
   if line.startswith(b'export '):line=line[7:].lstrip()
   k,sep,v=line.partition(b'=')
   if not sep:continue
   key=k.strip().decode('ascii',errors='ignore')
   if key not in SELECT:continue
   if key=='DATABASE_URL':out[key]=bool(v.strip());continue
   out[key]=parse_value(v.decode())
 return out
def selected_proc(pid,allowed=SELECT):
 out={};key=bytearray();value=bytearray();in_value=False;keep=False
 with Path('/proc/'+str(pid)+'/environ').open('rb')as f:
  while True:
   b=f.read(1)
   if not b:break
   if b==b'\0':
    if in_value and keep:
     k=key.decode();out[k]=bool(value) if k=='DATABASE_URL' else value.decode()
    key.clear();value.clear();in_value=False;keep=False;continue
   if not in_value:
    if b==b'=':
     in_value=True;keep=key.decode(errors='ignore')in allowed
    elif len(key)<256:key.extend(b)
   elif keep:
    if len(value)>32768:raise Exception('OVERSIZED_SELECTED_VALUE')
    value.extend(b)
 return out
def git(*a):
 p=subprocess.run(['git','-C','/root/Melamedia',*a],capture_output=True,text=True,timeout=15,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'});return {'exit':p.returncode,'stdout':p.stdout.strip(),'stderrBytes':len(p.stderr)}
def qa_pid():
 f=Path('/root/.pm2/pm2.pid')
 if not f.is_file():raise Exception('EXISTING_PM2_DAEMON_REQUIRED')
 os.kill(int(f.read_text().strip()),0)
 p=subprocess.run(['pm2','pid','melamedia-api'],capture_output=True,text=True,timeout=12)
 ids=[int(x)for x in p.stdout.splitlines()if re.fullmatch('[1-9][0-9]*',x)]
 if p.returncode or len(ids)!=1:raise Exception('QA_PID_NOT_UNIQUE')
 return ids[0]
def process_meta(pid):
 stat=Path('/proc/'+str(pid)+'/stat').read_text();rest=stat[stat.rfind(')')+2:].split()
 return {'pid':pid,'procCwd':os.readlink('/proc/'+str(pid)+'/cwd'),'procExe':os.readlink('/proc/'+str(pid)+'/exe'),'startTicks':int(rest[19]),'cmdlineContainsExpectedServerPath':b'/root/Melamedia/backend/server.js'in Path('/proc/'+str(pid)+'/cmdline').read_bytes()}
def socket_counts(pid):
 p=subprocess.run(['ss','-H','-t','-n','-p'],capture_output=True,text=True,timeout=10);r={'ssExit':p.returncode,'qaPortConnectionStates':{},'processOutgoingCategories':{}}
 if p.returncode:return r
 for line in p.stdout.splitlines():
  fields=line.split()
  if len(fields)<5:continue
  state,local,peer=fields[0],fields[3],fields[4]
  localport=local.rsplit(':',1)[-1];peerport=peer.rsplit(':',1)[-1]
  if localport=='3003':r['qaPortConnectionStates'][state]=r['qaPortConnectionStates'].get(state,0)+1
  if re.search(r'\bpid='+str(pid)+r'\b',line) and localport!='3003':
   host=peer.rsplit(':',1)[0].strip('[]')
   kind='loopback_db'if host in ['127.0.0.1','::1']and peerport=='5432'else'loopback_other'if host in ['127.0.0.1','::1']else'nonloopback_unknown_purpose'
   key=state+':'+kind;r['processOutgoingCategories'][key]=r['processOutgoingCategories'].get(key,0)+1
 return r

import ipaddress

def classify(a,p):
 h=a.rsplit(':',1)[0].strip('[]');mapped=False
 try:
  x=ipaddress.ip_address(h.split('%',1)[0])
  if isinstance(x,ipaddress.IPv6Address)and x.ipv4_mapped is not None:x=x.ipv4_mapped;mapped=True
  loop=x.is_loopback
  c='loopback_db'if loop and p==5432 else'loopback_other'if loop else'nonloopback_unknown_purpose'
  return c,mapped,loop
 except ValueError:return'unclassified_address',False,False

def sockets(pid):
 p=subprocess.run(['ss','-H','-t','-n','-p','-i','-e'],capture_output=True,text=True,timeout=10)
 fdmap={}
 for f in Path('/proc/'+str(pid)+'/fd').iterdir():
  try:
   m=re.fullmatch(r'socket:\[(\d+)\]',os.readlink(f))
   if m:fdmap.setdefault(m.group(1),[]).append(int(f.name))
  except OSError:pass
 rows=[];lines=p.stdout.splitlines();i=0
 while i<len(lines):
  line=lines[i];i+=1
  if not re.search(r'\bpid='+str(pid)+r'\b',line):continue
  fields=line.split()
  if len(fields)<5:continue
  state,local,peer=fields[0],fields[3],fields[4]
  try:lp=int(local.rsplit(':',1)[-1]);pp=int(peer.rsplit(':',1)[-1])
  except ValueError:continue
  extra=''
  while i<len(lines)and lines[i][:1].isspace():extra+=' '+lines[i].strip();i+=1
  cat,mapped,loop=classify(peer,pp);inode=re.search(r'\bino:(\d+)\b',line);inode=inode.group(1)if inode else None
  info={}
  for k in ['bytes_sent','bytes_acked','bytes_received','lastsnd','lastrcv','lastack','segs_out','segs_in','notsent','unacked']:
   m=re.search(r'\b'+k+r':(\d+)\b',extra)
   if m:info[k]=int(m.group(1))
  rows.append({'state':state,'direction':'inbound_qa_http'if lp==3003 else'outbound_or_other','localPort':lp,'peerPort':pp,'peerCategory':cat,'peerIsLoopbackAfterNormalization':loop,'peerUsesIpv4Mapping':mapped,'inode':inode,'qaFdNumbers':fdmap.get(inode,[]),'inodeBelongsToQaFd':bool(fdmap.get(inode)),'tcpInfo':info})
 return {'ssExit':p.returncode,'connections':rows,'rawAddressOrPacketOutput':False}


result={'startedAtUtc':now(),'target':'existing Melamedia QA only','process':'melamedia-api','database':'melamedia','role':'melamedia_app','remoteMutations':0,'providerCalls':0,'customerOrReferenceRowsExported':0,'credentialSelection':'Only required DB keys and explicit nonsecret flag/metadata allowlist; no full env/jlist/dump dictionary parsed/exported','samples':[]}
try:
 lock('melamedia-release-maintenance');lock('melamedia-legal-melamedia-release')
 result['locks']='existing maintenance and QA tenant shared/nonblocking held for complete observation'
 pid=qa_pid();result['processBefore']=process_meta(pid);initial=selected_proc(pid);daemonpid=int(Path('/root/.pm2/pm2.pid').read_text().strip());daemonselected=selected_proc(daemonpid,{'PM2_KILL_TIMEOUT'});result['daemonKillTimeout']={'daemonPid':daemonpid,'initialPM2_KILL_TIMEOUT':int(daemonselected['PM2_KILL_TIMEOUT'])if str(daemonselected.get('PM2_KILL_TIMEOUT','')).isdigit()else None,'limit':'Only this allowlisted nonsecret daemon value exported; unset is unknown, not a default.'};file=selected_file(Path('/root/Melamedia/backend/.env'));e={**file,**initial}
 if e.get('DATABASE_URL') or e.get('DB_NAME')!='melamedia'or e.get('DB_USER')!='melamedia_app'or e.get('DB_HOST','localhost')not in ['localhost','127.0.0.1','::1']or str(e.get('DB_PORT','5432'))!='5432'or e.get('PORT')!='3003':raise Exception('QA_MAPPING_MISMATCH')
 if str(e.get('DB_SSL','')).lower()=='true':raise Exception('SSL_MAPPING_REQUIRES_EXISTING_REVIEW')
 def safe(k,v):
  if v is None:return None
  if k=='GIT_SHA':return v if re.fullmatch('[0-9a-f]{7,40}',v)else'INVALID_OR_UNBOUND_REDACTED'
  if k in ['exec_mode','status']:return v if v in ['fork_mode','cluster_mode','online','stopped','launching','errored']else'OTHER_REDACTED'
  if k in ['kill_timeout','instances','pm_id','pm_uptime','PM2_KILL_TIMEOUT']:return int(v)if str(v).isdigit()else'INVALID_REDACTED'
  return v if str(v).lower()in ['true','false','1','0','prod','production','test','sandbox','noop','']else'OTHER_REDACTED'
 result['initialFlags']={k:safe(k,initial.get(k))for k in FLAGS};result['fileFlags']={k:safe(k,file.get(k))for k in FLAGS};result['effectiveProjection']={k:safe(k,e.get(k))for k in FLAGS}
 result['initialProcessMetadataAllowlist']={k:safe(k,initial.get(k))for k in META};result['processEnvironmentLimit']='Initial /proc values plus current file boot projection do not prove arbitrary in-process changes.'
 result['envFileSha256']=hashlib.sha256(Path('/root/Melamedia/backend/.env').read_bytes()).hexdigest()
 result['sourceBefore']={'head':git('rev-parse','HEAD'),'branch':git('branch','--show-current'),'trackedStatus':git('status','--porcelain','--untracked-files=no'),'backendTree':git('rev-parse','HEAD:backend'),'backendEntries':git('ls-tree','-r','HEAD','--','backend')}
 mf=Path('/root/Melamedia/docs/signing-v2/release-baseline.json');manifest=json.loads(mf.read_text());mismatches=[]
 for path,expected in manifest.get('files',{}).items():
  f=(Path('/root/Melamedia')/path).resolve();f.relative_to(Path('/root/Melamedia'))
  if not f.is_file()or hashlib.sha256(f.read_bytes()).hexdigest()!=expected:mismatches.append(path)
 result['protected']={'entries':len(manifest.get('files',{})),'mismatches':mismatches}
 penv={k:os.environ[k]for k in ['PATH','HOME','LANG']if k in os.environ};penv.update(PGHOST=e.get('DB_HOST','localhost'),PGPORT='5432',PGDATABASE='melamedia',PGUSER='melamedia_app',PGPASSWORD=e.get('DB_PASSWORD',''),PGCONNECT_TIMEOUT='8',PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=15000 -c application_name=qa_pause_readonly_audit',PGSSLMODE='disable')
 def sql(s):
  body='BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'+s+'\nROLLBACK;'
  p=subprocess.run(['psql','-X','-q','-A','-t','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],input=body,capture_output=True,text=True,env=penv,timeout=20)
  if p.returncode:return {'ok':False,'exit':p.returncode,'sqlstate':re.findall(r'\b[0-9A-Z]{5}\b',p.stderr)[:2],'stderrBytes':len(p.stderr),'transactionEnded':'disconnected without commit'}
  decoder=json.JSONDecoder();rest=p.stdout.strip();rows=[]
  while rest:
   value,end=decoder.raw_decode(rest);rows.append(value);rest=rest[end:].lstrip()
  return {'ok':True,'rows':rows,'transactionEnded':'ROLLBACK'}
 tables=['firm_payment_intents','firm_billing','firm_payment_methods','signup_intents','central_system_message_outbox','signing_jobs','signing_deliveries','signing_error_emails','signing_batches','signing_batch_recipients','office_integrations','case_whatsapp_groups','signing_package_completions','signing_batch_reminders','signing_otp_challenges_v2','firm_payment_events']
 catalog=sql("SELECT json_build_object('identity',json_build_object('user',current_user,'database',current_database(),'readOnly',current_setting('transaction_read_only')),'tables',(SELECT coalesce(json_agg(x),'[]'::json) FROM(SELECT c.relname AS name,has_table_privilege(current_user,c.oid,'SELECT')AS can_select,(SELECT json_agg(a.attname ORDER BY a.attnum)FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)AS columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relkind IN('r','p')AND c.relname=ANY(ARRAY["+','.join("'"+t+"'"for t in tables)+"]::text[]))x));")
 result['catalog']=catalog
 if not catalog.get('ok'):raise Exception('CATALOG_UNAVAILABLE')
 data=catalog['rows'][0]
 if data['identity']!={'user':'melamedia_app','database':'melamedia','readOnly':'on'}:raise Exception('READONLY_IDENTITY_MISMATCH')
 cols={t['name']:set(t['columns'])for t in data['tables']if t['can_select']}
 queries={};gaps=[]
 def add(key,table,required,query):
  if table not in cols:gaps.append({'key':key,'reason':'TABLE_ABSENT_OR_EXISTING_SELECT_DENIED'});return
  if not set(required)<=cols[table]:gaps.append({'key':key,'reason':'REQUIRED_COLUMNS_MISSING','missing':sorted(set(required)-cols[table])});return
  queries[key]=query
 add('paymentIntents','firm_payment_intents',['kind','status','takbull_uniq_id','takbull_transaction_id','law_firm_tenant_id','created_at','updated_at'],"SELECT json_build_object('scope',CASE WHEN law_firm_tenant_id IS NULL THEN'dedicated'ELSE'tenant_aggregate'end,'kind',CASE WHEN kind IN('setup','renewal','annual','retry','upgrade')THEN kind ELSE'unrecognized_redacted'end,'status',CASE WHEN status IN('pending','succeeded','failed','cancelled')THEN status ELSE'unrecognized_redacted'end,'count',count(*),'hostedReferences',count(*)FILTER(WHERE nullif(takbull_uniq_id,'')IS NOT NULL),'transactionReferences',count(*)FILTER(WHERE nullif(takbull_transaction_id,'')IS NOT NULL),'pendingWithoutProviderReference',count(*)FILTER(WHERE status='pending'AND nullif(takbull_uniq_id,'')IS NULL AND nullif(takbull_transaction_id,'')IS NULL),'createdHighWater',max(created_at),'updatedHighWater',max(updated_at))FROM public.firm_payment_intents GROUP BY(law_firm_tenant_id IS NULL),kind,status ORDER BY(law_firm_tenant_id IS NULL),kind,status;")
 add('billingCandidates','firm_billing',['status','billing_enabled','auto_renew','complimentary_until','renews_at','last_failed_at','updated_at'],"SELECT json_build_object('rows',count(*),'billingEnabled',count(*)FILTER(WHERE billing_enabled),'autoRenewEnabled',count(*)FILTER(WHERE billing_enabled AND coalesce(auto_renew,true)),'activeDueCandidates',count(*)FILTER(WHERE billing_enabled AND coalesce(auto_renew,true)AND(complimentary_until IS NULL OR complimentary_until<=now())AND status='active'AND(renews_at IS NULL OR renews_at<=now())),'pastDueRetryCandidates',count(*)FILTER(WHERE billing_enabled AND coalesce(auto_renew,true)AND(complimentary_until IS NULL OR complimentary_until<=now())AND status='past_due'AND(last_failed_at IS NULL OR last_failed_at<=now()-interval '12 hours')),'updatedHighWater',max(updated_at))FROM public.firm_billing;")
 add('activeMethodCounts','firm_payment_methods',['is_active','updated_at'],"SELECT json_build_object('rows',count(*),'active',count(*)FILTER(WHERE is_active),'updatedHighWater',max(updated_at))FROM public.firm_payment_methods;")
 add('signupStates','signup_intents',['status','updated_at'],"SELECT json_build_object('status',CASE WHEN status IN('pending_payment','provisioning','completed','failed','cancelled')THEN status ELSE'unrecognized_redacted'end,'rows',count(*),'updatedHighWater',max(updated_at))FROM public.signup_intents GROUP BY status ORDER BY status;")
 add('welcomeStates','signup_intents',['welcome_email_status','welcome_email_updated_at','welcome_email_next_at','status'],"SELECT json_build_object('status',CASE WHEN welcome_email_status IN('pending','sending','sent','uncertain','failed')THEN welcome_email_status ELSE'other_or_null'end,'rows',count(*),'duePending',count(*)FILTER(WHERE status='completed'AND welcome_email_status='pending'AND(welcome_email_next_at IS NULL OR welcome_email_next_at<=now())),'staleSending',count(*)FILTER(WHERE welcome_email_status='sending'AND welcome_email_updated_at<now()-interval '5 minutes'),'updatedHighWater',max(welcome_email_updated_at))FROM public.signup_intents GROUP BY welcome_email_status ORDER BY welcome_email_status;")
 add('centralOutbox','central_system_message_outbox',['event_family','status','lease_until','next_attempt_at','updated_at'],"SELECT json_build_object('family',CASE WHEN event_family IN('consent','payment_received','subscription_update')THEN event_family ELSE'other_redacted'end,'status',CASE WHEN status IN('pending','sending','accepted','blocked','reconciliation','cancelled')THEN status ELSE'other_redacted'end,'rows',count(*),'liveLeases',count(*)FILTER(WHERE lease_until>now()),'expiredSending',count(*)FILTER(WHERE status='sending'AND lease_until<=now()),'duePending',count(*)FILTER(WHERE status='pending'AND next_attempt_at<=now()),'updatedHighWater',max(updated_at))FROM public.central_system_message_outbox GROUP BY event_family,status ORDER BY event_family,status;")
 add('signingJobs','signing_jobs',['state','lease_until','available_at','created_at'],"SELECT json_build_object('state',CASE WHEN state IN('pending','running','complete','retry','needs_attention','cancelled','uncertain')THEN state ELSE'other_redacted'end,'rows',count(*),'liveLeases',count(*)FILTER(WHERE state='running'AND lease_until>now()),'staleRunning',count(*)FILTER(WHERE state='running'AND lease_until<=now()),'duePendingOrRetry',count(*)FILTER(WHERE state IN('pending','retry')AND available_at<=now()),'creationHighWater',max(created_at))FROM public.signing_jobs GROUP BY state ORDER BY state;")
 add('signingDeliveries','signing_deliveries',['state','attempted_at','created_at'],"SELECT json_build_object('state',CASE WHEN state IN('pending','dispatching','provider_accepted','delivered','failed','uncertain','cancelled','skipped_completed','bundled')THEN state ELSE'other_redacted'end,'rows',count(*),'attemptHighWater',max(attempted_at),'creationHighWater',max(created_at))FROM public.signing_deliveries GROUP BY state ORDER BY state;")
 add('signingErrorEmails','signing_error_emails',['state','lease_until'],"SELECT json_build_object('state',CASE WHEN state IN('pending','dispatching','provider_accepted','simulated','uncertain','failed','cancelled')THEN state ELSE'other_redacted'end,'rows',count(*),'liveLeases',count(*)FILTER(WHERE lease_until>now()))FROM public.signing_error_emails GROUP BY state ORDER BY state;")
 add('integrationClaims','office_integrations',['dispatch_claim','enabled','provider','next_sync_at','settings'],"SELECT json_build_object('provider',CASE WHEN provider IN('whatsapp','court_demo')THEN provider ELSE'other_redacted'end,'rows',count(*),'enabled',count(*)FILTER(WHERE enabled),'dispatchClaims',count(*)FILTER(WHERE dispatch_claim IS NOT NULL),'courtDue',count(*)FILTER(WHERE provider='court_demo'AND enabled AND settings->>'dailySyncEnabled'='true'AND next_sync_at<=now()))FROM public.office_integrations GROUP BY provider ORDER BY provider;")
 add('whatsappJobs','case_whatsapp_groups',['status','recipients','updated_at','next_attempt_at'],"SELECT json_build_object('status',CASE WHEN status IN('queued','creating','ready','sending','sent','needs_attention','uncertain','failed','cancelled','created','invitations_sent','awaiting_webhook','simulated')THEN status ELSE'other_redacted'end,'rows',count(*),'due',count(*)FILTER(WHERE next_attempt_at<=now()),'recipientSendingRows',count(*)FILTER(WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(recipients)='array'THEN recipients ELSE'[]'::jsonb END)r WHERE r->>'status'='sending')),'updatedHighWater',max(updated_at))FROM public.case_whatsapp_groups GROUP BY status ORDER BY status;")
 add('legacySigningBatches','signing_batches',['status','created_at'],"SELECT json_build_object('status',CASE WHEN status IN('draft','ready','sending','sent','partial','cancelled')THEN status ELSE'other_redacted'end,'rows',count(*),'creationHighWater',max(created_at))FROM public.signing_batches GROUP BY status ORDER BY status;")
 add('legacySigningRecipients','signing_batch_recipients',['status','attempted_at'],"SELECT json_build_object('status',CASE WHEN status IN('pending','sending','sent','failed','uncertain')THEN status ELSE'other_redacted'end,'rows',count(*),'attemptHighWater',max(attempted_at))FROM public.signing_batch_recipients GROUP BY status ORDER BY status;")
 add('legacyCompletionMessages','signing_package_completions',['status','attempted_at'],"SELECT json_build_object('status',CASE WHEN status IN('sending','sent','uncertain')THEN status ELSE'other_redacted'end,'rows',count(*),'attemptHighWater',max(attempted_at))FROM public.signing_package_completions GROUP BY status ORDER BY status;")
 add('legacyReminders','signing_batch_reminders',['status','scheduled_for','attempted_at'],"SELECT json_build_object('status',CASE WHEN status IN('pending','sending','sent','cancelled','uncertain')THEN status ELSE'other_redacted'end,'rows',count(*),'duePending',count(*)FILTER(WHERE status='pending'AND scheduled_for<=now()),'attemptHighWater',max(attempted_at))FROM public.signing_batch_reminders GROUP BY status ORDER BY status;")
 add('signingOtp','signing_otp_challenges_v2',['state','expires_at','created_at'],"SELECT json_build_object('state',CASE WHEN state IN('pending','sent','failed','uncertain','verified','exhausted','superseded')THEN state ELSE'other_redacted'end,'rows',count(*),'unexpiredPending',count(*)FILTER(WHERE state='pending'AND expires_at>now()),'creationHighWater',max(created_at))FROM public.signing_otp_challenges_v2 GROUP BY state ORDER BY state;")
 queries['centralRelationKind']="SELECT json_build_object('relationPresent',to_regclass('public.central_system_message_outbox')IS NOT NULL,'kind',(SELECT c.relkind FROM pg_class c WHERE c.oid=to_regclass('public.central_system_message_outbox')));"
 queries['ownRoleSessions']="SELECT json_build_object('state',coalesce(state,'not_visible'),'sessions',count(*),'oldestTransaction',min(xact_start),'oldestQuery',min(query_start),'waitEventType',coalesce(wait_event_type,'none'))FROM pg_catalog.pg_stat_activity WHERE datname=current_database()AND usename=current_user AND pid<>pg_backend_pid()GROUP BY state,wait_event_type ORDER BY state,wait_event_type;"
 result['aggregationGaps']=gaps;result['querySha256']={k:hashlib.sha256(v.encode()).hexdigest()for k,v in queries.items()}

 add('intentMarkers','firm_payment_intents',['id','kind','status','created_at','updated_at','settled_at','takbull_uniq_id','takbull_transaction_id'],"SELECT json_build_object('rows',count(*),'createdHighWater',max(created_at),'updatedHighWater',max(updated_at),'settledHighWater',max(settled_at),'selectedFieldFingerprint',md5(coalesce(string_agg(md5(jsonb_build_array(id::text,kind,status,extract(epoch from created_at),extract(epoch from updated_at),extract(epoch from settled_at),nullif(takbull_uniq_id,'')IS NOT NULL,nullif(takbull_transaction_id,'')IS NOT NULL)::text),'|'ORDER BY id),'')))FROM public.firm_payment_intents;")
 add('billingMarkers','firm_billing',['id','status','billing_enabled','auto_renew','complimentary_until','renews_at','grace_until','last_failed_at','last_paid_at','updated_at'],"SELECT json_build_object('rows',count(*),'updatedHighWater',max(updated_at),'selectedFieldFingerprint',md5(coalesce(string_agg(md5(jsonb_build_array(id::text,status,billing_enabled,auto_renew,extract(epoch from complimentary_until),extract(epoch from renews_at),extract(epoch from grace_until),extract(epoch from last_failed_at),extract(epoch from last_paid_at),extract(epoch from updated_at))::text),'|'ORDER BY id),'')))FROM public.firm_billing;")
 add('methodMarkers','firm_payment_methods',['id','is_active','created_at','updated_at'],"SELECT json_build_object('rows',count(*),'createdHighWater',max(created_at),'updatedHighWater',max(updated_at),'selectedFieldFingerprint',md5(coalesce(string_agg(md5(jsonb_build_array(id::text,is_active,extract(epoch from created_at),extract(epoch from updated_at))::text),'|'ORDER BY id),'')))FROM public.firm_payment_methods;")
 add('paymentEventMarkers','firm_payment_events',['id','event_type','created_at'],"SELECT json_build_object('rows',count(*),'createdHighWater',max(created_at),'selectedFieldFingerprint',md5(coalesce(string_agg(md5(jsonb_build_array(id::text,event_type,extract(epoch from created_at))::text),'|'ORDER BY id),'')))FROM public.firm_payment_events;")
 add('signupMarkers','signup_intents',['id','status','created_at','updated_at'],"SELECT json_build_object('rows',count(*),'createdHighWater',max(created_at),'updatedHighWater',max(updated_at),'selectedFieldFingerprint',md5(coalesce(string_agg(md5(jsonb_build_array(id::text,status,extract(epoch from created_at),extract(epoch from updated_at))::text),'|'ORDER BY id),'')))FROM public.signup_intents;")
 queries['transactionIdentity']="SELECT json_build_object('role',current_user,'database',current_database(),'readOnly',current_setting('transaction_read_only'),'transactionTime',transaction_timestamp());"
 result['aggregationGaps']=gaps;result['querySha256']={k:hashlib.sha256(v.encode()).hexdigest()for k,v in queries.items()}
 result['hostBootIdBefore']=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
 result['daemonBefore']=process_meta(daemonpid);result['daemonBefore'].pop('cmdlineContainsExpectedServerPath',None)
 dep=Path('/root/Melamedia/backend/node_modules')
 def dep_state():return{'isSymlink':dep.is_symlink(),'linkTarget':os.readlink(dep)if dep.is_symlink()else None,'resolvedTarget':str(dep.resolve()),'targetExists':dep.resolve().is_dir(),'sourcePackageLockSha256':hashlib.sha256(Path('/root/Melamedia/backend/package-lock.json').read_bytes()).hexdigest(),'installedPackageLockSha256':hashlib.sha256((dep/'.package-lock.json').read_bytes()).hexdigest()if(dep/'.package-lock.json').is_file()else None}
 result['dependenciesBefore']=dep_state();result['nodeExeSha256']=hashlib.sha256(Path('/proc/'+str(pid)+'/exe').read_bytes()).hexdigest()
 result['phase']='ONE_ADJACENT_SNAPSHOT_NO_POLLING'
 sample={'atUtc':now(),'socketBefore':sockets(pid),'aggregates':{}}
 combined=[]
 for key,query in queries.items():combined.append("SELECT json_build_object('key','"+key+"','rows',coalesce(json_agg(x.val),'[]'::json))FROM("+query.rstrip(';')+")x(val);")
 transaction=sql('\n'.join(combined));sample['consistentTransaction']=transaction.get('ok',False)
 if transaction.get('ok'):
  for row in transaction['rows']:sample['aggregates'][row['key']]={'ok':True,'rows':row['rows'],'transactionEnded':'ROLLBACK','singleConsistentSnapshot':True}
 else:sample['transactionFailure']=transaction
 sample['socketAfter']=sockets(pid);sample['finishedAtUtc']=now();result['samples']=[sample]
 result['hostBootIdAfter']=Path('/proc/sys/kernel/random/boot_id').read_text().strip();result['daemonAfter']=process_meta(int(Path('/root/.pm2/pm2.pid').read_text().strip()));result['daemonAfter'].pop('cmdlineContainsExpectedServerPath',None);result['dependenciesAfter']=dep_state()
 result['envFileSha256After']=hashlib.sha256(Path('/root/Melamedia/backend/.env').read_bytes()).hexdigest()
 result['sourceAfter']={'head':git('rev-parse','HEAD'),'trackedStatus':git('status','--porcelain','--untracked-files=no')};pid2=qa_pid();result['processAfter']=process_meta(pid2);result['sourceAndPidStable']=pid==pid2 and result['sourceBefore']['head']==result['sourceAfter']['head']and result['sourceBefore']['trackedStatus']==result['sourceAfter']['trackedStatus']
 result['status']='READONLY_QA_ADJACENT_SNAPSHOT_COMPLETED';result['locksReleasedAtRemoteExit']=True;result['limitations']=['One adjacent consistent SQL snapshot plus socket metadata does not freeze HTTP, scheduler or CLI issuance and is not an atomic drain proof.','Only existing app-role database session metadata is visible; no other-role activity/grants were requested.','No raw vendor reference/status was read; historical hosted pages remain externally unassessed.','No provider endpoint, app bootstrap, HTTP business route, PM2/config/service mutation or data write occurred.','No HTTP financial request metric/access-log mapping was safely established in this collection.']
except Exception as ex:result.update(status='BLOCKED_READONLY_QA_OBSERVATION',reason=str(ex)if re.fullmatch('[A-Z_]+',str(ex))else'REDACTED_ERROR',errorType=type(ex).__name__)
result['finishedAtUtc']=now();result['finishedAtUtc']=now();print(json.dumps(result))
