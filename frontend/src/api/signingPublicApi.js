import { signingRequest } from './signingTemplatesApi';

const root = 'signing-v2/public';
const STORE = 'lw-signing-v2-grant';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

// The link carries its token in the fragment so it never reaches server logs or
// referrers. It moves to this tab's session storage and leaves the address bar.
export function readGrantToken() {
    const fromLink = String(window.location.hash || '').slice(1);
    if (TOKEN.test(fromLink)) {
        try { window.sessionStorage.setItem(STORE, fromLink); } catch { /* private mode keeps the token in memory only */ }
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
        return fromLink;
    }
    try { return window.sessionStorage.getItem(STORE) || ''; } catch { return ''; }
}

const as = (token, config = {}) => ({ ...config, headers: { ...(config.headers || {}), 'X-Signing-Grant': token } });

const signingPublicApi = {
    describe: token => signingRequest('get', `${root}/package`, null, as(token)),
    document: (token, documentId) => signingRequest('get', `${root}/documents/${documentId}`, null, as(token, { responseType: 'blob' })),
    evidence: (token, packageId) => signingRequest('get', `${root}/packages/${packageId}/evidence`, null, as(token, { responseType: 'blob' })),
    issue: (token, body, idempotencyKey) => signingRequest('post', `${root}/issues`, body, as(token, { headers: { 'Idempotency-Key': idempotencyKey } })),
    session: (token, body) => signingRequest('post', `${root}/sessions`, body, as(token)),
    challenge: (token, sessionId, channel) => signingRequest('post', `${root}/sessions/${sessionId}/challenge`, channel ? { channel } : {}, as(token)),
    verify: (token, sessionId, code) => signingRequest('post', `${root}/sessions/${sessionId}/verify`, { code }, as(token)),
    accept: (token, sessionId, body, idempotencyKey) => signingRequest('post', `${root}/sessions/${sessionId}/accept`, body,
        as(token, { headers: { 'Idempotency-Key': idempotencyKey } })),
};

export default signingPublicApi;
