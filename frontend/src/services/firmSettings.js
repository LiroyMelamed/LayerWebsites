/**
 * firmSettings  — lightweight module that fetches non-sensitive firm
 * settings (WhatsApp phone, firm name, module flags) once and caches them.
 *
 * Usage in React components  → useFirmPhone() / useSigningOtpEnabled() / ...
 * Usage in plain JS functions → getFirmPhone() / getSigningOtpEnabledCached()
 */
import { useState, useEffect } from "react";
import ApiUtils from "../api/apiUtils";

// ── Module-level cache ──────────────────────────────────────────────
let _whatsappPhone = "";
let _firmName = "";
let _signingOtpEnabled = false;
let _signingRequireOtpDefault = true;
let _calendarModuleEnabled = true;
let _aiChatbotEnabled = false;
let _loaded = false;
let _loadPromise = null;
const _listeners = new Set();

function toBool(raw, fallback = false) {
    if (raw === undefined || raw === null || raw === "") return fallback;
    return raw === true || raw === "true" || raw === "1" || raw === 1;
}

function notifyListeners() {
    _listeners.forEach((fn) => {
        try { fn(); } catch { /* ignore */ }
    });
}

/**
 * Fetch public settings from the server (called lazily on first access).
 * Subsequent calls return the same promise / cached data.
 */
export async function loadFirmSettings() {
    if (_loaded) return;
    if (_loadPromise) return _loadPromise;

    _loadPromise = ApiUtils.get("platform-settings/public")
        .then((res) => {
            const data = res?.data || {};
            _whatsappPhone = data.WHATSAPP_DEFAULT_PHONE || "";
            _firmName = data.LAW_FIRM_NAME || "";
            _signingOtpEnabled = toBool(data.SIGNING_OTP_ENABLED, false);
            _signingRequireOtpDefault = toBool(data.SIGNING_REQUIRE_OTP_DEFAULT, true);
            _calendarModuleEnabled = toBool(data.ENABLE_CALENDAR_MODULE, true);
            _aiChatbotEnabled = toBool(data.AI_CHATBOT_ENABLED, false);
            _loaded = true;
            notifyListeners();
        })
        .catch((err) => {
            console.warn("[firmSettings] failed to load public settings:", err);
            _loadPromise = null; // allow retry on next access
        });

    return _loadPromise;
}

/** Return the cached WhatsApp phone (E.164 digits, e.g. "97236565004"). */
export function getFirmPhone() {
    if (!_loaded && !_loadPromise) loadFirmSettings();
    return _whatsappPhone;
}

/**
 * Derive the national display format from E.164 digits.
 * "97236565004" → "036565004"
 */
export function getFirmPhoneNational() {
    const e164 = getFirmPhone();
    if (!e164) return "";
    if (e164.startsWith("972")) return "0" + e164.slice(3);
    return e164;
}

/** Return the cached firm name. */
export function getFirmName() {
    if (!_loaded && !_loadPromise) loadFirmSettings();
    return _firmName;
}

export function getSigningOtpEnabledCached() {
    if (!_loaded && !_loadPromise) loadFirmSettings();
    return _signingOtpEnabled;
}

export function getSigningRequireOtpDefaultCached() {
    if (!_loaded && !_loadPromise) loadFirmSettings();
    return _signingRequireOtpDefault;
}

export function getCalendarModuleEnabledCached() {
    if (!_loaded && !_loadPromise) loadFirmSettings();
    return _calendarModuleEnabled;
}

export function getAiChatbotEnabledCached() {
    if (!_loaded && !_loadPromise) loadFirmSettings();
    return _aiChatbotEnabled;
}

function useCachedBool(getter, initial) {
    const [value, setValue] = useState(() => (_loaded ? getter() : initial));

    useEffect(() => {
        const sync = () => setValue(getter());
        if (_loaded) {
            sync();
            return undefined;
        }
        loadFirmSettings().then(sync);
        _listeners.add(sync);
        return () => { _listeners.delete(sync); };
    }, [getter]);

    return value;
}

// ── React hooks ─────────────────────────────────────────────────────

/** Hook that triggers a lazy load and re-renders when the phone arrives. */
export function useFirmPhone() {
    const [phone, setPhone] = useState(_whatsappPhone);

    useEffect(() => {
        const sync = () => setPhone(_whatsappPhone);
        if (_loaded) {
            sync();
            return undefined;
        }
        loadFirmSettings().then(sync);
        _listeners.add(sync);
        return () => { _listeners.delete(sync); };
    }, []);

    return phone;
}

/** Hook: platform setting LAW_FIRM_NAME (Hebrew client-facing). */
export function useFirmName() {
    const [name, setName] = useState(_firmName);

    useEffect(() => {
        const sync = () => setName(_firmName);
        if (_loaded) {
            sync();
            return undefined;
        }
        loadFirmSettings().then(sync);
        _listeners.add(sync);
        return () => { _listeners.delete(sync); };
    }, []);

    return name;
}

/** Hook: platform setting SIGNING_OTP_ENABLED. */
export function useSigningOtpEnabled() {
    return useCachedBool(getSigningOtpEnabledCached, false);
}

/** Hook: platform setting ENABLE_CALENDAR_MODULE. */
export function useCalendarModuleEnabled() {
    return useCachedBool(getCalendarModuleEnabledCached, true);
}

/** Hook: platform setting AI_CHATBOT_ENABLED. */
export function useAiChatbotEnabled() {
    return useCachedBool(getAiChatbotEnabledCached, false);
}
