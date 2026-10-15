import i18n from "../../i18n/i18n";

export function OtpValidation(otpCode) {
    if (!otpCode) return null

    if (otpCode?.length !== 6) {
        return i18n.t('errors.invalidOtp');
    }

    return null;
}