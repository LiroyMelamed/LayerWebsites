// Run only against the dedicated synthetic template QA database. No dotenv/provider access.
const { createRequire } = require('node:module');
const requireBackend = createRequire(require('node:path').resolve(__dirname,'../../package.json'));
requireBackend('dotenv').config = () => ({ parsed: {} });
for (const key of Object.keys(process.env)) if (/^(DB_|FIRM_PERM_DB_|DATABASE_URL|S3_|SMTP_|SMOOVE_|INFORU_|FIREBASE_|QA_OUTBOUND_|JWT_|SIGNING_|PUSH_|OPENAI_|GOOGLE_|AWS_)/.test(key)) delete process.env[key];
Object.assign(process.env, {
 DB_HOST:'127.0.0.1',DB_PORT:'55442',DB_NAME:'legal_e2e_qa',DB_USER:'postgres',DB_PASSWORD:'',DB_SSL:'false',
 NODE_ENV:'test',IS_PRODUCTION:'false',LEGAL_DB_QA:'true',CANDIDATE_DB_PORT:'55442',DB_DISABLE_CONNECT_TEST:'true',
 DB_POOL_IDLE_TIMEOUT_MS:'300',DB_POOL_CONN_TIMEOUT_MS:'1500',BACKGROUND_JOBS_ENABLED:'false',
 JWT_SECRET:'synthetic-templates-only',SIGNING_ENABLED:'true',SIGNING_CLIENT_OTP_REQUIRED:'true',SIGNING_OTP_ENABLED:'true',SIGNING_OTP_PEPPER:'synthetic-only',
 WEBSITE_DOMAIN:'qa.example.invalid',S3_ENDPOINT:'http://127.0.0.1:9',S3_KEY:'synthetic',S3_SECRET:'synthetic',S3_BUCKET:'qa',AWS_EC2_METADATA_DISABLED:'true',
});
const assert = require('node:assert/strict');const pg = requireBackend('pg');
const OriginalPool=pg.Pool;pg.Pool=class extends OriginalPool { constructor(opts) { assert.equal(opts.host,'127.0.0.1');assert.equal(String(opts.port),'55442');assert.equal(opts.database,'legal_e2e_qa');super(opts); } };
const net=require('node:net');const original=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args) { const opts=net._normalizeArgs(args)[0];if(opts.path || (opts.host && !['127.0.0.1','localhost','::1'].includes(opts.host)) || String(opts.port)==='5432') throw Error('Signing template QA forbids external connections');return original.apply(this,args); };
requireBackend('./tests/helpers/preload');
