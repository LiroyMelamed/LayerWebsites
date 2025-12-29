function redactJwt(text) {
  return String(text || '').replace(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    '<JWT>'
  );
}

function maskEmails(text) {
  return String(text || '').replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    '<EMAIL>'
  );
}

function maskPhones(text) {
  let t = String(text || '');
  // Common Israeli mobile patterns (best-effort)
  t = t.replace(/\b0\d{8,9}\b/g, '<PHONE>');
  // E.164-ish
  t = t.replace(/\+\d{8,15}/g, '<PHONE>');
  return t;
}

export function sanitizeText(text) {
  return maskPhones(maskEmails(redactJwt(text)));
}

export function sanitizeJson(value) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) return value.map(sanitizeJson);

  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const keyLower = String(k).toLowerCase();
      const isPiiKey =
        keyLower.includes('phonenumber') ||
        keyLower === 'phone' ||
        keyLower.includes('email') ||
        keyLower.includes('address') ||
        keyLower.includes('fullname') ||
        keyLower.includes('customername') ||
        keyLower.includes('companyname') ||
        (keyLower.endsWith('name') && !keyLower.includes('filename'));

      // Preserve synthetic e2e-* identifiers that are useful as evidence
      if (isPiiKey && typeof v === 'string' && v && !v.startsWith('e2e-')) {
        out[k] = '<REDACTED>';
        continue;
      }

      if (keyLower.includes('token') || keyLower.includes('authorization')) {
        out[k] = '<REDACTED>';
        continue;
      }
      out[k] = sanitizeJson(v);
    }
    return out;
  }

  return '<REDACTED>';
}
