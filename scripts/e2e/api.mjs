import { sanitizeJson, sanitizeText } from './redact.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function joinUrl(base, path) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

export function createApiClient({ baseUrl, token, timeoutMs = 10000 }) {
  async function request(method, path, { body, headers, retries } = {}) {
    const url = joinUrl(baseUrl, path);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const started = Date.now();
    const safeGet = method.toUpperCase() === 'GET';
    const maxRetries = safeGet ? (retries ?? 1) : 0;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : null),
            ...(body ? { 'Content-Type': 'application/json' } : null),
            ...(headers || null),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        const text = await res.text();
        let json;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        const durationMs = Date.now() - started;

        return {
          ok: res.ok,
          status: res.status,
          durationMs,
          url: sanitizeText(url),
          method,
          path,
          responseTextSnippet: sanitizeText(text).slice(0, 1200),
          responseJson: json ? sanitizeJson(json) : null,
        };
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await sleep(250 * (attempt + 1));
          continue;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    const durationMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      durationMs,
      url: sanitizeText(url),
      method,
      path,
      error: sanitizeText(lastError?.message || String(lastError)),
    };
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    put: (path, body, opts) => request('PUT', path, { ...opts, body }),
    del: (path, opts) => request('DELETE', path, opts),
  };
}
