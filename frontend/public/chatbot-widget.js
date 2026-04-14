/**
 * MorLevy Chatbot Floating Widget
 * Drop this script into any website to add a floating chat button
 * that opens the chatbot in a popup iframe.
 *
 * Usage:  <script src="https://morlevy.mela-media.co.il/chatbot-widget.js"></script>
 */
(function () {
    if (document.getElementById('mlw-chat-widget')) return;

    var CHAT_URL = 'https://morlevy.mela-media.co.il/ChatBot';

    // ── Styles ──
    var style = document.createElement('style');
    style.textContent = [
        '#mlw-chat-widget-btn {',
        '  position: fixed;',
        '  bottom: 160px;',
        '  left: 24px;',
        '  width: 52px;',
        '  height: 52px;',
        '  border-radius: 50%;',
        '  background: #1a3a5c;',
        '  color: #fff;',
        '  border: none;',
        '  cursor: pointer;',
        '  box-shadow: 0 4px 16px rgba(0,0,0,0.25);',
        '  z-index: 999999;',
        '  display: flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  transition: transform 0.2s, box-shadow 0.2s;',
        '  padding: 0;',
        '}',
        '#mlw-chat-widget-btn:hover {',
        '  transform: scale(1.08);',
        '  box-shadow: 0 6px 24px rgba(0,0,0,0.35);',
        '}',
        '#mlw-chat-widget-btn svg { width: 28px; height: 28px; fill: #fff; }',
        '',
        '#mlw-chat-widget-frame-wrap {',
        '  position: fixed;',
        '  bottom: 220px;',
        '  left: 24px;',
        '  width: 380px;',
        '  height: 560px;',
        '  max-height: calc(100dvh - 120px);',
        '  max-width: calc(100vw - 32px);',
        '  border-radius: 16px;',
        '  overflow: hidden;',
        '  box-shadow: 0 8px 32px rgba(0,0,0,0.3);',
        '  z-index: 999998;',
        '  display: none;',
        '  flex-direction: column;',
        '  background: #fff;',
        '}',
        '#mlw-chat-widget-frame-wrap.mlw-open { display: flex; }',
        '',
        '#mlw-chat-widget-iframe {',
        '  width: 100%;',
        '  height: 100%;',
        '  border: none;',
        '}',
        '',
        '#mlw-chat-widget-backdrop {',
        '  position: fixed;',
        '  inset: 0;',
        '  background: rgba(0,0,0,0.5);',
        '  z-index: 2147483640;',
        '  display: none;',
        '}',
        '#mlw-chat-widget-backdrop.mlw-open { display: block; }',
        '',
        '@media (max-width: 480px) {',
        '  #mlw-chat-widget-frame-wrap {',
        '    bottom: 0;',
        '    left: 0;',
        '    width: 100vw;',
        '    height: 100vh;',
        '    height: 100dvh;',
        '    max-height: 100vh;',
        '    max-height: 100dvh;',
        '    max-width: 100vw;',
        '    border-radius: 0;',
        '    z-index: 2147483647;',
        '  }',
        '  #mlw-chat-widget-btn { bottom: 80px; left: 16px; width: 56px; height: 56px; z-index: 2147483646; }',
        '}',
        '@media (max-width: 768px) and (min-width: 481px) {',
        '  #mlw-chat-widget-frame-wrap {',
        '    bottom: 0;',
        '    left: 0;',
        '    width: 100vw;',
        '    height: 85vh;',
        '    height: 85dvh;',
        '    max-height: 85vh;',
        '    max-height: 85dvh;',
        '    max-width: 100vw;',
        '    border-radius: 16px 16px 0 0;',
        '    z-index: 2147483647;',
        '  }',
        '  #mlw-chat-widget-btn { bottom: 80px; left: 16px; z-index: 2147483646; }',
        '}',
    ].join('\n');
    document.head.appendChild(style);

    // ── Chat bubble icon (SVG) ──
    var chatSvg =
        '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>' +
        '</svg>';

    var closeSvg =
        '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>' +
        '</svg>';

    // ── Button ──
    var btn = document.createElement('button');
    btn.id = 'mlw-chat-widget-btn';
    btn.setAttribute('aria-label', 'פתח צ׳אט');
    btn.innerHTML = chatSvg;
    document.body.appendChild(btn);

    // ── Frame wrapper ──
    var wrap = document.createElement('div');
    wrap.id = 'mlw-chat-widget-frame-wrap';
    document.body.appendChild(wrap);

    // ── Backdrop (covers WordPress floating elements on mobile) ──
    var backdrop = document.createElement('div');
    backdrop.id = 'mlw-chat-widget-backdrop';
    document.body.appendChild(backdrop);

    var iframe = null;
    var isOpen = false;

    btn.addEventListener('click', function () {
        isOpen = !isOpen;

        if (isOpen) {
            wrap.classList.add('mlw-open');
            backdrop.classList.add('mlw-open');
            btn.innerHTML = closeSvg;

            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'mlw-chat-widget-iframe';
                iframe.src = CHAT_URL;
                iframe.title = 'צ׳אט עם משרד מלמד';
                iframe.setAttribute('allow', 'clipboard-write');
                wrap.appendChild(iframe);
            }
        } else {
            wrap.classList.remove('mlw-open');
            backdrop.classList.remove('mlw-open');
            btn.innerHTML = chatSvg;
        }
    });

    backdrop.addEventListener('click', function () {
        isOpen = false;
        wrap.classList.remove('mlw-open');
        backdrop.classList.remove('mlw-open');
        btn.innerHTML = chatSvg;
    });
})();
