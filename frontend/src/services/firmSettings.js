/**
 * firmSettings  — lightweight module that fetches non-sensitive firm
 * settings (WhatsApp phone, firm name, signing OTP flags) once and caches them.
 *
 * Usage in React components  → useFirmPhone() / useSigningOtpEnabled()
 * Usage in plain JS functions → getFirmPhone() / getSigningOtpEnabledCached()
 */
import { useState, useEffect } from "react";
import ApiUtils from "../api/apiUtils";

// ── Module-level cache ──────────────────────────────────────────────
let _whatsappPhone = "";
let _firmName = "";
let _signingOtpEnabled = false;
let _signingRequireOtpDefault = true;
let _loaded = false;
let _loadPromise = null;

function toBool(raw, fallback = false) {
    if (raw === undefined || raw === null || raw === "") return fallback;
    return raw === true || raw === "true" || raw === "1" || raw === 1;
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
            _loaded = true;
        })
        .catch((err) => {
            console.warn("[firmSettings] failed to load public settings:", err);
            _loadPromise = null; // allow retry on next access
        });

    return _loadPromise;
}

/** Return the cached WhatsApp phone (E.164 digits, e.g. "97236565004"). */
export function getFirmPhone() {
    // Trigger lazy load if not yet loaded
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

// ── React hooks ─────────────────────────────────────────────────────

/** Hook that triggers a lazy load and re-renders when the phone arrives. */
export function useFirmPhone() {
    const [phone, setPhone] = useState(_whatsappPhone);

    useEffect(() => {
        if (_loaded) {
            setPhone(_whatsappPhone);
            return;
        }
        loadFirmSettings().then(() => setPhone(_whatsappPhone));
    }, []);

    return phone;
}

/** Hook: platform setting SIGNING_OTP_ENABLED. */
export function useSigningOtpEnabled() {
    const [enabled, setEnabled] = useState(_loaded ? _signingOtpEnabled : false);

    useEffect(() => {
        if (_loaded) {
            setEnabled(_signingOtpEnabled);
            return;
        }
        loadFirmSettings().then(() => setEnabled(_signingOtpEnabled));
    }, []);

    return enabled;
}
