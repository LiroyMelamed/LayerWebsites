import { casesTypeApi } from "../../api/casesApi";
import { images } from "../../assets/images/images";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import { Text40 } from "../../components/specializedComponents/text/AllTextKindFile";
import ChooseButton from "../../components/styledComponents/buttons/ChooseButton";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import CaseTypeFullView from "../../components/styledComponents/cases/CaseTypeFullView";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";
import { usePopup } from "../../providers/PopUpProvider";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import AllCasesTypeCard from "./components/AllCasesTypeCard";

export const AllCasesTypeScreenName = "/AllCasesType"

export default function AllCasesTypeScreen() {
    const { openPopup } = usePopup();
    const { isSmallScreen } = useScreenSize();
    const { result: allCasesType, isPerforming: isPerformingAllCasesType, performRequest: reperformAfterSave } = useAutoHttpRequest(casesTypeApi.getAllCasesType);
    const { result: casesTypeByName, isPerforming: isPerformingCasesTypeById, performRequest: SearchCaseTypeByName } = useHttpRequest(casesTypeApi.getCaseTypeByName);

    const handleSearch = (query) => {
        SearchCaseTypeByName({ caseName: query });
    };

    if (isPerformingAllCasesType) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenIndex={5} />}

            <SimpleScrollView>
                <SimpleContainer style={styles.responsiveContainer}>
                    <SearchInput
                        onSearch={handleSearch}
                        title={"חיפוש סוג תיק"}
                        titleFontSize={20}
                        isPerforming={isPerformingCasesTypeById}
                        queryResult={casesTypeByName}
                        getButtonTextFunction={(item) => item.CaseName}
                        style={styles.searchInput}
                    />
                    <ChooseButton style={styles.chooseButton} buttonText="כמות שלבים" />
                </SimpleContainer>

                <AllCasesTypeCard
                    allCasesType={allCasesType}
                    reperformAfterSave={reperformAfterSave}
                />
            </SimpleScrollView>
            <SimpleContainer style={{ display: 'flex', justifyContent: 'center' }}>
                <PrimaryButton style={{ margin: '8px 0px', selfAlign: 'center' }} onPress={() => openPopup(<CaseTypeFullView onFailureFunction={() => { }} caseTypeName={null} />)}>הוספת סוג תיק</PrimaryButton>
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
        flex: '1 1 200px',
        maxWidth: '500px',
    },
    chooseButton: {
        margin: "12px 0px",
        flex: '0 1 auto',
        minWidth: '100px',
    }
}