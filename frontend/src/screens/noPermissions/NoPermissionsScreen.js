import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import "./NoPermissionsScreen.scss";

export const NoPermissionsScreenName = "/NoPermissions";

export default function NoPermissionsScreen() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const logout = () => {
        for (const key of ["token", "refreshToken", "role", "isPlatformAdmin"]) localStorage.removeItem(key);
        window.dispatchEvent(new Event("lw-auth-changed"));
        navigate("/", { replace: true });
    };
    return (
        <SimpleScreen className="lw-noPermissionsScreen">
            <SimpleContainer className="lw-noPermissionsScreen__card">
                <h1 className="lw-noPermissionsScreen__title">
                    {t("firmPermissions.noAccessTitle", "אין הרשאות זמינות")}
                </h1>
                <p className="lw-noPermissionsScreen__body">
                    {t(
                        "firmPermissions.noAccessBody",
                        "לחשבון זה לא הוגדרו הרשאות במערכת. פנה למנהל הפלטפורמה של המשרד.",
                    )}
                </p>
                <SecondaryButton onPress={logout}>{t("common.logout")}</SecondaryButton>
            </SimpleContainer>
        </SimpleScreen>
    );
}
