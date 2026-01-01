export default function IsraeliPhoneNumberValidation(phoneNumber) {
    if (!phoneNumber) return null;

    const digitsOnly = String(phoneNumber).replace(/\D/g, "");
    let normalized = digitsOnly;

    // Accept pasted international IL numbers and normalize to local
    if (normalized.startsWith("972") && normalized.length >= 11) {
        normalized = "0" + normalized.slice(3);
    }

    if (normalized.length !== 10) {
        return "מספר פלאפון לא תקין";
    }

    // Mobile in Israel typically starts with 05
    if (!/^05\d{8}$/.test(normalized)) {
        return "מספר פלאפון לא תקין";
    }

    return null;
}