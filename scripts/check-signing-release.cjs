#!/usr/bin/env node
'use strict';
// Read-only: refuse an old lineage, missing module, changed unreviewed module or dirty source.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function checkSigningRelease({root,ref='HEAD',manifest,checkWorktree=ref==='HEAD'}) {
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe']});
 if (!manifest || manifest.schema!==1 || !manifest.files || !Object.keys(manifest.files).length || !/^[a-f0-9]{40}$/.test(manifest.requiredAncestor)) throw Error('Invalid signing release manifest');
 const sha=git('rev-parse','--verify',ref+'^{commit}').toString().trim();
 try {git('merge-base','--is-ancestor',manifest.requiredAncestor,sha);} catch {throw Error('This candidate is missing the shipped signing corrections. Merge the reviewed signing release before deploying.');}
 for(const [file,expected] of Object.entries(manifest.files)) {
  const digest=crypto.createHash('sha256').update(git('show',sha+':'+file)).digest('hex');
  if(digest!==expected) throw Error('Unreviewed signing source: '+file+'. Revalidate the change and update the release manifest.');
  if(checkWorktree && !git('show',sha+':'+file).equals(fs.readFileSync(path.join(root,file)))) throw Error('Uncommitted signing source: '+file);
 }
 return {commit:sha,files:Object.keys(manifest.files).length};
}
module.exports={checkSigningRelease};
if(require.main===module){try{const root=path.resolve(__dirname,'..');const ref=process.argv[2]||'HEAD';const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/signing-v2/release-baseline.json'),'utf8'));console.log(JSON.stringify(checkSigningRelease({root,ref,manifest})));}catch(e){console.error('Signing release blocked: '+e.message);process.exitCode=1;}}
