'use strict';
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const cp = require('node:child_process'); const assert = require('node:assert/strict');
const guard = path.resolve(__dirname, 'check-env-safety.cjs');
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'env-guard-test-'));
function git(...args) { return cp.execFileSync('git', args, {cwd:repo,stdio:'pipe'}); }
function check() { return cp.spawnSync(process.execPath,[guard,repo],{encoding:'utf8'}); }
function set(file, content) { fs.mkdirSync(path.dirname(path.join(repo,file)),{recursive:true});fs.writeFileSync(path.join(repo,file),content);git('add','-f','--',file); }
try {
 git('init','-q');
 set('.env.example','JWT_SECRET= # Configure locally\nDB_PASSWORD="" # empty\nDATABASE_URL=postgres://postgres:postgres@localhost:5432/dev\nREACT_APP_APP_NAME=Demo\n');
 assert.equal(check().status,0,'Empty credentials and disposable local database defaults remain usable');
 set('backend/.env.staging','API_KEY=synthetic-not-a-real-key\n');
 assert.equal(check().status,1,'A forced addition of an active nested environment is rejected');git('rm','--cached','--','backend/.env.staging');
 set('.env.example','JWT_SECRET=synthetic-not-a-real-credential\n');assert.equal(check().status,1,'Credential assignments inside allowed templates are rejected');
 set('.env.example','# JWT_SECRET=synthetic-not-a-real-credential\n');assert.equal(check().status,1,'Commented credentials are also rejected');
 set('.env.example','DATABASE_URL=postgres://user:synthetic-credential@database.invalid/dev\n');assert.equal(check().status,1,'Remote connection credentials are rejected');
 set('.env.example','REACT_APP_API_KEY=synthetic-not-a-real-key\n');assert.equal(check().status,1,'Public-variable prefixes cannot bypass secret checks');
 set('.env.example','JWT_SECRET="" # Configure locally\nPUBLIC_URL=https://example.invalid\n');assert.equal(check().status,0,'Quoted empty credentials and public URLs pass');
 for (const scheme of ['redis','smtp','https']) { set('.env.example',`SERVICE_URL=${scheme}://user:synthetic-credential@service.invalid/path\n`);assert.equal(check().status,1,scheme+' credentials are rejected'); }
 console.log('10 environment-boundary checks passed');
} finally { fs.rmSync(repo,{recursive:true,force:true}); }
