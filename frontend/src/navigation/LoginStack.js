import LoginOtpScreen, { LoginOtpScreenName } from "../screens/otpScreen/OtpScreen.js/LoginOtpScreen";
import LoginVerifyOtpCodeFieldsProvider from "../providers/LoginVerifyOtpCodeFieldsProvider";
import LoginScreen, { LoginScreenName } from "../screens/loginScreen/LoginScreen";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminStackName } from "./AdminStack";
import { ClientStackName } from "./ClientStack";
import { MainScreenName } from "../screens/mainScreen/MainScreen";
import { ClientMainScreenName } from "../screens/client/clientMainScreen/ClientMainScreen";
import { AppRoles } from "../screens/otpScreen/OtpScreen.js/LoginOtpScreen";

export const LoginStackName = "/LoginStack";

function LoginStack() {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const role = typeof window !== "undefined" ? localStorage.getItem("role") : null;

    if (token) {
        const redirectTo =
            role === AppRoles.Admin
                ? AdminStackName + MainScreenName
                : ClientStackName + ClientMainScreenName;
        return <Navigate to={redirectTo} replace />;
    }

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
