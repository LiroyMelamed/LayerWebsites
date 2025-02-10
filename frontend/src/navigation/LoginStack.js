import LoginOtpScreen, { LoginOtpScreenName } from "../screens/otpScreen/OtpScreen.js/LoginOtpScreen";
import LoginVerifyOtpCodeFieldsProvider from "../providers/LoginVerifyOtpCodeFieldsProvider";
import LoginScreen, { LoginScreenName } from "../screens/loginScreen/LoginScreen";
import { Navigate, Route, Routes } from "react-router-dom";

export const LoginStackName = "/LoginStack";

function LoginStack() {
    return (
        <LoginVerifyOtpCodeFieldsProvider>
            <Routes>
                <Route path="/*" element={
                    <Routes>
                        <Route path={LoginScreenName} element={<LoginScreen />} />
                        <Route path={LoginOtpScreenName} element={<LoginOtpScreen />} />
                        <Route path="/*" element={<Navigate to={LoginStackName + LoginScreenName} replace />} />
                    </Routes>
                } />
            </Routes>
        </LoginVerifyOtpCodeFieldsProvider>
    );
}

export default LoginStack;
