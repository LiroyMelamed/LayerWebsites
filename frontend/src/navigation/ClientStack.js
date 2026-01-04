import { Navigate, Route, Routes } from "react-router-dom";
import ClientMainScreen, { ClientMainScreenName } from "../screens/client/clientMainScreen/ClientMainScreen";
import TopAndRightNavBar from "../components/navBars/TopAndRightNavBar";
import { getClientNavBarData } from "../components/navBars/data/ClientNavBarData";
import SigningScreen, { SigningScreenName } from "../screens/signingScreen/SigningScreen";
import NotificationsScreen, { NotificationsScreenName } from "../screens/client/notifications/NotificationsScreen";
import ProfileScreen, { ProfileScreenName } from "../screens/client/profile/ProfileScreen";
import { LoginStackName } from "./LoginStack";
import { LoginScreenName } from "../screens/loginScreen/LoginScreen";

export const ClientStackName = "/ClientStack";

function ClientStack() {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return <Navigate to={LoginStackName + LoginScreenName} replace />;

    return (
        <TopAndRightNavBar LogoNavigate={ClientStackName + ClientMainScreenName} GetNavBarData={getClientNavBarData}>
            <Routes>
                <Route path={ClientMainScreenName} element={<ClientMainScreen />} />
                <Route path={NotificationsScreenName} element={<NotificationsScreen />} />
                <Route path={SigningScreenName} element={<SigningScreen />} />
                <Route path={ProfileScreenName} element={<ProfileScreen />} />
            </Routes>
        </TopAndRightNavBar>
    );
}

export default ClientStack;
