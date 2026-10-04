import { useCallback, useMemo } from "react";
import { adminApi } from "../../api/adminApi";
import { staffRolesApi } from "../../api/staffRolesApi";
import { images } from "../../assets/images/images";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";
import { AdminStackName } from "../../navigation/AdminStack";
import { usePopup } from "../../providers/PopUpProvider";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { useTranslation } from "react-i18next";
import { MainScreenName } from "../mainScreen/MainScreen";
import AdminPopup from "./components/AdminPopup";
import AdminsCard from "./components/AdminsCard";

import "./AllMangerScreen.scss";

export const AllMangerScreenName = "/AllManger";

function mapOfficeUserToRow(u) {
    return {
        userid: u.userId ?? u.userid,
        name: u.name,
        email: u.email,
        phonenumber: u.phone ?? u.phonenumber,
        role: u.role,
        firm_staff_role_id: u.firmStaffRoleId ?? u.firm_staff_role_id,
        firm_staff_role_name: u.firmStaffRoleName ?? u.firm_staff_role_name,
        is_platform_admin: u.isPlatformAdmin ?? u.is_platform_admin,
        createdat: u.createdAt ?? u.createdat,
    };
}

export default function AllMangerScreen() {
    const { t } = useTranslation();
    const isPlatformAdminSession =
        typeof window !== "undefined" && localStorage.getItem("isPlatformAdmin") === "true";

    const officeUsersLoader = useCallback(async () => {
        const list = await staffRolesApi.listOfficeUsers("");
        return { status: 200, data: (list || []).map(mapOfficeUserToRow) };
    }, []);

    const adminsLoader = useCallback(async () => adminApi.getAllAdmins(), []);

    const {
        result: adminsData,
        isPerforming: isPerformingAdminsData,
        performRequest: performGetAdmins,
    } = useAutoHttpRequest(isPlatformAdminSession ? officeUsersLoader : adminsLoader);

    const searchOfficeUsers = useCallback(async (query) => {
        const list = await staffRolesApi.listOfficeUsers(query || "");
        return { status: 200, data: (list || []).map(mapOfficeUserToRow) };
    }, []);

    const { result: adminByName, isPerforming: isPerformingAdminById, performRequest: SearchAdminByName } =
        useHttpRequest(
            isPlatformAdminSession ? searchOfficeUsers : adminApi.getAdminByName,
            null,
            () => {},
        );

    const { openPopup, closePopup } = usePopup();
    const { isSmallScreen } = useScreenSize();

    const displayList = useMemo(() => {
        if (Array.isArray(adminsData) && adminsData.length) return adminsData;
        return [];
    }, [adminsData]);

    const handleSearch = (query) => {
        SearchAdminByName(query);
    };

    const buttonPressFunction = (query, resultItem) => {
        const foundItem =
            resultItem ||
            (Array.isArray(adminByName) ? adminByName : []).find(
                (admin) => admin.name?.trim() === query?.trim(),
            );
        openPopup(
            <AdminPopup
                adminDetails={foundItem}
                rePerformRequest={performGetAdmins}
                closePopUpFunction={closePopup}
            />,
        );
    };

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    chosenNavKey="allManagers"
                    LogoNavigate={AdminStackName + MainScreenName}
                />
            )}

            <SimpleScrollView>
                <SimpleContainer className="lw-allMangerScreen__row">
                    <SearchInput
                        onSearch={handleSearch}
                        title={
                            isPlatformAdminSession
                                ? t("admins.searchOfficeUser", "חיפוש משתמש משרד")
                                : t("admins.searchAdmin")
                        }
                        titleFontSize={20}
                        getButtonTextFunction={(item) => item.name}
                        className="lw-allMangerScreen__search"
                        isPerforming={isPerformingAdminById}
                        queryResult={Array.isArray(adminByName) ? adminByName : []}
                        buttonPressFunction={(chosen, result) => buttonPressFunction(chosen, result)}
                    />
                </SimpleContainer>

                <AdminsCard
                    adminList={displayList}
                    isPerforming={isPerformingAdminsData}
                    performGetAdmins={performGetAdmins}
                    showOfficeUserColumns={isPlatformAdminSession}
                />
            </SimpleScrollView>

            {!isPlatformAdminSession && (
                <SimpleContainer className="lw-allMangerScreen__footer">
                    <PrimaryButton
                        onPress={() =>
                            openPopup(
                                <AdminPopup rePerformRequest={performGetAdmins} closePopUpFunction={closePopup} />,
                            )
                        }
                    >
                        {t("admins.addAdmin")}
                    </PrimaryButton>
                </SimpleContainer>
            )}
        </SimpleScreen>
    );
}
