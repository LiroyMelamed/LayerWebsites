import { Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import TopAndRightNavBar from "../components/navBars/TopAndRightNavBar";
import RouteFallback from "../components/simpleComponents/RouteFallback";
import { getClientNavBarData } from "../components/navBars/data/ClientNavBarData";
import {
    ClientCasesScreenName,
    ClientDocumentsScreenName,
    ClientSignedDocumentsScreenName,
    ClientMainScreenName,
    LoginScreenName,
    NotificationsScreenName,
    ProfileScreenName,
    SigningScreenName,
    ClientTicketScreenName,
} from "./screenPaths";
import { LoginStackName, AdminStackName } from "./screenPaths";
import ClientMainScreen from "../screens/client/clientMainScreen/ClientMainScreen";
import ClientCasesScreen from "../screens/client/clientCasesScreen/ClientCasesScreen";
import SigningScreen from "../screens/signingScreen/SigningScreen";
import NotificationsScreen from "../screens/client/notifications/NotificationsScreen";
import ProfileScreen from "../screens/client/profile/ProfileScreen";
import ClientDocumentsScreen from "../screens/client/clientDocumentsScreen/ClientDocumentsScreen";
import { clientPortalPath } from "../utils/clientPortalNavigation";
import ServiceUnavailableScreen from "../components/billing/ServiceUnavailableScreen";
import { useBillingLock } from "../providers/BillingLockProvider";

export const ClientStackName = "/ClientStack";

function toRelativePath(pathname) {
    const p = String(pathname || "");
    return p.startsWith("/") ? p.slice(1) : p;
}

function SignedDocumentsRedirect() {
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    params.set("tab", "signed");
    return <Navigate replace to={clientPortalPath(location.pathname, ClientDocumentsScreenName, `?${params}${location.hash}`)} />;
}

function ClientStack() {
    const location = useLocation();
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const { locked, loaded } = useBillingLock();
    if (!token) return <Navigate to={LoginStackName + LoginScreenName} replace />;
    if (loaded && locked) return <ServiceUnavailableScreen />;

    return (
        <TopAndRightNavBar LogoNavigate={clientPortalPath(location.pathname, ClientMainScreenName)} GetNavBarData={getClientNavBarData}>
            <Suspense fallback={<RouteFallback />}>
                <Routes>
                    <Route path={toRelativePath(ClientMainScreenName)} element={<ClientMainScreen />} />
                    <Route path={toRelativePath(ClientCasesScreenName)} element={<ClientCasesScreen />} />
                    <Route path={toRelativePath(ClientDocumentsScreenName)} element={<ClientDocumentsScreen />} />
                    <Route path={toRelativePath(ClientSignedDocumentsScreenName)} element={<SignedDocumentsRedirect />} />
                    <Route path={toRelativePath(NotificationsScreenName)} element={<NotificationsScreen />} />
                    <Route path={toRelativePath(SigningScreenName)} element={<SigningScreen />} />
                    <Route path={toRelativePath(ProfileScreenName)} element={<ProfileScreen />} />
                    <Route path={toRelativePath(ClientTicketScreenName)} element={<Navigate to={`${AdminStackName}/support`} replace />} />
                </Routes>
            </Suspense>
        </TopAndRightNavBar>
    );
}

export default ClientStack;
