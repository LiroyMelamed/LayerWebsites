// Optional measurement must never block account creation or alter payment requests.
export function bindSignupAttribution(intentId) {
  return new Promise(resolve => {
    const tasks = [];
    try {
      document.dispatchEvent(new CustomEvent('mela-signup-intent-created', {
        detail: { intentId, waitUntil: task => tasks.push(Promise.resolve(task)) },
      }));
    } catch (_) { resolve(); return; }
    if (!tasks.length) { resolve(); return; }
    const timer = setTimeout(resolve, 350);
    Promise.allSettled(tasks).then(() => { clearTimeout(timer); resolve(); });
  });
}
