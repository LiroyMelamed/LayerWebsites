import { createContext, useContext, useMemo, useState } from "react";

const LoginVerifyOtpCodeFieldsProviderContext = createContext();

export function useLoginVerifyOtpCodeFieldsProvider() {
    return useContext(LoginVerifyOtpCodeFieldsProviderContext);
}

export default function LoginVerifyOtpCodeFieldsProvider({ children }) {
    const [phoneNumber, setPhoneNumber] = useState("");
    const [otpNumber, setOtpNumber] = useState("");

    const value = useMemo(() => {
        return { phoneNumber, setPhoneNumber, otpNumber, setOtpNumber, };
    }, [phoneNumber, setPhoneNumber, otpNumber, setOtpNumber]);

    return (
        <LoginVerifyOtpCodeFieldsProviderContext.Provider value={value}>
            {children}
        </LoginVerifyOtpCodeFieldsProviderContext.Provider>
    );
}