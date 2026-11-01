"""Compile this local candidate with synthetic public config and private caches.

No publication, provider, application DB, customer settings or shared dependency
write. The disposable build source is a Git export, not the live QA worktree.
"""
from pathlib import Path
import datetime, hashlib, json, os, subprocess, tarfile

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
RUN = Path('/tmp/layer-integration-Melamedia-build')
NODE = Path('/Users/liroymelamed/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node')
DEP = Path('/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2/work/qa-new-features-melamedia-20261023/frontend/node_modules')

def sha(value):
    return hashlib.sha256(value).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode().strip()

candidate = git('rev-parse', 'HEAD')
RUN.mkdir(exist_ok=False)
(RUN / '.mela-retention-pin').write_text('Owner: Codex integration QA agent. Local review compile; preserve until parent handoff; review 2026-11-08.\n')
archive = RUN / 'source.tar'
archive.write_bytes(subprocess.check_output(['git', 'archive', candidate, 'frontend', 'scripts/prepare-public-env.cjs'], cwd=ROOT))
source = RUN / 'source'
source.mkdir()
with tarfile.open(archive) as bundle:
    for entry in bundle.getmembers():
        name = Path(entry.name)
        if name.is_absolute() or '..' in name.parts or entry.issym() or entry.islnk():
            raise RuntimeError('Unsafe Git archive entry')
    bundle.extractall(source)
front = source / 'frontend'
(front / 'node_modules').symlink_to(DEP, target_is_directory=True)
packages = {name: sha((front / name).read_bytes()) for name in ['package.json', 'package-lock.json', 'node_modules/.package-lock.json']}
source_before = {str(p.relative_to(front)): sha(p.read_bytes()) for p in (front / 'src').rglob('*') if p.is_file()}
deny = RUN / 'deny-network.cjs'
deny.write_text("require('node:net').Socket.prototype.connect=function(){throw Error('LOCAL_REVIEW_BUILD_NETWORK_DENIED');};global.fetch=()=>Promise.reject(Error('LOCAL_REVIEW_BUILD_NETWORK_DENIED'));\n")
wrapper = RUN / 'cache-only.craco.cjs'
wrapper.write_text("const path=require('node:path');const root=" + json.dumps(str(front)) + ";const c=require(path.join(root,'craco.config.js'));const original=c.webpack.configure;c.webpack.configure=(w,x)=>{const v=original(w,x);if(v.cache&&typeof v.cache==='object')v.cache.cacheDirectory=path.join(__dirname,'webpack');let n=0;function visit(r){if(!r||typeof r!=='object')return;if(typeof r.loader==='string'&&r.loader.includes('babel-loader')&&r.options)r.options.cacheDirectory=path.join(__dirname,'babel-'+n++);for(const z of r.oneOf||[])visit(z);for(const z of r.rules||[])visit(z);if(Array.isArray(r.use))for(const z of r.use)visit(z);}for(const r of v.module?.rules||[])visit(r);for(const p of v.plugins||[]){if(p.constructor?.name==='ESLintWebpackPlugin'&&p.options)p.options.cacheLocation=path.join(__dirname,'eslint/.eslintcache');if(p.constructor?.name==='ForkTsCheckerWebpackPlugin'&&p.options?.typescript?.configOverwrite?.compilerOptions)p.options.typescript.configOverwrite.compilerOptions.tsBuildInfoFile=path.join(__dirname,'typescript.tsbuildinfo');}return v;};module.exports=c;\n")
variant = b'REACT_APP_API_BASE_URL=http://127.0.0.1:55799\n'
(front / '.env.production.melamedia').write_bytes(variant)
env = {k:v for k,v in os.environ.items() if not k.startswith(('REACT_APP_', 'DB_', 'PG', 'SMTP_', 'S3_', 'FIREBASE_', 'DATABASE_URL', 'CENTRAL_', 'WAHA_', 'META_', 'WHATSAPP_', 'NODE_OPTIONS', 'NODE_PATH'))}
env.update({'CI':'false', 'NODE_ENV':'production', 'BUILD_PATH':str(RUN / 'build'), 'BABEL_CACHE_PATH':str(RUN / 'babel-build.json'),
    'NODE_OPTIONS':'--require ' + str(deny), 'PATH':str(NODE.parent) + os.pathsep + env.get('PATH',''), 'BROWSERSLIST_IGNORE_OLD_DATA':'true'})
commands = [[str(NODE), 'scripts/copy-pdf-worker.js'], [str(NODE), 'scripts/apply-tenant-branding.js', 'melamedia'],
    [str(NODE), '../scripts/prepare-public-env.cjs', 'melamedia'], [str(NODE), str(front / 'node_modules/@craco/craco/dist/bin/craco.js'), 'build', '--config', str(wrapper)]]
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
steps = []
with (OUT / 'build.log').open('w') as log:
    for command in commands:
        result = subprocess.run(command, cwd=front, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=600)
        steps.append({'command':command, 'exitCode':result.returncode})
        if result.returncode: break
packages_after = {name:sha((front / name).read_bytes()) for name in packages}
source_after = {str(p.relative_to(front)):sha(p.read_bytes()) for p in (front / 'src').rglob('*') if p.is_file()}
# Branding intentionally changes only the frozen export's logo scratch, never the worktree.
unexpected_drift = sorted(name for name in source_before.keys() | source_after.keys() if source_before.get(name) != source_after.get(name) and not name.startswith('src/assets/images/logos/'))
artifacts = {str(p.relative_to(RUN / 'build')):sha(p.read_bytes()) for p in (RUN / 'build').rglob('*') if p.is_file()}
report = {'startedAtUtc':started, 'completedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'candidate':candidate,
    'headAtFinish':git('rev-parse','HEAD'), 'kind':'FULL_BRANDED_PRODUCTION_COMPILE_WITH_SYNTHETIC_LOOPBACK_API_NOT_DEPLOYMENT',
    'tenant':'Melamedia', 'publicApiOrigin':'http://127.0.0.1:55799', 'publicEnvSha256':sha(variant), 'sourceArchiveSha256':sha(archive.read_bytes()),
    'steps':steps, 'exitCode':steps[-1]['exitCode'], 'node':subprocess.check_output([str(NODE),'--version']).decode().strip(),
    'packages':packages, 'packagesAfter':packages_after, 'dependencyStable':packages == packages_after,
    'unexpectedSourceDrift':unexpected_drift, 'sourceStable':not unexpected_drift and git('rev-parse','HEAD') == candidate,
    'cacheWrapperSha256':sha(wrapper.read_bytes()), 'networkDenySha256':sha(deny.read_bytes()),
    'artifactDirectory':str(RUN / 'build'), 'artifacts':artifacts, 'deployed':False}
(OUT / 'build-receipt.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['candidate','exitCode','dependencyStable','sourceStable','artifactDirectory']}))
raise SystemExit(0 if report['exitCode'] == 0 and report['dependencyStable'] and report['sourceStable'] else 1)
