import TopToolBarSmallScreen from "../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SearchInput from "../../../components/specializedComponents/containers/SearchInput";
import { getClientNavBarData } from "../../../components/navBars/data/ClientNavBarData";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import ChooseButton from "../../../components/styledComponents/buttons/ChooseButton";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import { useScreenSize } from "../../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import { ClientStackName } from "../../../navigation/ClientStack";
import casesApi, { casesTypeApi } from "../../../api/casesApi";
import ClosedCasesCard from "./components/ClosedCasesCard";
import useHttpRequest from "../../../hooks/useHttpRequest";
import { images } from "../../../assets/images/images";
import OpenCasesCard from "./components/OpenCasesCard";

export const ClientMainScreenName = "/ClientMainScreen";

export default function ClientMainScreen() {
    const { isSmallScreen } = useScreenSize();
    const { result: allCases, isPerforming: isPerformingAllCases } = useAutoHttpRequest(casesApi.getAllCases);
    const { result: allCasesTypes, isPerforming: isPerformingAllCasesTypes } = useAutoHttpRequest(casesTypeApi.getAllCasesTypeForFilter);
    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName);

    const handleSearch = (query) => {
        SearchCaseByName(query);
    };

    if (isPerformingAllCases || isPerformingAllCasesTypes) {
        return <SimpleLoader />;
    }

    console.log('allCases', allCases);


    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={ClientStackName + ClientMainScreenName} GetNavBarData={getClientNavBarData} />}

            <SimpleScrollView>
                {/* <SimpleContainer style={styles.responsiveContainer}>
                    <SearchInput
                        onSearch={handleSearch}
                        title={"חיפוש תיק"}
                        titleFontSize={20}
                        isPerforming={isPerformingCasesById}
                        queryResult={casesByName}
                        getButtonTextFunction={(item) => item.CaseName}
                        style={styles.searchInput}
                    />
                    <ChooseButton style={styles.chooseButton} buttonChoices={allCasesTypes} />
                </SimpleContainer> */}

                <OpenCasesCard
                    openCases={allCases.filter(caseItem => caseItem.IsClosed === false)}
                />

                <ClosedCasesCard
                    closedCases={allCases.filter(caseItem => caseItem.IsClosed === true)}
                    style={{ marginTop: '20px', marginBottom: '20px' }}
                />
            </SimpleScrollView>

        </SimpleScreen >
    );
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
        width: '100%',
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