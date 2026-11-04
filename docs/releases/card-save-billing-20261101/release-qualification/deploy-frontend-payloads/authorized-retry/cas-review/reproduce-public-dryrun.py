#!/usr/bin/env python3
"""Read captured public bytes and compute a pure reviewed index plan. No network."""
from pathlib import Path
import argparse,hashlib,json,importlib.util,os
P=argparse.ArgumentParser();P.add_argument('--snapshots',type=Path,required=True);P.add_argument('--compiled-root',type=Path,required=True);P.add_argument('--output-root',type=Path,required=True);P.add_argument('--merger',type=Path,required=True);a=P.parse_args()
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(a.merger.read_bytes())=='f14e06dc848c00e2780a2af1a9a6536aa04f71978d6e1b754121fe0f2d7f5fd1'
assert not a.output_root.exists();os.umask(0o077);a.output_root.mkdir(mode=0o700,parents=True)
spec=importlib.util.spec_from_file_location('reviewed_pure_merger',a.merger);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for key in ['melamedia','ashrafessa','morlevy','melamedlaw']:
 s=json.loads((a.snapshots/(key+'.json')).read_text());assert s['snapshotResult']=='PASS_STATIC_SNAPSHOT'and not s['holds']
 assert not s['headerCsp']and not s['headerCspReportOnly']and not s['metaCsp'],'CSP changed: separate review required'
 old=Path(s['privateIndexPath']).read_bytes();manifest=Path(s['privateManifestPath']).read_bytes();assert sha(old)==s['indexSha256']and sha(manifest)==s['manifestSha256']
 new=(a.compiled_root/key/'compiled/asset-manifest.json').read_bytes();merged,proof=m.merge_index(old,json.loads(manifest),json.loads(new))
 out=a.output_root/key;out.mkdir(mode=0o700);(out/'index.proposed.html').write_bytes(merged);(out/'asset-manifest.proposed.json').write_bytes(new);(out/'proof.json').write_text(json.dumps(proof,indent=2)+'\n')
 print(key,proof['oldIndexSha256'],proof['newIndexSha256'])
