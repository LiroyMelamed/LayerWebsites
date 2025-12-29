import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadDotEnvIfPresent, requireEnv, getEnvInt } from './env.mjs';
import { createApiClient } from './api.mjs';
import { sanitizeJson } from './redact.mjs';

import * as dashboard from './checks/dashboard.mjs';
import * as whatsapp from './checks/cases.whatsapp.mjs';
import * as notifications from './checks/notifications.mjs';
import * as signing from './checks/signing.mjs';

function repoRootFromHere() {
  // scripts/e2e/run.mjs -> repo root is ../..
  return path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function makeRunPrefix(now = new Date()) {
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mm = pad2(now.getMinutes());
  return `e2e-${y}${m}${d}-${hh}${mm}-`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function formatRow({ name, status, httpCode, notes }) {
  const s = String(status).padEnd(6);
  const c = String(httpCode ?? '').padEnd(4);
  const n = String(name).padEnd(34);
  const note = String(notes || '').slice(0, 80);
  return `${n} | ${s} | ${c} | ${note}`;
}

async function fetchJsonWithTimeout(url, { method, body, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      responseTextSnippet: String(text || '').slice(0, 1200),
      responseJson: json,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getTokenWithEvidence({ baseUrl, phoneNumber, otp, timeoutMs }) {
  const requestOtp = await fetchJsonWithTimeout(`${baseUrl}/Auth/RequestOtp`, {
    method: 'POST',
    body: { phoneNumber },
    timeoutMs,
  });

  const verifyOtp = await fetchJsonWithTimeout(`${baseUrl}/Auth/VerifyOtp`, {
    method: 'POST',
    body: { phoneNumber, otp },
    timeoutMs,
  });

  const token = verifyOtp?.responseJson?.token;
  const evidence = {
    requestOtp: {
      ok: requestOtp.ok,
      status: requestOtp.status,
      responseTextSnippet: requestOtp.responseTextSnippet,
      responseJson: requestOtp.responseJson,
    },
    verifyOtp: {
      ok: verifyOtp.ok,
      status: verifyOtp.status,
      tokenPresent: Boolean(token),
      role: verifyOtp?.responseJson?.role,
      message: verifyOtp?.responseJson?.message,
    },
  };

  if (!token) {
    const err = new Error('VerifyOtp response missing token');
    err.evidence = evidence;
    throw err;
  }

  return { token, evidence };
}

async function main() {
  const repoRoot = repoRootFromHere();
  loadDotEnvIfPresent({ repoRoot });

  const baseUrl = String(requireEnv('E2E_API_BASE_URL')).replace(/\/+$/, '');
  const timeoutMs = getEnvInt('E2E_TIMEOUT_MS', 10000);

  const runPrefix = makeRunPrefix(new Date());
  const outRoot = process.env.E2E_OUT_DIR
    ? path.resolve(repoRoot, process.env.E2E_OUT_DIR)
    : path.join(repoRoot, 'scripts', 'e2e', 'out');

  const outDir = path.join(outRoot, runPrefix);
  ensureDir(outDir);

  const adminPhone = requireEnv('E2E_ADMIN_PHONE');
  const adminOtp = requireEnv('E2E_ADMIN_OTP');
  const userPhone = requireEnv('E2E_USER_PHONE');
  const userOtp = requireEnv('E2E_USER_OTP');

  // Acquire tokens once per run; do not log them.
  const authEvidence = {};
  const adminAuth = await getTokenWithEvidence({ baseUrl, phoneNumber: adminPhone, otp: adminOtp, timeoutMs });
  authEvidence.admin = adminAuth.evidence;
  const userAuth = await getTokenWithEvidence({ baseUrl, phoneNumber: userPhone, otp: userOtp, timeoutMs });
  authEvidence.user = userAuth.evidence;

  // Write auth evidence WITHOUT tokens
  writeJson(path.join(outDir, 'auth.json'), sanitizeJson({ baseUrl, runPrefix, auth: authEvidence }));

  const adminToken = adminAuth.token;
  const userToken = userAuth.token;

  const adminApi = createApiClient({ baseUrl, token: adminToken, timeoutMs });
  const userApi = createApiClient({ baseUrl, token: userToken, timeoutMs });

  const ctx = {
    baseUrl,
    prefix: runPrefix,
    outDir,
    adminApi,
    userApi,
  };

  const checks = [dashboard, whatsapp, notifications, signing];

  const allRows = [];
  const perCheck = [];

  for (const check of checks) {
    const started = Date.now();
    let out;
    try {
      out = await check.run(ctx);
    } catch (err) {
      out = {
        name: check.name || 'unknown',
        results: [
          {
            check: `${check.name || 'unknown'}.exception`,
            status: 'FAIL',
            httpCode: 0,
            notes: err?.message || String(err),
            evidence: {},
          },
        ],
      };
    }

    const durationMs = Date.now() - started;
    const checkFile = path.join(outDir, `${out.name}.json`);

    // Sanitize before writing
    writeJson(checkFile, sanitizeJson({ ...out, durationMs }));

    perCheck.push({ name: out.name, file: path.relative(repoRoot, checkFile).replace(/\\/g, '/') });

    for (const r of out.results || []) {
      allRows.push({
        name: r.check,
        status: r.status,
        httpCode: r.httpCode,
        notes: r.notes,
        check: out.name,
      });
    }
  }

  const failed = allRows.filter((r) => r.status === 'FAIL');

  const summary = {
    runPrefix,
    baseUrl,
    outDir: path.relative(repoRoot, outDir).replace(/\\/g, '/'),
    startedAt: new Date().toISOString(),
    totals: {
      pass: allRows.filter((r) => r.status === 'PASS').length,
      fail: failed.length,
      total: allRows.length,
    },
    checks: perCheck,
    results: allRows,
  };

  writeJson(path.join(outDir, 'summary.json'), summary);

  // Print compact summary
  console.log(`Run: ${runPrefix}`);
  console.log(`Base: ${baseUrl}`);
  console.log(`Out : ${summary.outDir}`);
  console.log('');
  console.log('check                              | status | code | notes');
  console.log('--------------------------------------------------------------------------');
  for (const r of allRows) {
    console.log(formatRow(r));
  }
  console.log('--------------------------------------------------------------------------');
  console.log(`PASS=${summary.totals.pass} FAIL=${summary.totals.fail} TOTAL=${summary.totals.total}`);

  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
