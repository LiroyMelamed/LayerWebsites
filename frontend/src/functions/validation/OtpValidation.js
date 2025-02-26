export function OtpValidation(otpCode) {
    if (!otpCode) return null

    if (otpCode?.length !== 6) {
        return 'קוד לא תקין';
    }

    return null;
}