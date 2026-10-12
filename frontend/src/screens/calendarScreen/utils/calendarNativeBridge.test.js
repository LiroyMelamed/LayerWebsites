import { calendarNativeCapabilities, saveEventToDeviceCalendar } from './calendarNativeBridge';
afterEach(() => { delete window.ReactNativeWebView; delete window.__LW_NATIVE_CALENDAR__; });
test('ordinary browsers and hosts without advertised capability cannot save device events', () => {
    window.__LW_NATIVE_CALENDAR__ = { saveToDevice: true };
    expect(calendarNativeCapabilities()).toEqual({});
    expect(saveEventToDeviceCalendar(41)).toBe(false);
    window.ReactNativeWebView = { postMessage: jest.fn() };
    delete window.__LW_NATIVE_CALENDAR__;
    expect(saveEventToDeviceCalendar(41)).toBe(false);
    expect(window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
});
test('native host gets only an exact numeric event identity for independent authorized lookup', () => {
    window.ReactNativeWebView = { postMessage: jest.fn() };
    window.__LW_NATIVE_CALENDAR__ = { saveToDevice: true, footerManaged: true };
    expect(saveEventToDeviceCalendar(9401)).toBe(true);
    expect(window.ReactNativeWebView.postMessage).toHaveBeenCalledWith('{"type":"CALENDAR_SAVE_DEVICE","payload":{"eventId":"9401"}}');
    for (const value of ['1/../2', 'abc', null, 0, '1?token=secret']) expect(saveEventToDeviceCalendar(value)).toBe(false);
    expect(window.ReactNativeWebView.postMessage).toHaveBeenCalledTimes(1);
});
