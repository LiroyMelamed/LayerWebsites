import { Suspense, lazy } from "react";
import TopAndRightNavBar from "../components/navBars/TopAndRightNavBar";
import RouteFallback from "../components/simpleComponents/RouteFallback";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
    AllCasesScreenName,
    AllCasesTypeScreenName,
    AllClientsScreenName,
    AllMangerScreenName,
    CalendarScreenName,
    DailyAgendaScreenName,
    EvidenceDocumentsScreenName,
    MainScreenName,
    MyCasesScreenName,
    PlanUsageScreenName,
    PlansPricingScreenName,
    PlatformSettingsScreenName,
    RemindersScreenName,
    AdminSupportScreenName,
    SigningManagerScreenName,
    SigningSpotsPreviewScreenName,
    TaggedCasesScreenName,
    uploadFileForSigningScreenName,
    LoginScreenName,
} from "./screenPaths";
import { useCalendarModuleEnabled } from "../services/firmSettings";
import { LoginStackName } from "./LoginStack";
import MainScreen from "../screens/mainScreen/MainScreen";
import TaggedCasesScreen from "../screens/taggedCasesScreen/TaggedCasesScreen";
import AllCasesScreen from "../screens/allCasesScreen/AllCasesScreen";
import AllClientsScreen from "../screens/allClientsScreen/AllClientsScreen";
import MyCasesScreen from "../screens/myCasesScreen/MyCasesScreen";
import AllMangerScreen from "../screens/allMangerScreen/AllMangerScreen";
import AllCasesTypeScreen from "../screens/allCasesTypeScreen/AllCasesTypeScreen";
import RemindersScreen from "../screens/remindersScreen/RemindersScreen";
import AdminSupportScreen from "../screens/admin/support/AdminSupportScreen";
import BillingLockedScreen from "../components/billing/BillingLockedScreen";
import { useBillingLock } from "../providers/BillingLockProvider";

const SigningManagerScreen = lazy(() => import("../screens/signingScreen/SigningManagerScreen"));
const SigningSpotsPreviewScreen = lazy(() => import("../screens/signingScreen/SigningSpotsPreviewScreen"));
const UploadFileForSigningScreen = lazy(() => import("../screens/signingScreen/UploadFileForSigningScreen"));
const EvidenceDocumentsScreen = lazy(() => import("../screens/evidenceDocuments/EvidenceDocumentsScreen"));
const PlanUsageScreen = lazy(() => import("../screens/billingScreen/PlanUsageScreen"));
const PlansPricingScreen = lazy(() => import("../screens/billingScreen/PlansPricingScreen"));
const PlatformSettingsScreen = lazy(() => import("../screens/platformSettingsScreen/PlatformSettingsScreen"));
const CalendarScreen = lazy(() => import("../screens/calendarScreen/CalendarScreen"));
const DailyAgendaScreen = lazy(() => import("../screens/calendarScreen/DailyAgendaScreen"));

export const AdminStackName = "/AdminStack";

function toRelativePath(pathname) {
    const p = String(pathname || "");
    return p.startsWith("/") ? p.slice(1) : p;
}

function AdminStack() {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const calendarEnabled = useCalendarModuleEnabled();
    const location = useLocation();
    const { locked, loaded } = useBillingLock();
    const isPlatformAdmin = typeof window !== "undefined" && localStorage.getItem("isPlatformAdmin") === "true";
    if (!token) return <Navigate to={LoginStackName + LoginScreenName} replace />;

    const onBillingRoute = /PlanUsage|PlansPricing/i.test(location.pathname || "");
    if (loaded && locked && !(isPlatformAdmin && onBillingRoute)) {
        if (isPlatformAdmin) {
            return <Navigate to={`${AdminStackName}${PlanUsageScreenName}`} replace />;
        }
        return <BillingLockedScreen />;
    }

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
                    <Route path={toRelativePath(SigningSpotsPreviewScreenName)} element={<SigningSpotsPreviewScreen />} />
                    <Route path={toRelativePath(EvidenceDocumentsScreenName)} element={<EvidenceDocumentsScreen />} />
                    <Route path={toRelativePath(PlanUsageScreenName)} element={<PlanUsageScreen />} />
                    <Route path={toRelativePath(PlansPricingScreenName)} element={<PlansPricingScreen />} />
                    <Route path={toRelativePath(uploadFileForSigningScreenName)} element={<UploadFileForSigningScreen />} />
                    <Route path={toRelativePath(RemindersScreenName)} element={<RemindersScreen />} />
                    <Route path={toRelativePath(AdminSupportScreenName)} element={<AdminSupportScreen />} />
                    <Route path={toRelativePath(PlatformSettingsScreenName)} element={<PlatformSettingsScreen />} />
                    {calendarEnabled && (
                        <>
                            <Route path={toRelativePath(CalendarScreenName)} element={<CalendarScreen />} />
                            <Route path={toRelativePath(DailyAgendaScreenName)} element={<DailyAgendaScreen />} />
                        </>
                    )}
                </Routes>
            </Suspense>
        </TopAndRightNavBar>
    );
}

export default AdminStack;
