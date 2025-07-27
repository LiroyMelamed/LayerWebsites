const formatPhoneNumber = (phone) => {
    const cleanedNumber = phone.replace(/\D/g, "")
    return cleanedNumber.startsWith("0") ? `+972${cleanedNumber.slice(1)}` : `+${cleanedNumber}`;
};

module.exports = { formatPhoneNumber };
