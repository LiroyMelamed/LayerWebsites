const twilio = require("twilio");
require("dotenv").config();

// Constants for company name and website domain
const COMPANY_NAME = 'MelamedLaw';
const WEBSITE_DOMAIN = 'client.melamedlaw.co.il';

// Initialize the Twilio client using environment variables
const client = new twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// Check if the application is running in production mode
const isProduction = process.env.IS_PRODUCTION === 'true';

// For short-term testing: when true, send real SMS even in dev.
const FORCE_SEND_SMS_ALL = process.env.FORCE_SEND_SMS_ALL === 'true';

/**
 * Sends an SMS message using the Twilio API. In development, it logs the message instead.
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

    if (shouldSendRealSms) {
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
            console.error(
                "Twilio env vars missing (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_PHONE_NUMBER). Cannot send SMS."
            );
            return;
        }

        try {
            await client.messages.create({
                body: messageBody,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: formattedPhone,
            });
            console.log(`Message sent to ${formattedPhone}`);
        } catch (error) {
            console.error(`Error sending message to ${formattedPhone}:`, error);
        }
    } else {
        // Log the message to the console in development mode
        console.log('--- SMS Simulation (Dev Mode) ---');
        console.log('To:', formattedPhone);
        console.log('Body:', messageBody);
        console.log('---------------------------------');
    }
}

module.exports = { sendMessage, COMPANY_NAME, WEBSITE_DOMAIN, isProduction, FORCE_SEND_SMS_ALL };
