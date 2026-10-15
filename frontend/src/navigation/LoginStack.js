import { lazy, Suspense } from "react";
import LoginVerifyOtpCodeFieldsProvider from "../providers/LoginVerifyOtpCodeFieldsProvider";
import RouteFallback from "../components/simpleComponents/RouteFallback";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminStackName } from "./AdminStack";
import { ClientStackName } from "./ClientStack";
import { AppRoles } from "../constant/appRoles";
import {
    ClientMainScreenName,
    LoginOtpScreenName,
    LoginScreenName,
    MainScreenName,
} from "./screenPaths";

export const LoginStackName = "/LoginStack";

const LoginScreen = lazy(() => import("../screens/loginScreen/LoginScreen"));
const LoginOtpScreen = lazy(() => import("../screens/otpScreen/OtpScreen.js/LoginOtpScreen"));

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
            <Suspense fallback={<RouteFallback />}>
                <Routes>
                    <Route path="/*" element={
                        <Routes>
                            <Route path={LoginScreenName} element={<LoginScreen />} />
                            <Route path={LoginOtpScreenName} element={<LoginOtpScreen />} />
                            <Route path="/*" element={<Navigate to={LoginStackName + LoginScreenName} replace />} />
                        </Routes>
                    } />
                </Routes>
            </Suspense>
        </LoginVerifyOtpCodeFieldsProvider>
    );
}

export default LoginStack;
