/* Embedded signup: one page scroll and the company's display controls. No account/session changes. */
(() => {
  'use strict';
  if (window.parent === window || !/^\/signup(?:\/|$)/.test(location.pathname) || new URLSearchParams(location.search).get('embed') !== '1') return;
  const owners = ['https://mela-media.co.il', 'https://www.mela-media.co.il'];
  const root = document.documentElement;
  let active = false, disposed = false, lastHeight = 0, scheduled = false, frameId = 0, lastPreferences = null, previousWidget = null, baseSize = 16;
  let resizeObserver, mutationObserver;
  const publish = data => owners.forEach(origin => window.parent.postMessage(data, origin));
  function hideDuplicate() {
    const widget = document.getElementById('mela-accessibility-tools');
    if (widget) widget.hidden = true;
    if (widget && widget !== previousWidget) {
      previousWidget = widget;
      if (lastPreferences) apply(lastPreferences);
    }
  }
  function measure() {
    scheduled = false;
    if (disposed || !active || !document.body) return;
    hideDuplicate();
    const height = Math.max(320, Math.ceil(document.body.getBoundingClientRect().height), document.body.scrollHeight);
    if (height <= 16000 && Math.abs(height - lastHeight) > 1) {
      lastHeight = height;
      publish({ type: 'mela-signup-height', height });
    }
  }
  function schedule() {
    if (!disposed && !scheduled) { scheduled = true; frameId = requestAnimationFrame(measure); }
  }
  function activate() {
    if (active || !document.body) return;
    active = true;
    const original = root.style.fontSize;
    root.style.fontSize = '';
    baseSize = parseFloat(getComputedStyle(root).fontSize) || 16;
    root.style.fontSize = original;
    root.setAttribute('data-mela-signup-embed', 'true');
    const style = document.createElement('style');
    style.id = 'mela-signup-embed-layout';
    style.textContent = `
      html[data-mela-signup-embed],html[data-mela-signup-embed] body {height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;}
      html[data-mela-signup-embed] #mela-accessibility-tools {display:none!important;}
      html[data-mela-signup-embed] :is(.app-shell,.app-main,.lw-loginSimpleScreen,.lw-loginSimpleScreen__layout,.lw-loginSimpleScreen__main,.lw-loginSimpleScreen__content) {height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;}
      html[data-mela-signup-embed] .app-main {padding:0;width:100%;}
      html[data-mela-signup-embed] :is(.min-h-screen,.min-h-dvh) {min-height:0!important;}
    `;
    document.head.append(style);
    resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.body);
    mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    document.fonts?.ready.then(schedule);
  }
  function apply(data) {
    if (!active) return;
    lastPreferences = data;
    const size = [100, 125, 150, 175, 200].includes(data.size) ? data.size : 100;
    const links = data.links === true, motion = data.motion === true || matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.style.fontSize = `${baseSize * size / 100}px`;
    root.toggleAttribute('data-mela-a11y-links', links);
    root.toggleAttribute('data-mela-a11y-motion', motion);
    for (const [name, enabled] of [['large', size >= 150], ['links', links], ['motion', motion]]) {
      if (enabled) root.setAttribute('data-a11y-' + name, 'true'); else root.removeAttribute('data-a11y-' + name);
    }
    document.dispatchEvent(new CustomEvent('mela-a11y-change', { detail: { size, links, motion } }));
    schedule();
  }
  window.addEventListener('message', event => {
    if (disposed || event.source !== window.parent || !owners.includes(event.origin) || event.data?.type !== 'mela-signup-display') return;
    activate(); apply(event.data);
  });
  const ready = () => { if (!disposed) publish({ type: 'mela-signup-ready' }); };
  window.addEventListener('pagehide', () => {
    disposed = true; active = false;
    cancelAnimationFrame(frameId);
    resizeObserver?.disconnect(); mutationObserver?.disconnect();
    window.removeEventListener('resize', schedule);
  }, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true }); else ready();
})();
