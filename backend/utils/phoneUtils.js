/**
 * Formats a phone number to an international format suitable for services like Twilio.
 * It removes all non-digit characters and prefixes with the country code +972 for Israeli numbers.
 * This project sends SMS only to Israeli numbers; non-IL numbers return null.
 * @param {string} phone - The raw phone number string.
 * @returns {string} The formatted phone number, e.g., "+972501234567".
 */
const formatPhoneNumber = (phone) => {
    if (!phone) return null;

    // Remove all non-digit characters from the phone number
    const cleanedNumber = String(phone).replace(/\D/g, "");

    if (!cleanedNumber) return null;

    // Israel local numbers commonly start with 0 (e.g., 050...)
    if (cleanedNumber.startsWith("0")) {
        // Typical IL numbers are 9-10 digits including the leading 0
        if (cleanedNumber.length < 9 || cleanedNumber.length > 10) return null;
        return `+972${cleanedNumber.slice(1)}`;
    }

    // Already Israel international without + (972...)
    if (cleanedNumber.startsWith("972") && cleanedNumber.length >= 11 && cleanedNumber.length <= 12) {
        return `+${cleanedNumber}`;
    }

    // Non-Israeli numbers are not supported in this project
    return null;
};

module.exports = { formatPhoneNumber };
