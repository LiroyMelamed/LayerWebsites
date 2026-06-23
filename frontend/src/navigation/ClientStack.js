import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import TopAndRightNavBar from "../components/navBars/TopAndRightNavBar";
import RouteFallback from "../components/simpleComponents/RouteFallback";
import { getClientNavBarData } from "../components/navBars/data/ClientNavBarData";
import {
    ClientCasesScreenName,
    ClientMainScreenName,
    LoginScreenName,
    NotificationsScreenName,
    ProfileScreenName,
    SigningScreenName,
} from "./screenPaths";
import { LoginStackName } from "./LoginStack";
import ClientMainScreen from "../screens/client/clientMainScreen/ClientMainScreen";
import ClientCasesScreen from "../screens/client/clientCasesScreen/ClientCasesScreen";
import SigningScreen from "../screens/signingScreen/SigningScreen";
import NotificationsScreen from "../screens/client/notifications/NotificationsScreen";
import ProfileScreen from "../screens/client/profile/ProfileScreen";

export const ClientStackName = "/ClientStack";

function toRelativePath(pathname) {
    const p = String(pathname || "");
    return p.startsWith("/") ? p.slice(1) : p;
}

function ClientStack() {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return <Navigate to={LoginStackName + LoginScreenName} replace />;

    return (
        <TopAndRightNavBar LogoNavigate={ClientStackName + ClientMainScreenName} GetNavBarData={getClientNavBarData}>
            <Suspense fallback={<RouteFallback />}>
                <Routes>
                    <Route path={toRelativePath(ClientMainScreenName)} element={<ClientMainScreen />} />
                    <Route path={toRelativePath(ClientCasesScreenName)} element={<ClientCasesScreen />} />
                    <Route path={toRelativePath(NotificationsScreenName)} element={<NotificationsScreen />} />
                    <Route path={toRelativePath(SigningScreenName)} element={<SigningScreen />} />
                    <Route path={toRelativePath(ProfileScreenName)} element={<ProfileScreen />} />
                </Routes>
            </Suspense>
        </TopAndRightNavBar>
    );
}

export default ClientStack;
