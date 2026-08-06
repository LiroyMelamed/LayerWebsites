const crypto = require('crypto');

const consumed = new Map();

function serviceKey() {
  return process.env.CENTRAL_SERVICE_KEY?.trim() || 'dev-central-service-key-change-me';
}

function fromB64url(s) {
  return Buffer.from(s, 'base64url');
}

/**
 * Verify HMAC handoff minted by central-platform and consume jti once.
 * @returns {{ v:1, productId:string, to:string, jti:string, exp:number } | null}
 */
function verifyAndConsumeCentralHandoff(token, expectedProductId) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [body, sigB64] = parts;
  if (!body || !sigB64) return null;

  const expected = crypto.createHmac('sha256', serviceKey()).update(body).digest();
  let got;
  try {
    got = fromB64url(sigB64);
  } catch {
    return null;
  }
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || payload.v !== 1) return null;
  if (payload.productId !== expectedProductId) return null;
  if (!payload.jti || !Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;

  const now = Date.now();
  for (const [k, e] of consumed) {
    if (e < now) consumed.delete(k);
  }
  if (consumed.has(payload.jti)) return null;
  consumed.set(payload.jti, payload.exp);
  return payload;
}

module.exports = { verifyAndConsumeCentralHandoff };
