import { createContext, useContext, useMemo, useState } from "react";
import useFieldState from "../hooks/useFieldState";
import IsraeliPhoneNumberValidation from "../functions/validation/IsraeliPhoneNumberValidation";
import { OtpValidation } from "../functions/validation/OtpValidation";

function emailValidation(value) {
    const v = String(value || "").trim();
    if (!v) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "כתובת דוא״ל לא תקינה";
    return null;
}

const LoginVerifyOtpCodeFieldsProviderContext = createContext();

export function useLoginVerifyOtpCodeFieldsProvider() {
    return useContext(LoginVerifyOtpCodeFieldsProviderContext);
}

export default function LoginVerifyOtpCodeFieldsProvider({ children }) {
    const [loginChannel, setLoginChannel] = useState("phone");
    const [phoneNumber, setPhoneNumber, phoneNumberError] = useFieldState(IsraeliPhoneNumberValidation);
    const [email, setEmail, emailError] = useFieldState(emailValidation);
    const [otpNumber, setOtpNumber, otpError] = useFieldState(OtpValidation);

    const value = useMemo(() => ({
        loginChannel,
        setLoginChannel,
        phoneNumber,
        setPhoneNumber,
        phoneNumberError,
        email,
        setEmail,
        emailError,
        otpNumber,
        setOtpNumber,
        otpError,
    }), [
        loginChannel,
        phoneNumber,
        setPhoneNumber,
        phoneNumberError,
        email,
        setEmail,
        emailError,
        otpNumber,
        setOtpNumber,
        otpError,
    ]);

    return (
        <LoginVerifyOtpCodeFieldsProviderContext.Provider value={value}>
            {children}
        </LoginVerifyOtpCodeFieldsProviderContext.Provider>
    );
}