import { lazy, Suspense } from "react";
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

export const AdminStackName = "/AdminStack";

const MainScreen = lazy(() => import("../screens/mainScreen/MainScreen"));
const TaggedCasesScreen = lazy(() => import("../screens/taggedCasesScreen/TaggedCasesScreen"));
const AllCasesScreen = lazy(() => import("../screens/allCasesScreen/AllCasesScreen"));
const AllClientsScreen = lazy(() => import("../screens/allClientsScreen/AllClientsScreen"));
const MyCasesScreen = lazy(() => import("../screens/myCasesScreen/MyCasesScreen"));
const AllMangerScreen = lazy(() => import("../screens/allMangerScreen/AllMangerScreen"));
const AllCasesTypeScreen = lazy(() => import("../screens/allCasesTypeScreen/AllCasesTypeScreen"));
const SigningManagerScreen = lazy(() => import("../screens/signingScreen/SigningManagerScreen"));
const UploadFileForSigningScreen = lazy(() => import("../screens/signingScreen/UploadFileForSigningScreen"));
const EvidenceDocumentsScreen = lazy(() => import("../screens/evidenceDocuments/EvidenceDocumentsScreen"));
const PlanUsageScreen = lazy(() => import("../screens/billingScreen/PlanUsageScreen"));
const PlansPricingScreen = lazy(() => import("../screens/billingScreen/PlansPricingScreen"));
const RemindersScreen = lazy(() => import("../screens/remindersScreen/RemindersScreen"));
const PlatformSettingsScreen = lazy(() => import("../screens/platformSettingsScreen/PlatformSettingsScreen"));
const CalendarScreen = lazy(() => import("../screens/calendarScreen/CalendarScreen"));

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
