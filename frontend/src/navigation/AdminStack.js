import { Suspense } from "react";
import TopAndRightNavBar from "../components/navBars/TopAndRightNavBar";
import RouteFallback from "../components/simpleComponents/RouteFallback";
import { Navigate, Route, Routes } from "react-router-dom";
import {
    AllCasesScreenName,
    AllCasesTypeScreenName,
    AllClientsScreenName,
    AllMangerScreenName,
    CalendarScreenName,
    EvidenceDocumentsScreenName,
    MainScreenName,
    MyCasesScreenName,
    PlanUsageScreenName,
    PlansPricingScreenName,
    PlatformSettingsScreenName,
    RemindersScreenName,
    SigningManagerScreenName,
    TaggedCasesScreenName,
    uploadFileForSigningScreenName,
    LoginScreenName,
} from "./screenPaths";
import { ENABLE_CALENDAR_MODULE } from "../featureFlags";
import { LoginStackName } from "./LoginStack";
import MainScreen from "../screens/mainScreen/MainScreen";
import TaggedCasesScreen from "../screens/taggedCasesScreen/TaggedCasesScreen";
import AllCasesScreen from "../screens/allCasesScreen/AllCasesScreen";
import AllClientsScreen from "../screens/allClientsScreen/AllClientsScreen";
import MyCasesScreen from "../screens/myCasesScreen/MyCasesScreen";
import AllMangerScreen from "../screens/allMangerScreen/AllMangerScreen";
import AllCasesTypeScreen from "../screens/allCasesTypeScreen/AllCasesTypeScreen";
import SigningManagerScreen from "../screens/signingScreen/SigningManagerScreen";
import UploadFileForSigningScreen from "../screens/signingScreen/UploadFileForSigningScreen";
import EvidenceDocumentsScreen from "../screens/evidenceDocuments/EvidenceDocumentsScreen";
import PlanUsageScreen from "../screens/billingScreen/PlanUsageScreen";
import PlansPricingScreen from "../screens/billingScreen/PlansPricingScreen";
import RemindersScreen from "../screens/remindersScreen/RemindersScreen";
import PlatformSettingsScreen from "../screens/platformSettingsScreen/PlatformSettingsScreen";
import CalendarScreen from "../screens/calendarScreen/CalendarScreen";

export const AdminStackName = "/AdminStack";

function toRelativePath(pathname) {
    const p = String(pathname || "");
    return p.startsWith("/") ? p.slice(1) : p;
}

function AdminStack() {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return <Navigate to={LoginStackName + LoginScreenName} replace />;

    return (
        <TopAndRightNavBar LogoNavigate={AdminStackName + MainScreenName}>
            <Suspense fallback={<RouteFallback />}>
                <Routes>
                    <Route path={toRelativePath(MainScreenName)} element={<MainScreen />} />
                    <Route path={toRelativePath(TaggedCasesScreenName)} element={<TaggedCasesScreen />} />
                    <Route path={toRelativePath(AllCasesScreenName)} element={<AllCasesScreen />} />
                    <Route path={toRelativePath(AllClientsScreenName)} element={<AllClientsScreen />} />
                    <Route path={toRelativePath(MyCasesScreenName)} element={<MyCasesScreen />} />
                    <Route path={toRelativePath(AllMangerScreenName)} element={<AllMangerScreen />} />
                    <Route path={toRelativePath(AllCasesTypeScreenName)} element={<AllCasesTypeScreen />} />
                    <Route path={toRelativePath(SigningManagerScreenName)} element={<SigningManagerScreen />} />
                    <Route path={toRelativePath(EvidenceDocumentsScreenName)} element={<EvidenceDocumentsScreen />} />
                    <Route path={toRelativePath(PlanUsageScreenName)} element={<PlanUsageScreen />} />
                    <Route path={toRelativePath(PlansPricingScreenName)} element={<PlansPricingScreen />} />
                    <Route path={toRelativePath(uploadFileForSigningScreenName)} element={<UploadFileForSigningScreen />} />
                    <Route path={toRelativePath(RemindersScreenName)} element={<RemindersScreen />} />
                    <Route path={toRelativePath(PlatformSettingsScreenName)} element={<PlatformSettingsScreen />} />
                    {ENABLE_CALENDAR_MODULE && (
                        <Route path={toRelativePath(CalendarScreenName)} element={<CalendarScreen />} />
                    )}
                </Routes>
            </Suspense>
        </TopAndRightNavBar>
    );
}

export default AdminStack;
