const twilio = require("twilio");
require("dotenv").config();

const isProduction = false;
const COMPANY_NAME = 'MelamedLaw';
const WEBSITE_DOMAIN = 'client.melamedlaw.co.il';

const client = new twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

async function sendMessage(messageBody, formattedPhone) {
    if (isProduction) {
        try {
            await client.messages.create({
                body: messageBody,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: formattedPhone,
            });
            console.log(`Message sent to ${formattedPhone}`);
        } catch (error) {
            console.error(`Error sending message to ${formattedPhone}:`, error);
            // Optionally re-throw or handle more gracefully
        }
    } else {
        console.log('--- SMS Simulation (Dev Mode) ---');
        console.log('To:', formattedPhone);
        console.log('Body:', messageBody);
        console.log('---------------------------------');
    }
}

module.exports = { sendMessage, COMPANY_NAME, WEBSITE_DOMAIN, isProduction };
