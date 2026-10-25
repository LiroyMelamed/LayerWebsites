#!/usr/bin/env python3
"""Exact reviewed Idm-only history objects; shared bucket and all peers preserved."""
import datetime, hashlib, json, pathlib, subprocess
O=pathlib.Path(__file__).resolve().parent
NODE=r'''
const fs=require('fs'),crypto=require('crypto'),H=b=>crypto.createHash('sha256').update(b).digest('hex');
const dotenv=require('/root/LayerWebsites/backend/node_modules/dotenv');
const {S3Client,ListObjectsV2Command,ListMultipartUploadsCommand,DeleteObjectCommand}=require('/root/LayerWebsites/backend/node_modules/@aws-sdk/client-s3');
const {NodeHttpHandler}=require('/root/LayerWebsites/backend/node_modules/@smithy/node-http-handler');
const STAGE='/root/idm-cloud-retirement-20261025',ACCOUNT='a7b58cce47b02fad30da2212df3e0864',BUCKET='melamedia-recovery',ENDPOINT='https://'+ACCOUNT+'.r2.cloudflarestorage.com';
const PREFIXES=['server-recovery/vmi2784047/idm-recovery/','server-recovery/vmi3233549/idm-recovery/'];
let client,deleted=0,deletedBytes=0;const start=Date.now();
const R={at:new Date().toISOString(),accountId:ACCOUNT,bucket:BUCKET,noSharedBucketDeletion:true,noOtherProjectObjectAccess:true,noCredentialsOrObjectNamesExported:true};
function need(v,c){if(!v)throw Object.assign(Error(c),{safeCode:c});}
function checked(p,h){const s=fs.lstatSync(p);need(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0,'PRIVATE_FILE_IDENTITY_REQUIRED');const b=fs.readFileSync(p);need(H(b)===h,'PINNED_PRIVATE_BYTES_CHANGED');return b;}
function journal(event,fields={}){fs.appendFileSync(STAGE+'/history-purge05-journal.private.jsonl',JSON.stringify({at:new Date().toISOString(),event,...fields})+'\n',{mode:0o600});}
async function exactHostNamespaces(){const r=await client.send(new ListObjectsV2Command({Bucket:BUCKET,Prefix:'server-recovery/',Delimiter:'/',MaxKeys:1000}));need(!r.IsTruncated&&(r.Contents||[]).every(x=>x.Key==='server-recovery/'),'HOST_NAMESPACE_DRIFT');const hosts=(r.CommonPrefixes||[]).map(x=>x.Prefix).sort();need(JSON.stringify(hosts)===JSON.stringify(PREFIXES.map(x=>x.replace(/idm-recovery\/$/,''))),'HOST_NAMESPACE_SET_CHANGED');}
async function inventory(){const objects=[];
  for(const prefix of PREFIXES){need(Date.now()-start<150000,'OPERATION_TIME_BOUND');const r=await client.send(new ListObjectsV2Command({Bucket:BUCKET,Prefix:prefix,MaxKeys:1000}));need(!r.IsTruncated,'OBJECT_SCOPE_EXPANDED');for(const x of r.Contents||[]){need(x.Key.startsWith(prefix),'OBJECT_OUTSIDE_EXACT_IDM_PREFIX');objects.push({key:x.Key,bytes:x.Size,etag:x.ETag,lastModified:x.LastModified?.toISOString()});}
    const m=await client.send(new ListMultipartUploadsCommand({Bucket:BUCKET,Prefix:prefix,MaxUploads:1000}));need(!m.IsTruncated&&(m.Uploads||[]).length===0,'MULTIPART_DRIFT');}
  return objects.sort((a,b)=>a.key.localeCompare(b.key));
}
async function main(){
  const manifest=JSON.parse(checked(STAGE+'/history-objects04.private.json','9c30c37b0d1788c3df9cbab6b770a60bf6896792797dc7069c160e5cdb56fe9a'));
  need(manifest.accountId===ACCOUNT&&manifest.bucket===BUCKET&&JSON.stringify(manifest.prefixes)===JSON.stringify(PREFIXES),'EXACT_SHARED_BUCKET_IDM_PREFIX_BINDING_REQUIRED');need(manifest.objects.length===3&&manifest.objects.reduce((s,x)=>s+x.bytes,0)===38709366&&manifest.uploads.length===0,'EXACT_THREE_OBJECT_38709366_BYTE_SCOPE_REQUIRED');
  need(manifest.objects.every(x=>PREFIXES.some(p=>x.key.startsWith(p))),'PRIVATE_MANIFEST_OUTSIDE_IDM_SCOPE');
  const rows=JSON.parse(checked(STAGE+'/backup-targets.private.json','d46bb62b3a8ecf5809b05e06d7b886fe6ef018fd1b701e88d448a1b1cf3183c8'));
  const sources=rows.filter(x=>x.bucket===BUCKET&&x.isOriginalIdmArchiveEnv===true&&x.isOriginalIdmArchiveBucket===true);need(sources.length>0&&sources.every(x=>x.envPath===sources[0].envPath),'ONE_SHARED_NATIVE_CREDENTIAL_SOURCE_REQUIRED');
  const eraw=checked(sources[0].envPath,'82adcf4e535743a70704b5b5b8a57bd847bdf7dd0faff76117fc8373c30cb0a2'),e=dotenv.parse(eraw);need(e.S3_BUCKET===BUCKET&&e.S3_ENDPOINT===ENDPOINT&&e.S3_KEY&&e.S3_SECRET,'CURRENT_SHARED_NATIVE_CREDENTIAL_BINDING_REQUIRED');
  client=new S3Client({region:'auto',endpoint:ENDPOINT,credentials:{accessKeyId:e.S3_KEY,secretAccessKey:e.S3_SECRET},maxAttempts:1,requestHandler:new NodeHttpHandler({connectionTimeout:5000,socketTimeout:20000})});
  need(!fs.existsSync(STAGE+'/history-purge05-started.json'),'PURGE_ALREADY_ATTEMPTED_NO_BLIND_RETRY');fs.writeFileSync(STAGE+'/history-purge05-started.json',JSON.stringify({at:new Date().toISOString(),bucket:BUCKET,manifestSha256:'9c30c37b0d1788c3df9cbab6b770a60bf6896792797dc7069c160e5cdb56fe9a'}),{flag:'wx',mode:0o600});
  await exactHostNamespaces();const current=await inventory();need(JSON.stringify(current)===JSON.stringify(manifest.objects),'EXACT_OBJECT_METADATA_DRIFT_STOP_BEFORE_DELETE');journal('exact-three-idm-object-manifest-and-zero-multipart-confirmed');
  for(const object of manifest.objects){need(Date.now()-start<150000,'OPERATION_TIME_BOUND');journal('exact-idm-object-delete-request',{keySha256:H(Buffer.from(object.key)),bytes:object.bytes});const result=await client.send(new DeleteObjectCommand({Bucket:BUCKET,Key:object.key}));need(result.$metadata.httpStatusCode===204,'EXACT_OBJECT_DELETE_ACCEPTANCE_UNVERIFIED');deleted++;deletedBytes+=object.bytes;journal('exact-idm-object-delete-accepted',{keySha256:H(Buffer.from(object.key))});}
  await exactHostNamespaces();need((await inventory()).length===0,'IDM_PREFIXES_NOT_EMPTY_AFTER_EXACT_DELETE');journal('both-exact-idm-prefixes-empty-and-zero-multipart-verified');
  Object.assign(R,{result:'PASS_EXACT_IDM_SHARED_BACKUP_PREFIX_PURGE',deletedObjectCount:deleted,deletedObjectBytes:deletedBytes,exactPrefixes:PREFIXES,allDiscoveredHostIdmPrefixesEmpty:true,multipartUploadCount:0,sourceManifestSha256:'9c30c37b0d1788c3df9cbab6b770a60bf6896792797dc7069c160e5cdb56fe9a',sharedNativeCredentialPreserved:true,sharedBucketPreserved:true,noCredentialOrPermissionChange:true});
  fs.writeFileSync(STAGE+'/history-purge05-public.json',JSON.stringify(R),{flag:'wx',mode:0o600});console.log(JSON.stringify(R));
}
main().catch(error=>{Object.assign(R,{result:'STOPPED_NO_BLIND_RETRY',errorClass:error.name,safeCode:error.safeCode||null,httpStatus:error.$metadata?.httpStatusCode||null,deletedObjectCount:deleted,deletedObjectBytes:deletedBytes});try{journal('purge-stopped',R);}catch{}console.log(JSON.stringify(R));process.exitCode=1;}).finally(()=>client?.destroy());
'''
def main():
    wrapper="import os,fcntl,subprocess\nf=os.open('/run/lock/melamedia-release-maintenance.lock',os.O_RDONLY|os.O_NOFOLLOW);fcntl.flock(f,fcntl.LOCK_SH|fcntl.LOCK_NB)\np=subprocess.run(['node','-'],input="+repr(NODE.encode())+")\nfcntl.flock(f,fcntl.LOCK_UN);os.close(f);raise SystemExit(p.returncode)\n"
    p=subprocess.run(['ssh','-i',str(pathlib.Path.home()/'.ssh/id_ed25519'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@37.60.230.148','python3 -'],input=wrapper.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=210)
    r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'ROOT_REVIEW_REQUIRED_EXACT_THREE_IDM_SHARED_BACKUP_OBJECTS_ONLY','exitCode':p.returncode,'scriptSha256':hashlib.sha256(wrapper.encode()).hexdigest(),'stdoutSha256':hashlib.sha256(p.stdout).hexdigest(),'stderrSha256':hashlib.sha256(p.stderr).hexdigest(),'stderrBytes':len(p.stderr)}
    if p.stdout:
        try:r['observation']=json.loads(p.stdout)
        except Exception:r['result']='UNVERIFIED_RESPONSE_NO_RETRY'
    else:r['result']='UNVERIFIED_LOCK_OR_TRANSPORT_NO_RETRY'
    dest=O/'backup-prefix-purge05.json';assert not dest.exists();dest.write_text(json.dumps(r,indent=2)+'\n')
    print(json.dumps({'path':str(dest),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'result':r.get('observation',{}).get('result',r.get('result')),'deletedObjectCount':r.get('observation',{}).get('deletedObjectCount'),'deletedObjectBytes':r.get('observation',{}).get('deletedObjectBytes')},indent=2))
if __name__=='__main__':main()
