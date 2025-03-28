import { casesTypeApi } from "../../api/casesApi";
import { images } from "../../assets/images/images";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import ChooseButton from "../../components/styledComponents/buttons/ChooseButton";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import CaseTypeFullView from "../../components/styledComponents/cases/CaseTypeFullView";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";
import { AdminStackName } from "../../navigation/AdminStack";
import { usePopup } from "../../providers/PopUpProvider";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { MainScreenName } from "../mainScreen/MainScreen";
import AllCasesTypeCard from "./components/AllCasesTypeCard";

export const AllCasesTypeScreenName = "/AllCasesType"

export default function AllCasesTypeScreen() {
    const { openPopup, closePopup } = usePopup();
    const { isSmallScreen } = useScreenSize();
    const { result: allCasesType, isPerforming: isPerformingAllCasesType, performRequest: reperformAfterSave } = useAutoHttpRequest(casesTypeApi.getAllCasesType);
    const { result: casesTypeByName, isPerforming: isPerformingCasesTypeById, performRequest: SearchCaseTypeByName } = useHttpRequest(casesTypeApi.getCaseTypeByName, null, () => { });

    const handleSearch = (query) => {
        SearchCaseTypeByName(query);
    };

    const handleButtonPress = (query) => {
        const foundItem = casesTypeByName.find(caseType => caseType.CaseTypeName === query);
        console.log(reperformAfterSave, closePopup);

        openPopup(<CaseTypeFullView onFailureFunction={() => { }} caseTypeDetails={foundItem} rePerformRequest={() => reperformAfterSave()} closePopUpFunction={() => closePopup()} />)
    }

    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenIndex={5} LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer style={styles.responsiveContainer}>
                    <SearchInput
                        onSearch={handleSearch}
                        title={"חיפוש סוג תיק"}
                        titleFontSize={20}
                        isPerforming={isPerformingCasesTypeById}
                        queryResult={casesTypeByName}
                        getButtonTextFunction={(item) => item.CaseTypeName}
                        style={styles.searchInput}
                        buttonPressFunction={(chosen) => handleButtonPress(chosen)}
                    />
                    <ChooseButton style={styles.chooseButton} buttonText="כמות שלבים" buttonChoices={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]} />
                </SimpleContainer>

                <AllCasesTypeCard
                    allCasesType={allCasesType}
                    reperformAfterSave={reperformAfterSave}
                    isPerforming={isPerformingAllCasesType}
                />
            </SimpleScrollView>
            <SimpleContainer style={{ display: 'flex', justifyContent: 'center' }}>
                <PrimaryButton style={{ margin: '8px 0px', selfAlign: 'center' }} onPress={() => openPopup(<CaseTypeFullView onFailureFunction={() => { }} caseTypeName={null} closePopUpFunction={closePopup} rePerformRequest={reperformAfterSave} />)}>הוספת סוג תיק</PrimaryButton>
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