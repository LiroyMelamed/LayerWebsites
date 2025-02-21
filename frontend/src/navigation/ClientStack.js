import { Route, Routes } from "react-router-dom";
import ClientMainScreen, { ClientMainScreenName } from "../screens/client/clientMainScreen/ClientMainScreen";
import ClientTopAndRightNavBar from "../components/navBars/ClientTopAndRightNavBar";
import UpdatesScreen, { UpdatesScreenName } from "../screens/client/updates/UpdatesScreen";

export const ClientStackName = "/ClientStack";

function ClientStack() {
    return (
        <ClientTopAndRightNavBar LogoNavigate={ClientStackName + ClientMainScreenName}>
            <Routes>
                <Route path={ClientMainScreenName} element={<ClientMainScreen />} />
                <Route path={UpdatesScreenName} element={<UpdatesScreen />} />
            </Routes>
        </ClientTopAndRightNavBar>
    );
}

export default ClientStack;
