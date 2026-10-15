/**
 * Thin adapter so any module can push feedback through the global toast host.
 */
import {
    toastError,
    toastSuccess,
    toastWarning,
    toastInfo,
} from './toast';

/**
 * @param {{ type?: 'error'|'success'|'warning'|'info', text?: string } | string | null | undefined} msg
 */
export function showAppToast(msg) {
    if (msg == null || msg === false) return;
    if (typeof msg === 'string') {
        const text = msg.trim();
        if (text) toastInfo(text);
        return;
    }
    const text = String(msg.text || msg.title || msg.message || '').trim();
    if (!text) return;
    const type = String(msg.type || 'info').toLowerCase();
    if (type === 'error') toastError(text);
    else if (type === 'success') toastSuccess(text);
    else if (type === 'warning') toastWarning(text);
    else toastInfo(text);
}

export function toastFromApiError(err, fallback = 'שגיאה') {
    const text = String(
        err?.response?.data?.message
        || err?.data?.message
        || err?.message
        || fallback
    ).trim() || fallback;
    toastError(text);
    return text;
}
