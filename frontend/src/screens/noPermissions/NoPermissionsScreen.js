import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import { useTranslation } from "react-i18next";
import "./NoPermissionsScreen.scss";

export const NoPermissionsScreenName = "/NoPermissions";

export default function NoPermissionsScreen() {
    const { t } = useTranslation();
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
            </SimpleContainer>
        </SimpleScreen>
    );
}
