#!/usr/bin/env node
/**
 * Signing speed benchmark (public API).
 *
 * Usage:
 *   node backend/scripts/bench-public-signing.js --base https://api-ashrafessa.mela-media.co.il/api --token '<JWT>'
 *
 * Measures:
 *  - details fetch
 *  - single /sign (with tiny PNG)
 *  - /sign-batch for N remaining signature spots (dry-run unless --commit)
 *
 * Default is dry-run for sign endpoints (uses OPTIONS/HEAD probes + payload size estimate)
 * unless --commit is passed (WILL actually sign!).
 */
/* eslint-disable no-console */
const axios = require('axios');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function tinyPngDataUrl() {
  // 1x1 transparent PNG
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  return `data:image/png;base64,${b64}`;
}

function midJpegDataUrl() {
  // ~2KB JPEG-ish placeholder (still tiny vs real signature capture)
  const b64 = Buffer.alloc(1800, 1).toString('base64');
  return `data:image/jpeg;base64,${b64}`;
}

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    console.log(`✓ ${label}: ${ms}ms`);
    return { ok: true, ms, result };
  } catch (err) {
    const ms = Date.now() - t0;
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.log(`✗ ${label}: ${ms}ms status=${status || '-'} msg=${data?.message || err.message}`);
    return { ok: false, ms, status, data, err };
  }
}

async function main() {
  const base = String(arg('base', 'https://api-ashrafessa.mela-media.co.il/api')).replace(/\/$/, '');
  const token = arg('token');
  const commit = hasFlag('commit');
  if (!token) {
    console.error('Missing --token <public signing JWT>');
    process.exit(1);
  }

  const sessionId = '00000000-0000-4000-8000-000000000099';
  const client = axios.create({
    baseURL: base,
    timeout: 180000,
    headers: { 'x-signing-session-id': sessionId },
  });

  console.log(`Base: ${base}`);
  console.log(`Commit signs: ${commit ? 'YES' : 'no (probe only)'}`);

  const details = await timed('GET details', () =>
    client.get(`/SigningFiles/public/${encodeURIComponent(token)}`)
  );
  if (!details.ok) process.exit(2);

  const spots = (details.result.data?.signatureSpots || []).filter((s) => {
    const t = String(s.FieldType || s.fieldType || 'signature').toLowerCase();
    return t === 'signature' && !s.IsSigned;
  });
  console.log(`Unsigned signature spots: ${spots.length}`);

  await timed('GET pdf (first bytes)', async () => {
    const res = await client.get(`/SigningFiles/public/${encodeURIComponent(token)}/pdf`, {
      responseType: 'arraybuffer',
      headers: { Range: 'bytes=0-65535' },
      validateStatus: (s) => s === 200 || s === 206,
    });
    return { bytes: res.data?.byteLength || 0 };
  });

  const tiny = tinyPngDataUrl();
  const mid = midJpegDataUrl();
  console.log(`Payload sizes: tinyPNG=${tiny.length}B midJPEG=${mid.length}B`);

  if (!commit) {
    await timed('PROBE sign-batch route', async () => {
      // Invalid body → should be 422 from our handler if route exists, 404 if missing
      try {
        await client.post(`/SigningFiles/public/${encodeURIComponent(token)}/sign-batch`, {
          signatureSpotIds: [],
          signatureImage: tiny,
          consentAccepted: true,
          consentVersion: '2026-01-11',
          signingSessionId: sessionId,
        });
      } catch (err) {
        if (err?.response?.status === 404) throw new Error('sign-batch route NOT deployed (404)');
        if (err?.response?.status === 422 || err?.response?.status === 403) {
          return { routeExists: true, status: err.response.status };
        }
        throw err;
      }
      return { routeExists: true };
    });
    console.log('\nDry-run complete. Re-run with --commit to actually sign (destructive).');
    return;
  }

  if (!spots.length) {
    console.log('Nothing to sign.');
    return;
  }

  const first = spots[0];
  await timed('POST sign (1 spot, tiny PNG)', () =>
    client.post(`/SigningFiles/public/${encodeURIComponent(token)}/sign`, {
      signatureSpotId: first.SignatureSpotId || first.signatureSpotId,
      signatureImage: tiny,
      consentAccepted: true,
      consentVersion: details.result.data?.file?.SigningPolicyVersion || '2026-01-11',
      signingSessionId: sessionId,
    })
  );

  const rest = spots.slice(1);
  if (rest.length) {
    await timed(`POST sign-batch (${rest.length} spots, mid JPEG)`, () =>
      client.post(`/SigningFiles/public/${encodeURIComponent(token)}/sign-batch`, {
        signatureSpotIds: rest.map((s) => s.SignatureSpotId || s.signatureSpotId),
        signatureImage: mid,
        consentAccepted: true,
        consentVersion: details.result.data?.file?.SigningPolicyVersion || '2026-01-11',
        signingSessionId: sessionId,
      })
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
