const axios = require("axios");
require("dotenv").config();

const COMPANY_NAME = "MelamedLaw";
const WEBSITE_DOMAIN = "client.melamedlaw.co.il";

const isProduction = process.env.IS_PRODUCTION === "true";

const FORCE_SEND_SMS_ALL = process.env.FORCE_SEND_SMS_ALL === "true";

function stripPlus(e164Phone) {
    return String(e164Phone).startsWith("+") ? String(e164Phone).slice(1) : String(e164Phone);
}

function requiredEnvMissing() {
    const missing = [];
    if (!process.env.SMOOVE_BASE_URL) missing.push("SMOOVE_BASE_URL");
    if (!process.env.SMOOVE_API_KEY) missing.push("SMOOVE_API_KEY");
    if (!process.env.SMOOVE_SENDER_PHONE) missing.push("SMOOVE_SENDER_PHONE");
    return missing;
}

function safeErrorData(err) {
    const status = err?.response?.status;
    const data = err?.response?.data;

    if (data && typeof data === "object") return { status, data };
    if (typeof data === "string") return { status, data: data.slice(0, 500) };
    return { status, data: err?.message || "Unknown error" };
}

/**
 * Sends an SMS message using the Smoove API. In development, it logs the message instead.
 * @param {string} messageBody - The body of the message to be sent.
 * @param {string} formattedPhone - The phone number to send the message to, in E.164 format.
 */
async function sendMessage(messageBody, formattedPhone) {
    const e164Regex = /^\+[1-9]\d{7,14}$/;

    if (!formattedPhone || !e164Regex.test(String(formattedPhone))) {
        console.error(`Invalid phone for SMS (expected E.164):`, formattedPhone);
        return;
    }

    const shouldSendRealSms = isProduction || FORCE_SEND_SMS_ALL;

    if (!shouldSendRealSms) {
        console.log("--- SMS Simulation (Dev Mode) ---");
        console.log("To:", formattedPhone);
        console.log("Body:", messageBody);
        console.log("---------------------------------");
        return;
    }

    const missing = requiredEnvMissing();
    if (missing.length) {
        console.error(
            `Smoove env vars missing (${missing.join("/")}). Cannot send SMS.`
        );
        return;
    }

    const baseUrl = process.env.SMOOVE_BASE_URL.replace(/\/$/, ""); // trim trailing slash
    const url = `${baseUrl}/v1/Messages`;

    const toPhone = stripPlus(formattedPhone);

    const messageRequest = {
        toMembersByCell: [toPhone],
        fromNumber: String(process.env.SMOOVE_SENDER_PHONE),
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
        return res.data;
    } catch (err) {
        const { status, data } = safeErrorData(err);

        if (status === 401 || status === 403) {
            console.error('Smoove SMS auth failed; header names used:', Object.keys(requestHeaders).sort());
        }

        console.error(`Error sending message to ${formattedPhone}:`, { status, data });
    }
}

module.exports = { sendMessage, COMPANY_NAME, WEBSITE_DOMAIN, isProduction, FORCE_SEND_SMS_ALL };
