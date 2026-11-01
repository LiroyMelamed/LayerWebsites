import { bindSignupAttribution } from './signupAttribution';

const INTENT = '8f71a44b-8d85-4f63-8d73-1f46818cc402';
const EVENT = 'mela-signup-intent-created';
let listener;

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => {
    if (listener) document.removeEventListener(EVENT, listener);
    listener = null;
    jest.restoreAllMocks();
    jest.useRealTimers();
});

test('no optional runtime listener resolves immediately without a timer or network', async () => {
    const dispatch = jest.spyOn(document, 'dispatchEvent');
    await expect(bindSignupAttribution(INTENT)).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
    const event = dispatch.mock.calls[0][0];
    expect(event.type).toBe(EVENT);
    expect(Object.keys(event.detail).sort()).toEqual(['intentId', 'waitUntil']);
    expect(event.detail.intentId).toBe(INTENT);
});

test('a failed DOM dispatch is optional and does not reject the signup flow', async () => {
    jest.spyOn(document, 'dispatchEvent').mockImplementationOnce(() => { throw new Error('synthetic dispatch failure'); });
    await expect(bindSignupAttribution(INTENT)).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
});

test.each(['resolved', 'rejected'])('%s runtime tasks release the bridge and clear its deadline', async mode => {
    listener = event => event.detail.waitUntil(mode === 'resolved' ? Promise.resolve() : Promise.reject(new Error('synthetic analytics failure')));
    document.addEventListener(EVENT, listener);
    await expect(bindSignupAttribution(INTENT)).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
});

test('a stalled runtime never holds checkout beyond the 350 ms deadline', async () => {
    listener = event => event.detail.waitUntil(new Promise(() => {}));
    document.addEventListener(EVENT, listener);
    const released = jest.fn();
    const task = bindSignupAttribution(INTENT).then(released);
    jest.advanceTimersByTime(349);
    await Promise.resolve();
    expect(released).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await task;
    expect(released).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
});
