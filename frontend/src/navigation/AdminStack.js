import AllCasesTypeScreen, { AllCasesTypeScreenName } from "../screens/allCasesTypeScreen/AllCasesTypeScreen";
import TaggedCasesScreen, { TaggedCasesScreenName } from "../screens/taggedCasesScreen/TaggedCasesScreen";
import AllMangerScreen, { AllMangerScreenName } from "../screens/allMangerScreen/AllMangerScreen";
import AllCasesScreen, { AllCasesScreenName } from "../screens/allCasesScreen/AllCasesScreen";
import MainScreen, { MainScreenName } from "../screens/mainScreen/MainScreen";
import TopAndRightNavBar from "../components/navBars/TopAndRightNavBar";
import { Navigate, Route, Routes } from "react-router-dom";
import SigningManagerScreen, { SigningManagerScreenName } from "../screens/signingScreen/SigningManagerScreen";
import UploadFileForSigningScreen, { uploadFileForSigningScreenName } from "../screens/signingScreen/UploadFileForSigningScreen";
import EvidenceDocumentsScreen, { EvidenceDocumentsScreenName } from "../screens/evidenceDocuments/EvidenceDocumentsScreen";
import PlanUsageScreen, { PlanUsageScreenName } from "../screens/billingScreen/PlanUsageScreen";
import PlansPricingScreen, { PlansPricingScreenName } from "../screens/billingScreen/PlansPricingScreen";
import MyCasesScreen, { MyCasesScreenName } from "../screens/myCasesScreen/MyCasesScreen";
import RemindersScreen, { RemindersScreenName } from "../screens/remindersScreen/RemindersScreen";
import { LoginStackName } from "./LoginStack";
import { LoginScreenName } from "../screens/loginScreen/LoginScreen";

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
            <Routes>
                <Route path={toRelativePath(MainScreenName)} element={<MainScreen />} />
                <Route path={toRelativePath(TaggedCasesScreenName)} element={<TaggedCasesScreen />} />
                <Route path={toRelativePath(AllCasesScreenName)} element={<AllCasesScreen />} />
                <Route path={toRelativePath(MyCasesScreenName)} element={<MyCasesScreen />} />
                <Route path={toRelativePath(AllMangerScreenName)} element={<AllMangerScreen />} />
                <Route path={toRelativePath(AllCasesTypeScreenName)} element={<AllCasesTypeScreen />} />
                <Route path={toRelativePath(SigningManagerScreenName)} element={<SigningManagerScreen />} />
                <Route path={toRelativePath(EvidenceDocumentsScreenName)} element={<EvidenceDocumentsScreen />} />
                <Route path={toRelativePath(PlanUsageScreenName)} element={<PlanUsageScreen />} />
                <Route path={toRelativePath(PlansPricingScreenName)} element={<PlansPricingScreen />} />
                <Route path={toRelativePath(uploadFileForSigningScreenName)} element={<UploadFileForSigningScreen />} />
                <Route path={toRelativePath(RemindersScreenName)} element={<RemindersScreen />} />

            </Routes>
        </TopAndRightNavBar>
    );
}

export default AdminStack;
