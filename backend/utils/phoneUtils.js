/**
 * Formats a phone number to an international format suitable for services like Twilio.
 * It removes all non-digit characters and prefixes with the country code +972 for Israeli numbers.
 * @param {string} phone - The raw phone number string.
 * @returns {string} The formatted phone number, e.g., "+972501234567".
 */
const formatPhoneNumber = (phone) => {
    // Remove all non-digit characters from the phone number
    const cleanedNumber = phone.replace(/\D/g, "");

    // Check if the number starts with "0" (e.g., 050...) and format it
    // If it doesn't, assume it's already in an international format (e.g., 97250...)
    return cleanedNumber.startsWith("0") ? `+972${cleanedNumber.slice(1)}` : `+${cleanedNumber}`;
};

module.exports = { formatPhoneNumber };
