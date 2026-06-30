const axios = require("axios");
require("dotenv").config();
const { recordUsageEvent } = require("../lib/usage/recordFirmUsage");
const { getSetting } = require("../services/settingsService");
const { getFirmNameEn } = require("../lib/firmBranding");

// ── Static defaults (kept for backward-compatible imports) ──────────
const COMPANY_NAME = String(process.env.COMPANY_NAME || "").trim() || "LayerWebsites";
const WEBSITE_DOMAIN = String(process.env.WEBSITE_DOMAIN || "").trim() || "localhost";

// ── Async getters ───────────────────────────────────────────────────
// WEBSITE_DOMAIN comes from env only — never from platform_settings.
async function getWebsiteDomain() {
    return WEBSITE_DOMAIN;
}

async function getCompanyName() {
    const fromDb = await getFirmNameEn();
    return fromDb || COMPANY_NAME;
}

const isProduction = process.env.IS_PRODUCTION === "true";

const FORCE_SEND_SMS_ALL = process.env.FORCE_SEND_SMS_ALL === "true";

// Active SMS provider. Default is InforU; set SMS_PROVIDER=smoove to roll back.
const SMS_PROVIDER = String(process.env.SMS_PROVIDER || "inforu").trim().toLowerCase();

function stripPlus(e164Phone) {
    return String(e164Phone).startsWith("+") ? String(e164Phone).slice(1) : String(e164Phone);
}

/**
 * Convert an E.164 number to the local format InforU expects.
 * Israeli numbers (+972XXXXXXXXX) become 0XXXXXXXXX; anything else just loses the leading "+".
 */
function toInforuPhone(e164Phone) {
    const raw = String(e164Phone);
    if (raw.startsWith("+972")) return "0" + raw.slice(4);
    return stripPlus(raw);
}

function safeErrorData(err) {
    const status = err?.response?.status;
    const data = err?.response?.data;

    if (data && typeof data === "object") return { status, data };
    if (typeof data === "string") return { status, data: data.slice(0, 500) };
    return { status, data: err?.message || "Unknown error" };
}

/**
 * Resolve the active sender ID/number. DB (platform_settings) wins over env.
 * NOTE: this is the *active* sender — the pending value awaiting InforU verification
 * is stored separately under INFORU_SENDER_PHONE_PENDING and is never used here.
 */
async function getActiveSender() {
    return getSetting("messaging", "INFORU_SENDER_PHONE", process.env.INFORU_SENDER_PHONE);
}

// ── InforU provider ─────────────────────────────────────────────────

function inforuEnvMissing() {
    const missing = [];
    if (!process.env.INFORU_BASE_URL) missing.push("INFORU_BASE_URL");
    // Either a pre-encoded Authorization header, or username + token to build one.
    if (!process.env.INFORU_AUTH && (!process.env.INFORU_USERNAME || !process.env.INFORU_TOKEN)) {
        missing.push("INFORU_AUTH | (INFORU_USERNAME + INFORU_TOKEN)");
    }
    return missing;
}

function inforuAuthHeader() {
    if (process.env.INFORU_AUTH) return process.env.INFORU_AUTH;
    const creds = `${process.env.INFORU_USERNAME}:${process.env.INFORU_TOKEN}`;
    return "Basic " + Buffer.from(creds, "utf8").toString("base64");
}

/**
 * Send an SMS via the InforU API (capi.inforu.co.il /api/v2/SMS/SendSms).
 * @param {string} messageBody
 * @param {string} formattedPhone - E.164
 * @param {boolean} fast - high priority (Priority -1), used for OTP messages
 */
async function sendViaInforU(messageBody, formattedPhone, fast) {
    const missing = inforuEnvMissing();
    if (missing.length) {
        console.error(`InforU env vars missing (${missing.join("/")}). Cannot send SMS.`);
        return;
    }

    const senderPhone = await getActiveSender();
    if (!senderPhone) {
        console.error("INFORU_SENDER_PHONE not configured in platform_settings or .env. Cannot send SMS.");
        return;
    }

    const baseUrl = process.env.INFORU_BASE_URL.replace(/\/$/, ""); // trim trailing slash
    const url = `${baseUrl}/api/v2/SMS/SendSms`;

    const requestBody = {
        Data: {
            Message: String(messageBody ?? ""),
            Recipients: [{ Phone: toInforuPhone(formattedPhone) }],
            Settings: {
                Sender: String(senderPhone),
                // 0 = normal, -1 = high priority (single message — used for OTP)
                Priority: fast ? -1 : 0,
            },
        },
    };

    const requestHeaders = {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: inforuAuthHeader(),
    };

    try {
        const res = await axios.post(url, requestBody, {
            headers: requestHeaders,
            timeout: 15000,
        });

        const statusId = res?.data?.StatusId;
        if (statusId === 1) {
            console.log(`InforU SMS sent to ${formattedPhone}${fast ? " (high priority)" : ""}`);
            await recordUsageEvent("SMS", "inforu-send", { phone: formattedPhone });
            return res.data;
        }

        console.error(`InforU SMS not accepted for ${formattedPhone}:`, {
            StatusId: statusId,
            StatusDescription: res?.data?.StatusDescription,
            DetailedDescription: res?.data?.DetailedDescription,
        });
    } catch (err) {
        const { status, data } = safeErrorData(err);
        if (status === 401 || status === 403) {
            console.error("InforU SMS auth failed (check INFORU_AUTH / INFORU_USERNAME / INFORU_TOKEN).");
        }
        console.error(`Error sending message to ${formattedPhone}:`, { status, data });
    }
}

// ── Smoove provider (legacy — kept for rollback via SMS_PROVIDER=smoove) ──

function smooveEnvMissing() {
    const missing = [];
    if (!process.env.SMOOVE_BASE_URL) missing.push("SMOOVE_BASE_URL");
    if (!process.env.SMOOVE_API_KEY) missing.push("SMOOVE_API_KEY");
    return missing;
}

async function sendViaSmoove(messageBody, formattedPhone) {
    const missing = smooveEnvMissing();
    if (missing.length) {
        console.error(`Smoove env vars missing (${missing.join("/")}). Cannot send SMS.`);
        return;
    }

    const senderPhone = await getActiveSender();
    if (!senderPhone) {
        console.error("INFORU_SENDER_PHONE not configured in platform_settings or .env. Cannot send SMS.");
        return;
    }

    const baseUrl = process.env.SMOOVE_BASE_URL.replace(/\/$/, ""); // trim trailing slash
    const url = `${baseUrl}/v1/Messages`;

    const toPhone = stripPlus(formattedPhone);

    const messageRequest = {
        toMembersByCell: [toPhone],
        fromNumber: String(senderPhone),
        body: String(messageBody ?? ""),
    };

    const requestHeaders = {
        "Content-Type": "application/json",
        // Keep existing working auth headers (do not remove)
        TOKEN: process.env.SMOOVE_API_KEY,
        Authorization: `Bearer ${process.env.SMOOVE_API_KEY}`,
        // Defensive: some Smoove endpoints/accounts accept ApiKey header
        ApiKey: process.env.SMOOVE_API_KEY,
    };

    try {
        const res = await axios.post(url, messageRequest, {
            params: { isTts: false, sendNow: true },
            headers: requestHeaders,
            timeout: 15000,
        });

        console.log(`Smoove SMS sent to ${formattedPhone}`);
        await recordUsageEvent("SMS", "smoove-send", { phone: formattedPhone });
        return res.data;
    } catch (err) {
        const { status, data } = safeErrorData(err);

        if (status === 401 || status === 403) {
            console.error("Smoove SMS auth failed; header names used:", Object.keys(requestHeaders).sort());
        }

        console.error(`Error sending message to ${formattedPhone}:`, { status, data });
    }
}

/**
 * Sends an SMS message via the configured provider (InforU by default, Smoove if
 * SMS_PROVIDER=smoove). In development, it logs the message instead.
 * @param {string} messageBody - The body of the message to be sent.
 * @param {string} formattedPhone - The phone number to send to, in E.164 format.
 * @param {{ fast?: boolean }} [options] - Set fast=true for high-priority OTP delivery.
 */
async function sendMessage(messageBody, formattedPhone, { fast = false } = {}) {
    const e164Regex = /^\+[1-9]\d{7,14}$/;

    if (!formattedPhone || !e164Regex.test(String(formattedPhone))) {
        console.error(`Invalid phone for SMS (expected E.164):`, formattedPhone);
        return;
    }

    const shouldSendRealSms = isProduction || FORCE_SEND_SMS_ALL;

    if (!shouldSendRealSms) {
        console.log("--- SMS Simulation (Dev Mode) ---");
        console.log("To:", formattedPhone);
        console.log("Priority:", fast ? "high (OTP)" : "normal");
        console.log("Body:", messageBody);
        console.log("---------------------------------");
        // Record even in dev so local usage counters are realistic
        await recordUsageEvent("SMS", "dev-simulation", { phone: formattedPhone });
        return;
    }

    if (SMS_PROVIDER === "smoove") {
        return sendViaSmoove(messageBody, formattedPhone);
    }
    return sendViaInforU(messageBody, formattedPhone, fast);
}

module.exports = { sendMessage, COMPANY_NAME, WEBSITE_DOMAIN, getWebsiteDomain, getCompanyName, isProduction, FORCE_SEND_SMS_ALL };
