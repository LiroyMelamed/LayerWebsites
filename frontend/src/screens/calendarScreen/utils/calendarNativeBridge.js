/** Capabilities are advertised by the installed native host, never by an invite. */
export function calendarNativeCapabilities() {
    const bridge = typeof window !== 'undefined' && window.ReactNativeWebView;
    const capabilities = typeof window !== 'undefined' && window.__LW_NATIVE_CALENDAR__;
    return bridge?.postMessage && capabilities ? capabilities : {};
}

export function saveEventToDeviceCalendar(eventId) {
    const id = String(eventId || '');
    if (!/^\d+$/.test(id) || !calendarNativeCapabilities().saveToDevice) return false;
    // Native independently fetches the permitted event. No personal data or
    // authentication token is embedded in the bridge message.
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CALENDAR_SAVE_DEVICE', payload: { eventId: id } }));
    return true;
}
