const twilio = require("twilio");

const client = new twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const isProduction = false;

const formatPhoneNumber = (phone) => {
    const cleaned = phone.replace(/\D/g, "");
    return cleaned.startsWith("0") ? `+972${cleaned.slice(1)}` : `+${cleaned}`;
};

const sendMessage = async (messageBody, formattedPhone) => {
    if (isProduction) {
        await client.messages.create({
            body: messageBody,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: formattedPhone,
        });
    } else {
        console.log("SMS Simulation:", { to: formattedPhone, message: messageBody });
    }
};

module.exports = {
    formatPhoneNumber,
    sendMessage,
};
