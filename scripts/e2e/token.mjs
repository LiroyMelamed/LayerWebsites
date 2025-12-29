import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadDotEnvIfPresent, requireEnv, getEnvInt } from './env.mjs';

function repoRootFromHere() {
  // scripts/e2e/token.mjs -> repo root is ../..
  return path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
}

function normalizeBaseUrl(u) {
  return String(u || '').replace(/\/+$/, '');
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestOtp({ baseUrl, phoneNumber, timeoutMs }) {
  return fetchWithTimeout(
    `${baseUrl}/Auth/RequestOtp`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    },
    timeoutMs
  );
}

async function verifyOtp({ baseUrl, phoneNumber, otp, timeoutMs }) {
  return fetchWithTimeout(
    `${baseUrl}/Auth/VerifyOtp`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, otp }),
    },
    timeoutMs
  );
}

export async function getJwtToken({ baseUrl, phoneNumber, otp, timeoutMs = 10000 }) {
  const r1 = await requestOtp({ baseUrl, phoneNumber, timeoutMs });
  if (!r1.ok) {
    const t = await r1.text();
    throw new Error(`RequestOtp failed: ${r1.status} ${t}`);
  }

  const r2 = await verifyOtp({ baseUrl, phoneNumber, otp, timeoutMs });
  const t2 = await r2.text();
  if (!r2.ok) {
    throw new Error(`VerifyOtp failed: ${r2.status} ${t2}`);
  }

  let json;
  try {
    json = JSON.parse(t2);
  } catch {
    throw new Error(`VerifyOtp returned non-JSON: ${t2}`);
  }

  if (!json?.token) throw new Error('VerifyOtp response missing token');
  return json.token;
}

async function main() {
  const repoRoot = repoRootFromHere();
  loadDotEnvIfPresent({ repoRoot });

  const baseUrl = normalizeBaseUrl(requireEnv('E2E_API_BASE_URL'));
  const timeoutMs = getEnvInt('E2E_TIMEOUT_MS', 10000);
  const mode = (process.argv[2] || '').toLowerCase();

  let phone;
  let otp;
  if (mode === 'admin') {
    phone = requireEnv('E2E_ADMIN_PHONE');
    otp = requireEnv('E2E_ADMIN_OTP');
  } else if (mode === 'user') {
    phone = requireEnv('E2E_USER_PHONE');
    otp = requireEnv('E2E_USER_OTP');
  } else {
    throw new Error('Usage: node scripts/e2e/token.mjs admin|user');
  }

  // Intentionally prints the JWT to stdout (required).
  // Do not log phone/otp.
  const token = await getJwtToken({ baseUrl, phoneNumber: phone, otp, timeoutMs });
  process.stdout.write(token);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
