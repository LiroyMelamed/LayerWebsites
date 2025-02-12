import { adminApi } from "../../api/adminApi";
import { images } from "../../assets/images/images";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import ChooseButton from "../../components/styledComponents/buttons/ChooseButton";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";
import { usePopup } from "../../providers/PopUpProvider";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import AdminPopup from "./components/AdminPopup";
import AdminsCard from "./components/AdminsCard";

export const AllMangerScreenName = "/AllManger"

export default function AllMangerScreen() {
    const { result: adminsData, isPerforming: isPerformingAdminsData, performRequest: performGetAdmins } = useAutoHttpRequest(adminApi.getAllAdmins);
    const { result: adminByName, isPerforming: isPerformingAdminById, performRequest: SearchAdminByName } = useHttpRequest(adminApi.getAdminByName);

    const { openPopup, closePopup } = usePopup();

    const { isSmallScreen } = useScreenSize();

    const handleSearch = (query) => {
        SearchAdminByName(query);
    };

    const buttonPressFunction = (query) => {
        const foundItem = adminByName.find(admin => admin.Name === query);
        openPopup(<AdminPopup adminDetails={foundItem} rePerformRequest={performGetAdmins} closePopUpFunction={closePopup} />)
    }

    if (isPerformingAdminsData) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenIndex={3} />}

            <SimpleScrollView>
                <SimpleContainer style={styles.responsiveContainer}>
                    <SearchInput
                        onSearch={handleSearch}
                        title={"חיפוש מנהל"}
                        titleFontSize={20}
                        getButtonTextFunction={(item) => item.Name}
                        style={styles.searchInput}
                        isPerforming={isPerformingAdminById}
                        queryResult={adminByName}
                        buttonPressFunction={(chosen) => buttonPressFunction(chosen)}
                    />
                    <ChooseButton style={styles.chooseButton} buttonText="סוג הרשאות" />
                </SimpleContainer>

                <AdminsCard
                    adminList={adminsData}
                />
            </SimpleScrollView>

            <SimpleContainer style={{ display: 'flex', justifyContent: 'center' }}>
                <PrimaryButton style={{ margin: '8px 0px', selfAlign: 'center' }} onPress={() => openPopup(<AdminPopup rePerformRequest={performGetAdmins} closePopUpFunction={closePopup} />)}>הוסף מנהל</PrimaryButton>
            </SimpleContainer>
        </SimpleScreen>
    )
}

const styles = {
    screenStyle: () => ({
        boxSizing: 'border-box',
        flexDirection: 'column',
    }),
    responsiveContainer: {
        display: 'flex',
        flexDirection: 'row-reverse',
        alignItems: 'center',
        flexWrap: 'wrap',
        maxWidth: '100%',
        overflow: 'hidden',
    },
    searchInput: {
        margin: "12px 0px",
        marginLeft: 20,
        maxWidth: '500px',
    },
    chooseButton: {
        margin: "12px 0px",
        flex: '0 1 auto',
        minWidth: '100px',
    }
}