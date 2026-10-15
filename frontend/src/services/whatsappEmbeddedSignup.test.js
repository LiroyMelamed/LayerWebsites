import { isMetaOrigin, launchWhatsAppSignup, prepareWhatsAppSdk } from './whatsappEmbeddedSignup';

const config = { appId: '123456', configId: '654321', version: 'v25.0', state: 'server-nonce' };
const finish = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '123456789', phone_number_id: '987654321' } };
const message = (data, origin = 'https://www.facebook.com') => window.dispatchEvent(new MessageEvent('message', { origin, data: JSON.stringify(data) }));
beforeEach(() => { jest.useFakeTimers(); window.FB = { init: jest.fn(), login: jest.fn() }; });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); delete window.FB; });

test('accepts only HTTPS Meta origins, not lookalikes or nonstandard ports', () => {
    expect(isMetaOrigin('https://www.facebook.com')).toBe(true);
    for (const origin of ['https://facebook.com.evil.example', 'http://facebook.com', 'https://facebook.com:444', 'null']) expect(isMetaOrigin(origin)).toBe(false);
});
test.each(['code-first', 'assets-first'])('signup handles %s, refuses untrusted messages and completes once', async order => {
    await prepareWhatsAppSdk(config);
    const onComplete = jest.fn(), onError = jest.fn();
    const cleanup = launchWhatsAppSignup(config, { onComplete, onError });
    expect(window.FB.login).toHaveBeenCalledTimes(1);
    const callback = window.FB.login.mock.calls[0][0];
    const code = () => callback({ authResponse: { code: 'one-use-code' } });
    message(finish, 'https://facebook.com.evil.example');
    if (order === 'code-first') { code(); expect(onComplete).not.toHaveBeenCalled(); message(finish); }
    else { message(finish); expect(onComplete).not.toHaveBeenCalled(); code(); }
    expect(onComplete).toHaveBeenCalledWith({ state: config.state, code: 'one-use-code', wabaId: '123456789', phoneId: '987654321' });
    message(finish); code(); jest.advanceTimersByTime(180000);
    expect(onComplete).toHaveBeenCalledTimes(1); expect(onError).not.toHaveBeenCalled(); cleanup();
});
test('cancel, timeout and unmount clean up without completing a late login', () => {
    const onComplete = jest.fn(), onError = jest.fn();
    launchWhatsAppSignup(config, { onComplete, onError });
    message({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL' });
    window.FB.login.mock.calls[0][0]({ authResponse: { code: 'late-code' } }); message(finish);
    expect(onError).toHaveBeenCalledTimes(1); expect(onComplete).not.toHaveBeenCalled();
    const cleanup = launchWhatsAppSignup(config, { onComplete, onError }); cleanup();
    message(finish); jest.advanceTimersByTime(180000); expect(onError).toHaveBeenCalledTimes(1);
    launchWhatsAppSignup(config, { onComplete, onError }); jest.advanceTimersByTime(180000);
    expect(onError).toHaveBeenCalledTimes(2);
});
test('QR uses signup v4 and accepts the coexistence completion without an invented phone ID', () => {
    const onComplete = jest.fn(), onError = jest.fn();
    launchWhatsAppSignup({ ...config, flow: 'business_app' }, { onComplete, onError });
    const [callback, options] = window.FB.login.mock.calls[0];
    expect(options.extras).toMatchObject({ version: 'v4', sessionInfoVersion: '3', featureType: 'whatsapp_business_app_onboarding' });
    message({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: { waba_id: '123456789' } });
    callback({ authResponse: { code: 'synthetic-code' } });
    expect(onComplete).toHaveBeenCalledWith({ state: config.state, code: 'synthetic-code', wabaId: '123456789' });
    expect(onError).not.toHaveBeenCalled();
});
