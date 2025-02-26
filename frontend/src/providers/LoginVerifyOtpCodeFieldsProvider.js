import { createContext, useContext, useMemo, useState } from "react";
import useFieldState from "../hooks/useFieldState";
import IsraeliPhoneNumberValidation from "../functions/validation/IsraeliPhoneNumberValidation";
import { OtpValidation } from "../functions/validation/OtpValidation";

const LoginVerifyOtpCodeFieldsProviderContext = createContext();

export function useLoginVerifyOtpCodeFieldsProvider() {
    return useContext(LoginVerifyOtpCodeFieldsProviderContext);
}

export default function LoginVerifyOtpCodeFieldsProvider({ children }) {
    const [phoneNumber, setPhoneNumber, phoneNumberError] = useFieldState(IsraeliPhoneNumberValidation);
    const [otpNumber, setOtpNumber, otpError] = useFieldState(OtpValidation);

    const value = useMemo(() => {
        return { phoneNumber, setPhoneNumber, otpNumber, setOtpNumber, phoneNumberError, otpError };
    }, [phoneNumber, setPhoneNumber, otpNumber, setOtpNumber, phoneNumberError, otpError]);

    return (
        <LoginVerifyOtpCodeFieldsProviderContext.Provider value={value}>
            {children}
        </LoginVerifyOtpCodeFieldsProviderContext.Provider>
    );
}