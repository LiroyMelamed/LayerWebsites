/* Opt-in website journey -> hashed signup intent only. No signup or payment requests are changed. */
(() => {
  'use strict';
  const products = {
    'https://lawyer.mela-media.co.il': 'layerwebsites',
    'https://barber.mela-media.co.il': 'barberbooking',
    'https://studio.mela-media.co.il': 'melamotion',
  };
  const product = products[location.origin];
  const signupRoute = () => /^\/signup(?:\/|$)/.test(location.pathname);
  if (!product || !signupRoute() || window.__melaSignupAttributionV1) return;
  window.__melaSignupAttributionV1 = true;
  const owners = ['https://mela-media.co.il', 'https://www.mela-media.co.il'];
  const sources = ['google_organic', 'search_organic', 'direct', 'referral', 'social', 'email', 'paid', 'campaign', 'internal', 'unknown'];
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const contextKey = 'mela-signup-attribution-v1';
  const receiptsKey = 'mela-signup-attribution-receipts-v1';
  const ttl = 24 * 60 * 60 * 1000;
  const pending = new Map();
  const controllers = new Set();
  let generation = 0;
  let currentIntent = null;
  let observedAt = 0;
  let returnIntent = null;
  let returnJourney = null;
  const read = key => { try { return sessionStorage.getItem(key); } catch (_) { return null; } };
  const write = (key, value) => { try { sessionStorage.setItem(key, value); } catch (_) { /* Optional measurement must not affect signup. */ } };
  const remove = key => { try { sessionStorage.removeItem(key); } catch (_) { /* Optional storage. */ } };
  const privacyBlocked = () => window.navigator?.globalPrivacyControl === true ||
    [window.navigator?.doNotTrack, window.doNotTrack].some(value => value === '1' || value === 'yes');
  function clear() {
    generation += 1;
    currentIntent = null; observedAt = 0; returnIntent = null; returnJourney = null;
    remove(contextKey); remove(receiptsKey);
    controllers.forEach(controller => controller.abort());
    controllers.clear(); pending.clear();
  }
  function context() {
    if (privacyBlocked()) {
      clear(); return null;
    }
    try {
      const saved = JSON.parse(read(contextKey) || 'null');
      const now = Date.now();
      if (saved?.version === 1 && uuid(saved.journeyId) && sources.includes(saved.source) &&
        Number.isSafeInteger(saved.createdAt) && saved.createdAt <= now &&
        saved.expiresAt === saved.createdAt + ttl && saved.expiresAt > now) return saved;
    } catch (_) { /* Invalid or unavailable context has no consent. */ }
    remove(contextKey); remove(receiptsKey);
    return null;
  }
  function saveContext(journeyId, source) {
    if (privacyBlocked()) { clear(); return; }
    if (!uuid(journeyId) || !sources.includes(source)) return;
    const previous = context();
    if (previous?.journeyId === journeyId.toLowerCase() && previous.source === source) return;
    const observed = !previous && observedAt > Date.now() - 300000 ? currentIntent : null;
    const previousObservedAt = observedAt;
    clear();
    currentIntent = observed; observedAt = observed ? previousObservedAt : 0;
    const createdAt = Date.now();
    write(contextKey, JSON.stringify({ version: 1, journeyId: journeyId.toLowerCase(), source, createdAt, expiresAt: createdAt + ttl }));
  }
  function receiptList(saved) {
    try {
      const list = JSON.parse(read(receiptsKey) || '[]');
      if (Array.isArray(list)) return list.filter(item => item && item.journeyId === saved.journeyId &&
        typeof item.intentHash === 'string' && /^[0-9a-f]{64}$/.test(item.intentHash) && item.expiresAt === saved.expiresAt).slice(-32);
    } catch (_) { /* Ignore invalid receipts. */ }
    return [];
  }
  function discoverIntent() {
    const saved = context();
    const candidate = uuid(currentIntent) && observedAt > Date.now() - 300000 ? currentIntent : saved?.journeyId === returnJourney ? returnIntent : null;
    return uuid(candidate) ? candidate.toLowerCase() : null;
  }
  function bindIntent(value) {
    if (!signupRoute() || !uuid(value)) return Promise.resolve();
    const saved = context();
    if (!saved || !window.crypto?.subtle || typeof window.crypto.randomUUID !== 'function' || typeof window.fetch !== 'function') return Promise.resolve();
    const intent = value.toLowerCase();
    const key = saved.journeyId + '|' + intent;
    if (pending.has(key)) return pending.get(key);
    const epoch = generation;
    const task = (async () => {
      try {
        const buffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode('mela-signup-v1|' + product + '|' + intent));
        const intentHash = Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
        const fresh = context();
        if (epoch !== generation || fresh?.journeyId !== saved.journeyId || receiptList(saved).some(item => item.intentHash === intentHash)) return;
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        if (controller) controllers.add(controller);
        // Keepalive begins before the signup hook resumes navigation. There is no completion claim here.
        const delivery = window.fetch('https://mela-media.co.il/api/website-events', {
          method: 'POST', credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer', keepalive: true,
          headers: { 'Content-Type': 'application/json' }, ...(controller ? { signal: controller.signal } : {}),
          body: JSON.stringify({ version: 1, eventId: window.crypto.randomUUID(), journeyId: saved.journeyId,
            productId: product, event: 'signup_intent_bound', source: saved.source, intentHash }),
        });
        // Do not wait for the network before continuing to checkout.
        Promise.resolve(delivery).then(async response => {
          if (response?.status === 409 && typeof response.json === 'function') {
            const body = await response.json();
            if (body?.error === 'JOURNEY_REVOKED' && epoch === generation) { clear(); return; }
          }
          if (response?.ok && epoch === generation && context()?.journeyId === saved.journeyId) {
            write(receiptsKey, JSON.stringify([...receiptList(saved), { journeyId: saved.journeyId, intentHash, expiresAt: saved.expiresAt }].slice(-32)));
          }
        }).catch(() => {}).finally(() => { if (controller) controllers.delete(controller); pending.delete(key); });
      } catch (_) { pending.delete(key); /* Hash/transport errors never interrupt registration. */ }
    })();
    pending.set(key, task);
    return task;
  }
  function bindDiscovered() {
    const intent = discoverIntent();
    if (intent) void bindIntent(intent);
  }
  // Only the website parent can grant or withdraw this optional context.
  window.addEventListener('message', event => {
    if (window.parent === window || event.source !== window.parent || !owners.includes(event.origin)) return;
    if (event.data?.type === 'mela-signup-attribution-clear') { clear(); return; }
    if (event.data?.type !== 'mela-signup-attribution' || !uuid(event.data.journeyId) || !sources.includes(event.data.source)) return;
    saveContext(event.data.journeyId, event.data.source); bindDiscovered();
  });
  document.addEventListener('mela-signup-intent-created', event => {
    if (!uuid(event.detail?.intentId)) return;
    currentIntent = event.detail.intentId.toLowerCase(); observedAt = Date.now();
    const task = bindIntent(event.detail.intentId);
    if (typeof event.detail.waitUntil === 'function') event.detail.waitUntil(task);
  });
  // The website adds these two fields only to a consented direct MelaMotion link.
  const previousContext = context();
  const fromQuery = new URLSearchParams(location.search).get('intentId');
  if (previousContext && uuid(fromQuery)) { returnIntent = fromQuery.toLowerCase(); returnJourney = previousContext.journeyId; }
  if (product === 'melamotion' && window.parent === window) {
    const params = new URLSearchParams(location.search);
    if (params.has('melaJourney') || params.has('melaSource')) {
      const journeyId = params.get('melaJourney'), source = params.get('melaSource');
      clear();
      if (uuid(journeyId) && sources.includes(source)) saveContext(journeyId, source);
      params.delete('melaJourney'); params.delete('melaSource');
      try { history.replaceState(history.state, '', location.pathname + (params.size ? '?' + params.toString() : '') + location.hash); } catch (_) { /* URL cleanup is optional. */ }
    }
  }
  const ready = () => {
    if (window.parent !== window) owners.forEach(origin => window.parent.postMessage({ type: 'mela-attribution-ready' }, origin));
    bindDiscovered();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true }); else ready();
  window.addEventListener('pageshow', ready);
})();
