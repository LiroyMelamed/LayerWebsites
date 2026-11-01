#!/usr/bin/env python3
"""Hold an owned shared maintenance lease for an active QA run; no app mutation.
Default is a local plan. Type status or release; hard timeout always releases it.
"""
import argparse,json,shlex,subprocess
from pathlib import Path
HOSTS={'frontend':'root@84.46.253.85','backend':'root@37.60.230.148'}
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--target',required=True,choices=HOSTS);p.add_argument('--seconds',type=int,default=1800);p.add_argument('--execute',action='store_true');a=p.parse_args()
assert 1<=a.seconds<=1800
if not a.execute:
 print(json.dumps({'result':'LOCAL_SHARED_QA_LEASE_PLAN','target':a.target,'host':HOSTS[a.target],'maxSeconds':a.seconds,'runtimeMutation':False}));raise SystemExit(0)
remote="import sys,os,datetime;print('QA_SHARED_LEASE_ACQUIRED pid='+str(os.getpid())+' at='+datetime.datetime.now(datetime.timezone.utc).isoformat(),flush=True);\nfor line in sys.stdin:\n text=line.strip()\n if text=='release':\n  print('QA_SHARED_LEASE_RELEASED',flush=True);break\n if text=='status':print('QA_SHARED_LEASE_HELD',flush=True)"
args=['flock','--shared','--nonblock','--conflict-exit-code','75','/run/lock/melamedia-release-maintenance.lock','timeout','--signal=TERM','--kill-after=3s',str(a.seconds)+'s','python3','-u','-c',remote]
ssh=['ssh','-T','-i',str(Path.home()/'.ssh/id_ed25519'),'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ForwardAgent=no','-o','ForwardX11=no','-o','ClearAllForwardings=yes','-o','ConnectTimeout=8',HOSTS[a.target],' '.join(shlex.quote(v) for v in args)]
raise SystemExit(subprocess.call(ssh))
