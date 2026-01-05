import { adminApi } from "../../api/adminApi";
import { images } from "../../assets/images/images";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";
import { AdminStackName } from "../../navigation/AdminStack";
import { usePopup } from "../../providers/PopUpProvider";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { MainScreenName } from "../mainScreen/MainScreen";
import AdminPopup from "./components/AdminPopup";
import AdminsCard from "./components/AdminsCard";

import "./AllMangerScreen.scss";

export const AllMangerScreenName = "/AllManger"

export default function AllMangerScreen() {
    const { result: adminsData, isPerforming: isPerformingAdminsData, performRequest: performGetAdmins } = useAutoHttpRequest(adminApi.getAllAdmins);
    const { result: adminByName, isPerforming: isPerformingAdminById, performRequest: SearchAdminByName } = useHttpRequest(adminApi.getAdminByName, null, () => { });

    const { openPopup, closePopup } = usePopup();

    const { isSmallScreen } = useScreenSize();

    const handleSearch = (query) => {
        SearchAdminByName(query);
    };

    const buttonPressFunction = (query) => {
        const foundItem = adminByName.find(admin => admin.name === query);
        openPopup(<AdminPopup adminDetails={foundItem} rePerformRequest={performGetAdmins} closePopUpFunction={closePopup} />)
    }
    if (isPerformingAdminsData) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenIndex={4} LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-allMangerScreen__row">
                    <SearchInput
                        onSearch={handleSearch}
                        title={"חיפוש מנהל"}
                        titleFontSize={20}
                        getButtonTextFunction={(item) => item.name}
                        className="lw-allMangerScreen__search"
                        isPerforming={isPerformingAdminById}
                        queryResult={adminByName}
                        buttonPressFunction={(chosen) => buttonPressFunction(chosen)}
                    />
                </SimpleContainer>

                <AdminsCard
                    adminList={adminsData}
                    isPerforming={isPerformingAdminsData}
                    performGetAdmins={performGetAdmins}
                />
            </SimpleScrollView>

            <SimpleContainer className="lw-allMangerScreen__footer">
                <PrimaryButton
                    onPress={() => openPopup(<AdminPopup rePerformRequest={performGetAdmins} closePopUpFunction={closePopup} />)}
                >
                    הוסף מנהל
                </PrimaryButton>
            </SimpleContainer>
        </SimpleScreen>
    )
}
