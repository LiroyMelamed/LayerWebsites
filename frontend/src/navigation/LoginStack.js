import { Suspense, lazy } from "react";
import LoginVerifyOtpCodeFieldsProvider from "../providers/LoginVerifyOtpCodeFieldsProvider";
import RouteFallback from "../components/simpleComponents/RouteFallback";
import { Navigate, Route, Routes } from "react-router-dom";
import { isOfficeWebRole } from "../constant/appRoles";
import {
    AdminStackName,
    ClientStackName,
    ClientMainScreenName,
    LoginOtpScreenName,
    LoginScreenName,
    LoginStackName,
    MainScreenName,
} from "./screenPaths";

const LoginScreen = lazy(() => import("../screens/loginScreen/LoginScreen"));
const LoginOtpScreen = lazy(() => import("../screens/otpScreen/OtpScreen.js/LoginOtpScreen"));

export { LoginStackName };

export function sessionHomePath() {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const role = typeof window !== "undefined" ? localStorage.getItem("role") : null;
    if (!token) return LoginStackName + LoginScreenName;
    return isOfficeWebRole(role) ? AdminStackName + MainScreenName : ClientStackName + ClientMainScreenName;
}

function LoginStack() {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const role = typeof window !== "undefined" ? localStorage.getItem("role") : null;

    if (token) {
        const redirectTo = isOfficeWebRole(role)
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
