import AllCasesTypeScreen, { AllCasesTypeScreenName } from "../screens/allCasesTypeScreen/AllCasesTypeScreen";
import TaggedCasesScreen, { TaggedCasesScreenName } from "../screens/taggedCasesScreen/TaggedCasesScreen";
import AllMangerScreen, { AllMangerScreenName } from "../screens/allMangerScreen/AllMangerScreen";
import AllCasesScreen, { AllCasesScreenName } from "../screens/allCasesScreen/AllCasesScreen";
import MainScreen, { MainScreenName } from "../screens/mainScreen/MainScreen";
import TopAndRightNavBar from "../components/navBars/TopAndRightNavBar";
import { Navigate, Route, Routes } from "react-router-dom";
import SigningManagerScreen, { SigningManagerScreenName } from "../screens/signingScreen/SigningManagerScreen";
import UploadFileForSigningScreen, { uploadFileForSigningScreenName } from "../screens/signingScreen/UploadFileForSigningScreen";
import AuditTrailScreen, { AuditTrailScreenName } from "../screens/auditTrailScreen/AuditTrailScreen";
import { LoginStackName } from "./LoginStack";
import { LoginScreenName } from "../screens/loginScreen/LoginScreen";

export const AdminStackName = "/AdminStack";

function AdminStack() {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return <Navigate to={LoginStackName + LoginScreenName} replace />;

    return (
        <TopAndRightNavBar LogoNavigate={AdminStackName + MainScreenName}>
            <Routes>
                <Route path={MainScreenName} element={<MainScreen />} />
                <Route path={TaggedCasesScreenName} element={<TaggedCasesScreen />} />
                <Route path={AllCasesScreenName} element={<AllCasesScreen />} />
                <Route path={AllMangerScreenName} element={<AllMangerScreen />} />
                <Route path={AllCasesTypeScreenName} element={<AllCasesTypeScreen />} />
                <Route path={SigningManagerScreenName} element={<SigningManagerScreen />} />
                <Route path={AuditTrailScreenName} element={<AuditTrailScreen />} />
                <Route path={uploadFileForSigningScreenName} element={<UploadFileForSigningScreen />} />

            </Routes>
        </TopAndRightNavBar>
    );
}

export default AdminStack;
