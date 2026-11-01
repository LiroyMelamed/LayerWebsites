'use strict';
// Read-only Git/source provenance. It never executes donor application code.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const ROOT = '/tmp/layer-billing-debt-20261101';
const OUTPUT_ROOT = '/tmp/layer-billing-main-current-20261101';
const OUT = path.join(OUTPUT_ROOT, 'docs/releases/card-save-billing-20261101/release-qualification/main-frontend');
const BASE = '9dd9cb3607ee79434fcfb1aed5a40773e5713789';
const DONOR = '6a3bd299227291feb0065ae3afa89a1f3ba2967a';
const PREVIOUS_DONOR = '6fab2887d056262cf52ddb773a377e5ad804f0d7';
const DEPS = fs.realpathSync(path.join(ROOT, 'frontend/node_modules'));
const parser = require(path.join(DEPS, '@babel/parser'));
const git = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
const str = (...args) => git(...args).toString().trim();
const lines = value => value.trim() ? value.trim().split('\n') : [];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const blob = (ref, file) => git('show', ref + ':' + file);
const files = (ref, folder) => lines(str('ls-tree', '-r', '--name-only', ref, '--', folder));
assert.equal(str('rev-parse', 'HEAD'), BASE, 'Do not change the qualified worktree HEAD');
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: OUTPUT_ROOT }).toString().trim(), DONOR, 'Output root must be the requested final donor');
for (const folder of ['frontend', 'backend']) assert.equal(fs.realpathSync(path.join(ROOT, folder, 'node_modules')), fs.realpathSync(path.join(OUTPUT_ROOT, folder, 'node_modules')), 'Original and current donor must resolve the same toolchain');
const groups = {};
for (const folder of ['frontend', 'scripts']) {
  const oldFiles = files(BASE, folder), newFiles = files(DONOR, folder);
  assert.deepEqual(oldFiles, newFiles, folder + ' path list changed');
  const mismatches = oldFiles.filter(file => !blob(BASE, file).equals(blob(DONOR, file)));
  assert.deepEqual(mismatches, [], folder + ' bytes changed');
  const baseTree = str('rev-parse', BASE + ':' + folder), donorTree = str('rev-parse', DONOR + ':' + folder);
  assert.equal(baseTree, donorTree);
  groups[folder] = { fileCount: oldFiles.length, baseTree, donorTree, byteMismatches: mismatches,
    inputManifestSha256: sha(Buffer.from(oldFiles.map(file => file + ' ' + sha(blob(BASE, file))).join('\n'))) };
}
const direct = [], dynamic = [], parseErrors = [];
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc','start','end','comments','tokens','extra'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
function resolveRelative(file, spec) {
  const base = path.resolve(ROOT, path.dirname(file), spec);
  const candidates = [base, base + '.js', base + '.json', base + '.cjs', path.join(base, 'index.js')];
  const result = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!result) throw new Error('Unresolved relative backend helper: ' + file + ' -> ' + spec);
  return path.relative(ROOT, result);
}
for (const file of files(BASE, 'frontend/src').filter(file => /\.(?:[cm]?js|jsx|ts|tsx)$/.test(file))) {
  const text = blob(BASE, file).toString();
  let ast;
  try { ast = parser.parse(text, { sourceType: 'unambiguous', plugins: ['jsx', 'typescript'] }); }
  catch (error) { parseErrors.push({ file, reason: error.message }); continue; }
  walk(ast, node => {
    let spec, method;
    if (['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type) && node.source) {
      spec = node.source.value; method = node.type;
    } else if (node.type === 'CallExpression' && (node.callee?.name === 'require' || node.callee?.type === 'Import')) {
      method = node.callee.name || 'import';
      if (node.arguments[0]?.type === 'StringLiteral') spec = node.arguments[0].value;
      else dynamic.push({ file, line: node.loc.start.line, expression: text.slice(node.start, node.end) });
    }
    if (typeof spec !== 'string' || !spec.startsWith('.')) return;
    const absolute = path.resolve(ROOT, path.dirname(file), spec);
    if (absolute.startsWith(path.join(ROOT, 'backend') + path.sep) || absolute === path.join(ROOT, 'backend')) {
      direct.push({ file, line: node.loc.start.line, method, specifier: spec, resolved: resolveRelative(file, spec) });
    }
  });
}
assert.deepEqual(parseErrors, [], 'Unparsed frontend sources prevent an import-scope proof');
// Only locale JSON is dynamically required; its bounded literal prefix is fully
// inside the identical frontend tree. All backend imports above are literal.
const unbounded = dynamic.filter(row => row.file !== 'frontend/src/components/billing/SystemMessageConsent.test.js'
  || row.expression !== "require('../../i18n/locales/' + mockLanguage + '.json')");
assert.deepEqual(unbounded, [], 'Unreviewed dynamic import requires manual scope analysis');
assert(direct.length > 0, 'Expected actual Word helper imports in frontend tests');
const helperPaths = [...new Set([
  ...files(BASE, 'backend/lib/wordTemplates'),
  'backend/utils/clientProfile.js',
])].sort();
const helpers = helperPaths.map(file => ({ file, baseSha256: sha(blob(BASE, file)), donorSha256: sha(blob(DONOR, file)) }));
assert(helpers.every(row => row.baseSha256 === row.donorSha256));
assert(direct.every(row => helperPaths.includes(row.resolved)), 'Unexpected backend import outside conservative helper scope');
const allChangedPaths = lines(str('diff', '--name-only', BASE, DONOR));
const auditPaths = allChangedPaths.filter(file => file.startsWith('docs/releases/card-save-billing-20261101/'));
const changed = allChangedPaths.filter(file => !auditPaths.includes(file));
assert(changed.every(file => file.startsWith('backend/')), 'Unexpected non-backend/non-audit donor change');
const deltaAllPaths = lines(str('diff', '--name-only', PREVIOUS_DONOR, DONOR));
const deltaAuditPaths = deltaAllPaths.filter(file => file.startsWith('docs/releases/card-save-billing-20261101/'));
const deltaRuntimePaths = deltaAllPaths.filter(file => !deltaAuditPaths.includes(file));
assert.deepEqual(deltaRuntimePaths, ['backend/lib/qaOutboundNoop.js', 'backend/tests/qaOutboundNoop.recovery.test.js'], 'Unexpected new QA guard delta');
assert(!changed.some(file => helperPaths.includes(file)), 'Donor changes an imported helper');
const locks = {};
for (const file of ['frontend/package.json','frontend/package-lock.json','backend/package.json','backend/package-lock.json']) {
  locks[file] = { baseSha256: sha(blob(BASE, file)), donorSha256: sha(blob(DONOR, file)) };
  assert.equal(locks[file].baseSha256, locks[file].donorSha256);
}
const receipts = {};
for (const name of ['frontend-tests-receipt.json', 'production-build-receipt.json']) {
  const bytes = fs.readFileSync(path.join(OUT, name)), value = JSON.parse(bytes);
  assert.equal(value.candidateCommit, BASE); assert.equal(value.headAtFinish, BASE);
  assert.equal(value.exitCode, 0); assert.equal(value.sourceStable, true);
  const log = name.startsWith('frontend') ? 'frontend-tests.log' : 'production-build.log';
  assert.equal(sha(fs.readFileSync(path.join(OUT, log))), value.logSha256);
  receipts[name] = { sha256: sha(bytes), candidateCommit: value.candidateCommit, exitCode: value.exitCode,
    sourceStable: value.sourceStable, summary: value.summary || null };
}
const testReceipt = JSON.parse(fs.readFileSync(path.join(OUT, 'frontend-tests-receipt.json')));
const compileReceipt = JSON.parse(fs.readFileSync(path.join(OUT, 'production-build-receipt.json')));
assert.equal(compileReceipt.originalCracoSha256, sha(blob(BASE, 'frontend/craco.config.js')));
const workerSha256 = sha(fs.readFileSync(path.join(DEPS, 'pdfjs-dist/build/pdf.worker.min.mjs')));
assert.equal(compileReceipt.artifactHashes['pdf.worker.min.mjs'], workerSha256);
assert.equal(compileReceipt.artifactHashes['pdf.worker.min.js'], workerSha256);
const installed = {};
for (const [label, proof] of Object.entries(testReceipt.dependencyProof)) {
  const currentHash = sha(fs.readFileSync(path.join(proof.dependencyPath, '.package-lock.json')));
  assert.equal(currentHash, proof.installedLockSha256);
  installed[label] = { capturedInstalledLockSha256: proof.installedLockSha256, currentInstalledLockSha256: currentHash,
    checkedPackages: proof.checkedPackages, requiredVersionMismatches: proof.requiredVersionMismatches };
}
const proof = { capturedAtUtc: new Date().toISOString(), result: 'PASS_EQUIVALENT_FRONTEND_INPUTS_NOT_FRESH_DONOR_EXECUTION',
  qualifiedCommit: BASE, donorCommit: DONOR, previousDonorCommit: PREVIOUS_DONOR, outputRoot: OUTPUT_ROOT, outputRootHeadAtCapture: DONOR, headAtCapture: str('rev-parse', 'HEAD'), nodeVersion: process.version,
  nodePlatform: process.platform, nodeArchitecture: process.arch, sourceGroups: groups, directBackendImports: direct,
  parserErrors: parseErrors, reviewedDynamicImports: dynamic, conservativeBackendHelperComparison: helpers,
  packageInputs: locks, installedDependencyProof: installed, changedDonorRuntimePaths: changed, excludedAuditPathCount: auditPaths.length, excludedAuditPathManifestSha256: sha(Buffer.from(auditPaths.join('\n'))), newDeltaFromPreviousDonor: { runtimePaths: deltaRuntimePaths, excludedAuditPathCount: deltaAuditPaths.length, excludedAuditPathManifestSha256: sha(Buffer.from(deltaAuditPaths.join('\n'))), backendQualification: 'New two-path QA guard behavior requires the parent fresh backend agent gate; no frontend carry proves that behavior.' }, originalQualificationReceipts: receipts,
  compileInputProvenance: { frozenSourceArchiveSha256: compileReceipt.archiveSha256,
    originalCracoSha256: compileReceipt.originalCracoSha256,
    temporaryCacheWrapperSha256: compileReceipt.temporaryCacheWrapperSha256,
    publicEnvironment: compileReceipt.publicEnvironment, resourceCap: compileReceipt.resourceCap,
    network: compileReceipt.network, noEnvFiles: compileReceipt.noEnvFiles,
    pdfWorkerPackageVersion: JSON.parse(fs.readFileSync(path.join(DEPS, 'pdfjs-dist/package.json'))).version,
    copiedPdfWorkerSha256: workerSha256,
    note: 'These are the exact successful9dd compiler inputs/settings. Source and locked toolchain equivalence carries frontend-input qualification only; no6a3bd299 compiler invocation occurred.' },
  scope: 'The actual frontend/test/script trees, imported backend Word helper superset, package inputs and installed toolchain are byte-equivalent. The existing successful frontend suite/compile receipts remain bound to9dd, and their frontend-input qualification may be carried to6a3bd299. No tests/compile were rerun on6a3bd299.',
  limitations: 'Not backend qualification of the new two-path QA guard or earlier notification/runtime/email paths; parent fresh backend tests remain required. Not HTTP integration, provider behavior, browser, tenant/runtime/configuration or deployment acceptance. The parent owns fresh backend and tenant gates. No HEAD, source, branch or live state changed.' };
fs.writeFileSync(path.join(OUT, 'input-equivalence-6a3bd299.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ result: proof.result, qualifiedCommit: BASE, donorCommit: DONOR, sourceGroups: groups,
  directBackendImports: direct.length, conservativeHelperFiles: helpers.length, donorChangedBackendPaths: changed.length, newBackendGuardPaths: deltaRuntimePaths }));
