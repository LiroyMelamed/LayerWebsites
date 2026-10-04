import { Suspense, lazy } from "react";
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
    ClientTicketScreenName,
    LoginStackName,
    AdminStackName,
    ClientStackName,
} from "./screenPaths";
import BillingLockedScreen from "../components/billing/BillingLockedScreen";
import { useBillingLock } from "../providers/BillingLockProvider";
import ClientStackRoleRedirect from "./ClientStackRoleRedirect";

const ClientMainScreen = lazy(() => import("../screens/client/clientMainScreen/ClientMainScreen"));
const ClientCasesScreen = lazy(() => import("../screens/client/clientCasesScreen/ClientCasesScreen"));
const SigningScreen = lazy(() => import("../screens/signingScreen/SigningScreen"));
const NotificationsScreen = lazy(() => import("../screens/client/notifications/NotificationsScreen"));
const ProfileScreen = lazy(() => import("../screens/client/profile/ProfileScreen"));

export { ClientStackName };

function toRelativePath(pathname) {
    const p = String(pathname || "");
    return p.startsWith("/") ? p.slice(1) : p;
}

function ClientStack() {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const { locked, loaded } = useBillingLock();
    if (!token) return <Navigate to={LoginStackName + LoginScreenName} replace />;
    if (loaded && locked) return <BillingLockedScreen />;

    return (
        <ClientStackRoleRedirect>
        <TopAndRightNavBar LogoNavigate={ClientStackName + ClientMainScreenName} GetNavBarData={getClientNavBarData}>
            <Suspense fallback={<RouteFallback />}>
                <Routes>
                    <Route path={toRelativePath(ClientMainScreenName)} element={<ClientMainScreen />} />
                    <Route path={toRelativePath(ClientCasesScreenName)} element={<ClientCasesScreen />} />
                    <Route path={toRelativePath(NotificationsScreenName)} element={<NotificationsScreen />} />
                    <Route path={toRelativePath(SigningScreenName)} element={<SigningScreen />} />
                    <Route path={toRelativePath(ProfileScreenName)} element={<ProfileScreen />} />
                    <Route path={toRelativePath(ClientTicketScreenName)} element={<Navigate to={`${AdminStackName}/support`} replace />} />
                </Routes>
            </Suspense>
        </TopAndRightNavBar>
        </ClientStackRoleRedirect>
    );
}

export default ClientStack;
