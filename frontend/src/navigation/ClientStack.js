import { Route, Routes } from "react-router-dom";
import ClientMainScreen, { ClientMainScreenName } from "../screens/client/clientMainScreen/ClientMainScreen";
import UpdatesAndNotificationsScreen, { UpdatesAndNotificationsScreenName } from "../screens/client/updates/UpdatesScreen";
import TopAndRightNavBar from "../components/navBars/TopAndRightNavBar";
import { getClientNavBarData } from "../components/navBars/data/ClientNavBarData";
import SigningScreen, { SigningScreenName } from "../screens/signingScreen/SigningScreen";

export const ClientStackName = "/ClientStack";

function ClientStack() {
    return (
        <TopAndRightNavBar LogoNavigate={ClientStackName + ClientMainScreenName} GetNavBarData={getClientNavBarData}>
            <Routes>
                <Route path={ClientMainScreenName} element={<ClientMainScreen />} />
                <Route path={UpdatesAndNotificationsScreenName} element={<UpdatesAndNotificationsScreen />} />
                <Route path={SigningScreenName} element={<SigningScreen />} />
            </Routes>
        </TopAndRightNavBar>
    );
}

export default ClientStack;
