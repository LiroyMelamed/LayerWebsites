import fcntl,subprocess,sys,datetime
with open('/tmp/layer-billing-integration-20261101/build.lock','a+') as lock:
 print('LOCAL_BUILD_LOCK_WAIT '+datetime.datetime.now(datetime.timezone.utc).isoformat(),flush=True)
 fcntl.flock(lock,fcntl.LOCK_EX)
 print('LOCAL_BUILD_LOCK_ACQUIRED '+datetime.datetime.now(datetime.timezone.utc).isoformat(),flush=True)
 sys.exit(subprocess.call(sys.argv[1:]))
