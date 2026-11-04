const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const fixtureSql=`CREATE TABLE firm_billing(id int primary key,law_firm_tenant_id uuid,signing_id text,price_monthly_ils numeric,updated_at timestamptz,complimentary_until timestamptz,renews_at timestamptz,billing_enabled boolean);
 CREATE TABLE signingfiles(signingfileid int primary key,createdat timestamptz default now());
 CREATE TABLE signing_owner_contexts(id uuid primary key,law_firm_tenant_id uuid);
 CREATE TABLE signing_submissions(id uuid primary key,owner_context_id uuid,document_count int,committed_at timestamptz default now());
 CREATE TABLE signing_replacement_drafts(id uuid primary key,owner_context_id uuid,document_count int,state text,published_at timestamptz);
 INSERT INTO firm_billing VALUES(1,null,'none',676,now(),'2027-02-01 21:59:59.999+00','2027-02-01 21:59:59.999+00',false);
 INSERT INTO signing_owner_contexts VALUES('00000000-0000-0000-0000-000000000001',null),('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003');`;
test('PostgreSQL automatic tier: legacy, packages, replacements, boundaries, rollback, dedupe, deletion and preserved billing', {skip:process.env.SIGNING_TIER_POSTGRES_TEST!=='1'},async()=>{
 require('dotenv').config();const {Client}=require('pg');const db=new Client({host:process.env.DB_HOST||'localhost',database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});await db.connect();
 try{
 await db.query('BEGIN');await db.query('CREATE SCHEMA signing_tier_test');await db.query('SET LOCAL search_path=signing_tier_test');
 await db.query(fixtureSql);
 const sql=fs.readFileSync(require.resolve('../migrations/2026-11-04_00_automatic_signing_tiers.sql'),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.query(sql);
 const row=async()=> (await db.query('SELECT * FROM firm_billing WHERE id=1')).rows[0];
 const protectedBefore=await row();assert.equal(protectedBefore.signing_id,'none');
 await db.query('UPDATE firm_billing SET signing_auto_tier_enabled=true');
 await db.query('SAVEPOINT failed_send');await db.query('INSERT INTO signingfiles(signingfileid) VALUES(1)');assert.equal((await row()).signing_id,'500');await db.query('ROLLBACK TO failed_send');assert.equal((await row()).signing_id,'none');
 await db.query('INSERT INTO signingfiles(signingfileid) VALUES(1)');assert.equal((await row()).price_monthly_ils,'845');
 await db.query('INSERT INTO signingfiles(signingfileid) VALUES(1) ON CONFLICT DO NOTHING');assert.equal((await db.query('SELECT sum(documents)::int n FROM signing_billing_usage')).rows[0].n,1);
 await db.query('DELETE FROM signingfiles WHERE signingfileid=1');assert.equal((await db.query('SELECT sum(documents)::int n FROM signing_billing_usage')).rows[0].n,1);
 let seq=10;const submit=async(n,context=1)=>db.query(`INSERT INTO signing_submissions(id,owner_context_id,document_count) VALUES($1,$2,$3)`,[`00000000-0000-0000-0000-${String(seq++).padStart(12,'0')}`,`00000000-0000-0000-0000-${String(context).padStart(12,'0')}`,n]);
 await submit(499);assert.equal((await row()).signing_id,'500');await submit(1);assert.equal((await row()).signing_id,'1500');assert.equal((await row()).price_monthly_ils,'1014');
 await submit(999);assert.equal((await row()).signing_id,'1500');await submit(1);assert.equal((await row()).signing_id,'5000');
 await submit(3499);assert.equal((await row()).signing_id,'5000');
 await db.query(`INSERT INTO signing_replacement_drafts VALUES('00000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000001',1,'draft',null)`);assert.equal((await row()).signing_id,'5000');
 await db.query("UPDATE signing_replacement_drafts SET state='published',published_at=now()");assert.equal((await row()).signing_id,'unlimited');assert.equal((await row()).price_monthly_ils,'1777');
 await db.query("UPDATE signing_replacement_drafts SET state='published'");await submit(100,2);
 assert.equal((await db.query('SELECT sum(documents)::int n FROM signing_billing_usage')).rows[0].n,5001);
 const after=await row();for(const key of ['complimentary_until','renews_at','billing_enabled'])assert.deepEqual(after[key],protectedBefore[key]);
 // Reapplying migration never double-counts or changes the stored package.
 await db.query(sql);assert.equal((await db.query('SELECT sum(documents)::int n FROM signing_billing_usage')).rows[0].n,5001);
 assert.equal((await row()).price_monthly_ils,'1777');
 const {PRICING}=require('../lib/billing/pricingPackage');assert.deepEqual(PRICING.signing.map(s=>[s.id,s.amount]),[['none',0],['500',169],['1500',338],['5000',677],['unlimited',1101]]);
 }finally{await db.query('ROLLBACK');await db.end();}
});


test('concurrent successful sends serialize one tier increase; transaction rollback stays invisible', {skip:process.env.SIGNING_TIER_POSTGRES_TEST!=='1'}, async()=>{
 require('dotenv').config();const {Client}=require('pg');const opts={host:process.env.DB_HOST||'localhost',database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD};
 const a=new Client(opts),b=new Client(opts);const schema='signing_tier_race_'+process.pid;
 await a.connect();await b.connect();
 try{
  await a.query(`CREATE SCHEMA ${schema}`);await a.query(`SET search_path=${schema}`);await b.query(`SET search_path=${schema}`);
  await a.query(fixtureSql);await a.query(fs.readFileSync(require.resolve('../migrations/2026-11-04_00_automatic_signing_tiers.sql'),'utf8'));
  await a.query('UPDATE firm_billing SET signing_auto_tier_enabled=true');
  await a.query('BEGIN');await b.query('BEGIN');
  await a.query("INSERT INTO signing_submissions(id,owner_context_id,document_count) VALUES('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001',500)");
  const waiting=b.query('INSERT INTO signingfiles(signingfileid) VALUES(1)');
  const pid=(await a.query('SELECT pid FROM pg_stat_activity WHERE pid=$1',[b.processID])).rows[0].pid;
  let blocked=false;for(let i=0;i<20;i++){const locks=await a.query('SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted',[pid]);if(locks.rowCount){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}
  assert.equal(blocked,true);await a.query('COMMIT');await waiting;await b.query('COMMIT');
  const r=(await a.query('SELECT signing_id,price_monthly_ils FROM firm_billing')).rows[0];assert.equal(r.signing_id,'1500');assert.equal(r.price_monthly_ils,'1014');
  assert.equal((await a.query('SELECT sum(documents)::int n FROM signing_billing_usage')).rows[0].n,501);
 }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');await a.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await a.end();await b.end();}
});
