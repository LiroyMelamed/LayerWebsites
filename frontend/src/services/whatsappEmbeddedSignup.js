let sdkPromise;
export function prepareWhatsAppSdk(config) {
    if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
        if (window.FB) return resolve(window.FB);
        const script = document.createElement('script');
        script.src = 'https://connect.facebook.net/en_US/sdk.js';
        script.async = true; script.crossOrigin = 'anonymous';
        const timeout = setTimeout(() => { sdkPromise = null; reject(new Error('META_SDK_UNAVAILABLE')); }, 15000);
        script.onload = () => { clearTimeout(timeout); if (window.FB) resolve(window.FB); else { sdkPromise = null; reject(new Error('META_SDK_UNAVAILABLE')); } };
        script.onerror = () => { clearTimeout(timeout); sdkPromise = null; reject(new Error('META_SDK_UNAVAILABLE')); };
        document.head.appendChild(script);
    });
    return sdkPromise.then(FB => { FB.init({ appId: config.appId, version: config.version, autoLogAppEvents: false, xfbml: false }); return FB; });
}
export function isMetaOrigin(origin) {
    try { const url = new URL(origin); return url.protocol === 'https:' && !url.port && (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com')); } catch { return false; }
}
// Called synchronously from a click after SDK + server nonce preparation, so popup
// blockers do not intercept the login window. Both callback orders are supported.
export function launchWhatsAppSignup(config, { onComplete, onError }) {
    let code, assets, done = false;
    const cleanup = () => { done = true; clearTimeout(timeout); window.removeEventListener('message', listener); };
    const finish = () => {
        if (!done && code && assets) { cleanup(); onComplete({ state: config.state, code, ...assets }); }
    };
    const listener = event => {
        if (done || !isMetaOrigin(event.origin)) return;
        let data;
        try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        const businessApp = config.flow === 'business_app' && data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';
        const phoneId = data.data?.phone_number_id;
        if ((data.event === 'FINISH' || businessApp) && /^\d{5,30}$/.test(String(data.data?.waba_id)) &&
            (/^\d{5,30}$/.test(String(phoneId)) || (businessApp && !phoneId))) {
            assets = { wabaId: String(data.data.waba_id), ...(phoneId ? { phoneId: String(phoneId) } : {}) }; finish();
        } else if (['CANCEL', 'ERROR'].includes(data.event)) { cleanup(); onError(); }
    };
    const timeout = setTimeout(() => { if (!done) { cleanup(); onError(); } }, 180000);
    window.addEventListener('message', listener);
    try {
        window.FB.login(response => {
            if (done) return;
            if (!response.authResponse?.code) { cleanup(); onError(); return; }
            code = response.authResponse.code; finish();
        }, { config_id: config.configId, response_type: 'code', override_default_response_type: true,
            extras: { setup: {}, version: 'v4', sessionInfoVersion: '3', ...(config.flow === 'business_app' ? { featureType: 'whatsapp_business_app_onboarding' } : {}) } });
    } catch { cleanup(); onError(); }
    return cleanup;
}
