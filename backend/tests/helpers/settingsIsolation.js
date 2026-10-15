const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const req = createRequire(require('node:path').resolve(__dirname, '../../package.json'));
req('dotenv').config = () => ({ parsed: {} });
for (const key of Object.keys(process.env)) if (/^(DB_|FIRM_PERM_DB_|DATABASE_URL|S3_|SMTP_|SMOOVE_|INFORU_|FIREBASE_|QA_OUTBOUND_|JWT_|SIGNING_|PUSH_|OPENAI_|GOOGLE_|OUTLOOK_|AWS_)/.test(key)) delete process.env[key];
Object.assign(process.env, {
  DB_HOST:'127.0.0.1', DB_PORT:'55439', DB_NAME:'codex_settings_20261006', DB_USER:'postgres', DB_PASSWORD:'', DB_SSL:'false',
  FIRM_PERM_DB_HOST:'127.0.0.1', FIRM_PERM_DB_PORT:'55439', FIRM_PERM_DB_NAME:'codex_settings_20261006', FIRM_PERM_DB_USER:'postgres', FIRM_PERM_DB_PASSWORD:'',
  NODE_ENV:'test', IS_PRODUCTION:'false', LEGAL_DB_QA:'true', DB_DISABLE_CONNECT_TEST:'true', DB_POOL_IDLE_TIMEOUT_MS:'500', DB_POOL_CONN_TIMEOUT_MS:'3000',
  BACKGROUND_JOBS_ENABLED:'false', JWT_SECRET:'isolated-readiness-synthetic-only', SIGNING_ENABLED:'true',
  S3_ENDPOINT:'http://127.0.0.1:9', S3_KEY:'synthetic', S3_SECRET:'synthetic', S3_BUCKET:'qa', AWS_EC2_METADATA_DISABLED:'true',
});
const pg = req('pg');
function guard(options) {
  assert.equal(options.database, 'codex_settings_20261006');
  assert.equal(options.host, '127.0.0.1');
  assert.equal(String(options.port), '55439');
  assert.ok(!options.connectionString);
}
const OriginalPool = pg.Pool;
pg.Pool = class extends OriginalPool { constructor(options) { guard(options); super(options); } };
const OriginalClient = pg.Client;
pg.Client = class extends OriginalClient { constructor(options) { guard(options); super(options); } };
const net = require('node:net');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const opts=net._normalizeArgs(args)[0];
  if (opts.path || (opts.host && !['127.0.0.1','localhost','::1'].includes(opts.host)) || String(opts.port)==='5432') throw Error('Readiness tests forbid external and default database connections');
  return originalConnect.apply(this,args);
};
require('./preload.js');
