import AllCasesTypeScreen, { AllCasesTypeScreenName } from "../screens/allCasesTypeScreen/AllCasesTypeScreen";
import TaggedCasesScreen, { TaggedCasesScreenName } from "../screens/taggedCasesScreen/TaggedCasesScreen";
import AllMangerScreen, { AllMangerScreenName } from "../screens/allMangerScreen/AllMangerScreen";
import AllCasesScreen, { AllCasesScreenName } from "../screens/allCasesScreen/AllCasesScreen";
import MainScreen, { MainScreenName } from "../screens/mainScreen/MainScreen";
import TopAndRightNavBar from "../components/navBars/TopAndRightNavBar";
import { Route, Routes } from "react-router-dom";

export const AdminStackName = "/AdminStack";

function AdminStack() {
    return (
        <TopAndRightNavBar>
            <Routes>
                <Route path={MainScreenName} element={<MainScreen />} />
                <Route path={TaggedCasesScreenName} element={<TaggedCasesScreen />} />
                <Route path={AllCasesScreenName} element={<AllCasesScreen />} />
                <Route path={AllMangerScreenName} element={<AllMangerScreen />} />
                <Route path={AllCasesTypeScreenName} element={<AllCasesTypeScreen />} />
            </Routes>
        </TopAndRightNavBar>
    );
}

export default AdminStack;
