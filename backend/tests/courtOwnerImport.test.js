'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {PDFDocument,PDFName,PDFString}=require('pdf-lib');
const {PGlite}=require('@electric-sql/pglite');
const {createCourtOwnerImport,inspectPdf,MAX_BYTES}=require('../services/integrations/courtOwnerImport');
const {saveCaseCourtNumber}=require('../services/integrations/courtCaseReference');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const env={COURT_OWNER_IMPORT_ENABLED:'true',RUNTIME_TENANT:'melamedia'};
const migration=fs.readFileSync(path.join(__dirname,'../migrations/2026-10-25_court_owner_import.sql'),'utf8');
const error=code=>e=>e.errorCode===code;
async function pdf(value='Synthetic owner-export QA') {
    const d=await PDFDocument.create();d.addPage([300,400]).drawText(value);return Buffer.from(await d.save());
}
async function fixture(t,{rls=false,inspect,db:providedDb,pool:providedPool}={}) {
    const db=providedDb || new PGlite();
    await db.exec(`CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY,owner_user_id integer,is_active boolean DEFAULT true);
        CREATE TABLE users(userid integer PRIMARY KEY,role text,law_firm_tenant_id uuid,firm_staff_role_id uuid);
        CREATE TABLE firm_staff_roles(id uuid PRIMARY KEY,permissions jsonb,is_active boolean DEFAULT true,law_firm_tenant_id uuid);
        CREATE TABLE platform_admins(user_id integer PRIMARY KEY,is_active boolean);
        CREATE TABLE cases(caseid integer PRIMARY KEY,law_firm_tenant_id uuid,casename text,casemanagerid integer);
        CREATE TABLE case_users(caseid integer,userid integer,PRIMARY KEY(caseid,userid));
        INSERT INTO law_firm_tenants(id,owner_user_id) VALUES('${A}',11),('${B}',21);
        INSERT INTO users(userid,role,law_firm_tenant_id) VALUES(1,'Admin',null),(11,'Admin','${A}'),(12,'Lawyer','${A}'),(13,'Admin','${A}'),(21,'Admin','${B}');
        INSERT INTO platform_admins VALUES(1,true);
        INSERT INTO cases(caseid,law_firm_tenant_id,casename) VALUES(101,'${A}','Synthetic A'),(102,'${A}','Synthetic A2'),(201,'${B}','Synthetic B'),(301,null,'Synthetic dedicated');`);
    if(rls)await db.exec(`CREATE FUNCTION public.office_scope_id() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.office_id',true),'')::uuid $$;
        CREATE FUNCTION public.office_row_allowed(id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('app.office_mode',true)='system' OR (current_setting('app.office_mode',true)='office' AND id=public.office_scope_id()) OR (current_setting('app.office_mode',true)='legacy' AND id IS NULL) $$;
        CREATE FUNCTION public.guard_office_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.law_firm_tenant_id IS DISTINCT FROM OLD.law_firm_tenant_id THEN RAISE EXCEPTION 'office changed'; END IF; RETURN NEW; END $$;
        CREATE FUNCTION public.guard_office_reference() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE matches boolean; ref text; BEGIN ref=to_jsonb(NEW)->>TG_ARGV[1]; IF ref IS NULL THEN RETURN NEW; END IF; EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE %I::text=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2)',TG_ARGV[0],TG_ARGV[2]) INTO matches USING ref,NEW.law_firm_tenant_id; IF NOT matches THEN RAISE EXCEPTION 'foreign reference'; END IF; RETURN NEW; END $$;
        SELECT set_config('app.office_mode','system',false);`);
    await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/2026-10-14_00_office_integrations.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/2026-10-15_00_case_court_reference.sql'),'utf8'));
    if(rls)await db.exec('CREATE ROLE court_import_runtime; GRANT USAGE ON SCHEMA public TO court_import_runtime; GRANT SELECT ON users TO court_import_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON court_updates TO court_import_runtime;');
    await db.exec(migration);
    await db.query(`INSERT INTO court_case_links(law_firm_tenant_id,case_id,court_number,is_primary) VALUES
        ($1,101,'67104-01-20',true),($1,102,'22222-01-20',true),($2,201,'67104-01-20',true),(null,301,'67104-01-20',true)`,[A,B]);
    let tail=Promise.resolve(),fault=null;
    async function lease(){const previous=tail;let release;tail=new Promise(r=>{release=r;});await previous;return release;}
    async function query(sql,args){if(fault&&fault(sql,args))throw Error('SYNTHETIC_STORAGE_FAILURE');const r=await db.query(sql,args);return{...r,rowCount:r.rows.length||r.affectedRows||0};}
    const pool=providedPool || {query:async(...args)=>{const release=await lease();try{return await query(...args);}finally{release();}},
        connect:async()=>{const release=await lease();return{query,release};}};
    const service=createCourtOwnerImport({pool,env,inspect});
    const bytes=await pdf();
    const input={caseId:'101',courtNumber:'67104-01-20',issuedOn:'2026-10-21',title:'Synthetic decision',actionId:crypto.randomUUID(),sourceConfirmed:'true'};
    const call=(patch={})=>service.importFile({officeId:A,actorUserId:11,input,...{file:{buffer:bytes,originalname:'Synthetic-source.pdf'}},...patch});
    t.after(()=>db.close());
    return{db,pool,service,bytes,input,call,setFault:f=>{fault=f;}};
}
test('QA-only capture is off by default and cannot be enabled on any customer brand',async()=>{
    const pool={query:()=>{throw Error('UNEXPECTED_DB');},connect:()=>{throw Error('UNEXPECTED_DB');}};
    for(const config of [{},{...env,COURT_OWNER_IMPORT_ENABLED:'false'},...['melamedlaw','morlevi','ashrafessa','idm'].map(brand=>({...env,RUNTIME_TENANT:brand}))])
        await assert.rejects(createCourtOwnerImport({pool,env:config}).importFile({}),error('COURT_OWNER_IMPORT_DISABLED'));
});
test('file validation rejects malformed, oversized, active and excessive-page PDFs',async()=>{
    await assert.rejects(inspectPdf(Buffer.from('not a pdf')),error('COURT_IMPORT_PDF_INVALID'));
    await assert.rejects(inspectPdf(Buffer.alloc(MAX_BYTES+1)),error('COURT_IMPORT_TOO_LARGE'));
    const active=await PDFDocument.create();active.addPage();active.catalog.set(PDFName.of('OpenAction'),active.context.obj({S:PDFName.of('JavaScript'),JS:PDFString.of('app.alert("Synthetic")')}));
    await assert.rejects(inspectPdf(Buffer.from(await active.save())),error('COURT_IMPORT_PDF_INVALID'));
    const many=await PDFDocument.create();for(let n=0;n<51;n++)many.addPage();
    await assert.rejects(inspectPdf(Buffer.from(await many.save())),error('COURT_IMPORT_PDF_INVALID'));
});
test('manual confirmation, valid dates, bounded titles and immutable action UUID are required',async t=>{
    const f=await fixture(t);
    for(const [patch,code]of [[{sourceConfirmed:'false'},'COURT_IMPORT_SOURCE_CONFIRMATION_REQUIRED'],[{issuedOn:'2026-02-30'},'COURT_IMPORT_INVALID'],[{title:'x'.repeat(161)},'COURT_IMPORT_INVALID'],[{actionId:'invalid'},'COURT_IMPORT_INVALID'],[{sourceUrl:'https://untrusted.invalid'},'COURT_IMPORT_INVALID']])
        await assert.rejects(f.call({input:{...f.input,...patch}}),error(code));
    assert.equal((await f.pool.query('SELECT * FROM court_import_documents')).rows.length,0);
});
test('real file bytes, provenance and case update commit together without inventing a connection',async t=>{
    const f=await fixture(t);const out=await f.call();
    assert.equal(out.imported,true);assert.equal(out.sourceKind,'owner_file');assert.equal(out.automaticConnected,false);
    const rows=(await f.pool.query('SELECT d.*,u.is_demo,u.source_kind FROM court_import_documents d JOIN court_updates u ON u.document_id=d.id')).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].is_demo,false);assert.equal(rows[0].source_kind,'owner_file');
    assert.equal(rows[0].imported_by,11);assert.deepEqual(Buffer.from(rows[0].pdf_bytes),f.bytes);
    const doc=await f.service.document({officeId:A,caseId:101,documentId:out.documentId});
    assert.deepEqual(doc.buffer,f.bytes);assert.equal(doc.sha256,crypto.createHash('sha256').update(f.bytes).digest('hex'));
    assert.equal((await f.pool.query('SELECT * FROM office_integrations')).rows.length,0);
});
test('identical action retries and the same PDF under new actions never duplicate the update',async t=>{
    const f=await fixture(t);const first=await f.call();const replay=await f.call();
    assert.equal(replay.replayed,true);assert.equal(replay.documentId,first.documentId);
    const another=await f.call({input:{...f.input,actionId:crypto.randomUUID()}});
    assert.equal(another.imported,false);assert.equal(another.deduplicated,true);assert.equal(another.documentId,first.documentId);
    assert.equal((await f.pool.query('SELECT * FROM court_updates')).rows.length,1);
    assert.equal((await f.pool.query('SELECT * FROM court_import_actions')).rows.length,2);
});
test('parallel duplicate imports serialize and retain one immutable source',async t=>{
    const f=await fixture(t);const results=await Promise.all([f.call(),f.call({input:{...f.input,actionId:crypto.randomUUID()}})]);
    assert.equal(results.filter(x=>x.imported).length,1);assert.equal(new Set(results.map(x=>x.documentId)).size,1);
    assert.equal((await f.pool.query('SELECT * FROM court_updates')).rows.length,1);
});
test('changed bytes or metadata under one action conflict without modifying the original',async t=>{
    const f=await fixture(t);const first=await f.call();
    await assert.rejects(f.call({input:{...f.input,title:'Changed'}}),error('COURT_IMPORT_ACTION_CONFLICT'));
    await assert.rejects(f.call({file:{buffer:await pdf('Changed PDF'),originalname:'Synthetic-source.pdf'}}),error('COURT_IMPORT_ACTION_CONFLICT'));
    await assert.rejects(f.call({input:{...f.input,actionId:crypto.randomUUID(),title:'Changed'}}),error('COURT_IMPORT_DOCUMENT_CONFLICT'));
    assert.equal((await f.pool.query('SELECT sha256 FROM court_import_documents')).rows[0].sha256,first.sha256);
});
test('foreign office cases, non-owner admins and staff cannot import',async t=>{
    const f=await fixture(t);
    await assert.rejects(f.call({input:{...f.input,caseId:'201'}}),error('CASE_NOT_FOUND'));
    for(const actorUserId of [12,13,21])await assert.rejects(f.call({actorUserId}),error('FORBIDDEN'));
    assert.equal((await f.pool.query('SELECT * FROM court_import_documents')).rows.length,0);
});
test('the current canonical court reference is checked again and stale links cannot download',async t=>{
    const f=await fixture(t);const out=await f.call();
    await f.pool.query("UPDATE court_case_links SET court_number='12345-02-26' WHERE case_id=101");
    await assert.rejects(f.call({input:{...f.input,actionId:crypto.randomUUID()}}),error('COURT_REFERENCE_CHANGED'));
    await assert.rejects(f.service.document({officeId:A,caseId:101,documentId:out.documentId}),error('COURT_DOCUMENT_NOT_FOUND'));
    await assert.rejects(f.service.document({officeId:B,caseId:201,documentId:out.documentId}),error('COURT_DOCUMENT_NOT_FOUND'));
});
test('an update insert failure rolls back file and action, and the original action remains retryable',async t=>{
    const f=await fixture(t);f.setFault(sql=>sql.startsWith('INSERT INTO court_updates'));
    await assert.rejects(f.call(),/SYNTHETIC_STORAGE_FAILURE/);f.setFault(null);
    for(const name of ['court_import_documents','court_import_actions','court_updates'])assert.equal((await f.pool.query('SELECT * FROM '+name)).rows.length,0);
    assert.equal((await f.call()).imported,true);
});
test('ordinary case-reference edits detach real imports and never attach them again without a new owner action',async t=>{
    const f=await fixture(t);const first=await f.call();
    async function save(number){const c=await f.pool.connect();try{await c.query('BEGIN');await saveCaseCourtNumber(c,101,A,number,{});await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
    await save('12345-02-26');await save('67104-01-20');
    assert.equal((await f.pool.query('SELECT case_id FROM court_updates WHERE id=$1',[first.updateId])).rows[0].case_id,null);
    await assert.rejects(f.call(),e=>e.errorCode==='COURT_IMPORT_ACTION_STALE' && e.httpStatus===409);
    assert.equal((await f.pool.query('SELECT case_id FROM court_updates WHERE id=$1',[first.updateId])).rows[0].case_id,null);
    assert.equal((await f.pool.query('SELECT * FROM court_import_actions')).rows.length,1);
    await assert.rejects(f.service.document({officeId:A,caseId:101,documentId:first.documentId}),error('COURT_DOCUMENT_NOT_FOUND'));
    const restored=await f.call({input:{...f.input,actionId:crypto.randomUUID()}});
    assert.equal(restored.imported,false);assert.equal(restored.documentId,first.documentId);
    assert.deepEqual((await f.service.document({officeId:A,caseId:101,documentId:first.documentId})).buffer,f.bytes);
    assert.equal((await f.pool.query('SELECT * FROM court_import_documents')).rows.length,1);
    assert.equal((await f.pool.query('SELECT * FROM court_updates')).rows.length,1);
    assert.equal((await f.pool.query('SELECT * FROM court_import_actions')).rows.length,2);
});
const ROLE='55555555-5555-4555-8555-555555555555';
const casePermissions=(scope='all_firm',actions=['view','edit'])=>({areas:{cases:{visible:true,actions,dataScope:scope}}});
async function customOwner(f,scope='all_firm') {
    await f.pool.query('INSERT INTO firm_staff_roles(id,permissions,law_firm_tenant_id) VALUES($1,$2,$3)',[ROLE,casePermissions(scope),A]);
    await f.pool.query('UPDATE users SET firm_staff_role_id=$1 WHERE userid=11',[ROLE]);
}
function barrier() {let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
for(const change of ['permission','membership','manager'])test(`current ${change} revocation during PDF inspection forbids import without writes`,async t=>{
    const reached=barrier(),resume=barrier();
    const f=await fixture(t,{inspect:async bytes=>{const value=await inspectPdf(bytes);reached.resolve();await resume.promise;return value;}});
    await customOwner(f,change==='permission'?'all_firm':'assigned_only');
    if(change==='membership')await f.pool.query('INSERT INTO case_users VALUES(101,11)');
    if(change==='manager')await f.pool.query('UPDATE cases SET casemanagerid=11 WHERE caseid=101');
    const pending=f.call();await reached.promise;
    if(change==='permission')await f.pool.query('UPDATE firm_staff_roles SET permissions=$1 WHERE id=$2',[casePermissions('all_firm',['view']),ROLE]);
    if(change==='membership')await f.pool.query('DELETE FROM case_users WHERE caseid=101 AND userid=11');
    if(change==='manager')await f.pool.query('UPDATE cases SET casemanagerid=12 WHERE caseid=101');
    resume.resolve();await assert.rejects(pending,e=>e.errorCode==='FORBIDDEN' && e.httpStatus===403);
    for(const table of ['court_import_documents','court_import_actions','court_updates'])assert.equal((await f.pool.query('SELECT * FROM '+table)).rows.length,0);
});
test('current custom owner permissions allow only a currently assigned case',async t=>{
    const f=await fixture(t);await customOwner(f,'assigned_only');
    await assert.rejects(f.call(),error('FORBIDDEN'));
    await f.pool.query('INSERT INTO case_users VALUES(101,11)');
    const first=await f.call();assert.equal(first.imported,true);
    await f.pool.query('DELETE FROM case_users WHERE caseid=101 AND userid=11');
    await f.pool.query('UPDATE cases SET casemanagerid=11 WHERE caseid=101');
    assert.equal((await f.call()).replayed,true);
    assert.equal((await f.pool.query('SELECT * FROM court_import_documents')).rows.length,1);
});
test('current role user case and assignment grants remain locked until PostgreSQL import commit',{skip:!process.env.COURT_IMPORT_TEST_PG_SOCKET},async t=>{
    const {Pool}=require('pg');
    const pg=new Pool({host:process.env.COURT_IMPORT_TEST_PG_SOCKET,port:Number(process.env.COURT_IMPORT_TEST_PG_PORT||5432),database:'postgres',user:process.env.USER,max:8});
    const reached=barrier(),resume=barrier();
    const pool={query:(...args)=>pg.query(...args),connect:async()=>{const c=await pg.connect();return{release:()=>c.release(),query:async(sql,args)=>{
        const result=await c.query(sql,args);
        if(sql.startsWith('INSERT INTO court_import_documents')){reached.resolve();await resume.promise;}
        return result;
    }};}};
    const f=await fixture(t,{db:{exec:sql=>pg.query(sql),query:(...args)=>pg.query(...args),close:()=>pg.end()},pool});
    await customOwner(f,'assigned_only');await pg.query('INSERT INTO case_users VALUES(101,11)');
    const pending=f.call();await reached.promise;
    try {
        for(const statement of ["UPDATE firm_staff_roles SET is_active=false",'UPDATE users SET firm_staff_role_id=null WHERE userid=11',
            'UPDATE cases SET casemanagerid=12 WHERE caseid=101','DELETE FROM case_users WHERE caseid=101 AND userid=11']) {
            const c=await pg.connect();try {
                await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='100ms'");
                await assert.rejects(c.query(statement),e=>e.code==='55P03');
            } finally {await c.query('ROLLBACK');c.release();}
        }
    } finally {resume.resolve();}
    assert.equal((await pending).imported,true);
    assert.equal((await pg.query('SELECT * FROM court_import_documents')).rows.length,1);
});
test('dedicated QA requires an active database platform administrator',async t=>{
    const f=await fixture(t);const out=await f.call({officeId:null,actorUserId:1,input:{...f.input,caseId:'301'}});
    assert.equal(out.imported,true);await f.pool.query('UPDATE platform_admins SET is_active=false WHERE user_id=1');
    await assert.rejects(f.call({officeId:null,actorUserId:1,input:{...f.input,caseId:'301',actionId:crypto.randomUUID()}}),error('FORBIDDEN'));
});
test('source records and action hashes are immutable and the migration is rerunnable',async t=>{
    const f=await fixture(t);const out=await f.call();
    await assert.rejects(f.pool.query("UPDATE court_import_documents SET sha256=$2 WHERE id=$1",[out.documentId,'a'.repeat(64)]),e=>e.code==='23514');
    await assert.rejects(f.pool.query("UPDATE court_import_actions SET request_hash=$1",['b'.repeat(64)]),e=>e.code==='23514');
    await assert.rejects(f.pool.query("UPDATE court_updates SET is_demo=true,source_kind='demo',document_id=null WHERE id=$1",[out.updateId]),e=>e.code==='23514');
    await f.db.exec(migration);assert.equal((await f.pool.query('SELECT * FROM court_import_documents')).rows.length,1);
    assert.deepEqual((await f.service.document({officeId:A,caseId:101,documentId:out.documentId})).buffer,f.bytes);
});
test('new tables inherit private runtime grants and enforce an actual office RLS boundary',async t=>{
    const f=await fixture(t,{rls:true});await f.call();
    await f.call({officeId:B,actorUserId:21,input:{...f.input,caseId:'201',actionId:crypto.randomUUID()}});
    await f.db.exec(`SET ROLE court_import_runtime; SELECT set_config('app.office_mode','office',false); SELECT set_config('app.office_id','${A}',false);`);
    try {
        assert.equal((await f.db.query('SELECT * FROM court_import_documents')).rows.length,1);
        assert.equal((await f.db.query('SELECT * FROM court_import_actions')).rows.length,1);
        assert.equal((await f.db.query('SELECT * FROM court_import_documents WHERE law_firm_tenant_id=$1',[B])).rows.length,0);
        await assert.rejects(f.db.query(`INSERT INTO court_import_actions(action_id,law_firm_tenant_id,document_id,request_hash,actor_user_id)
            SELECT $1,law_firm_tenant_id,id,$2,21 FROM court_import_documents LIMIT 1`,[crypto.randomUUID(),'c'.repeat(64)]),/foreign reference/);
    } finally {await f.db.exec('RESET ROLE;');}
    const publicGrants=(await f.db.query("SELECT grantee FROM information_schema.table_privileges WHERE table_name IN('court_import_documents','court_import_actions') AND grantee='PUBLIC'")).rows;
    assert.equal(publicGrants.length,0);
});

