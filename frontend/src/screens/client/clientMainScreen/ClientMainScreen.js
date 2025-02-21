import casesApi from "../../../api/casesApi";
import { images } from "../../../assets/images/images";
import ClientTopToolBarSmallScreen from "../../../components/navBars/topToolBarSmallScreen/ClientTopToolBarSmallScreen";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SearchInput from "../../../components/specializedComponents/containers/SearchInput";
import ChooseButton from "../../../components/styledComponents/buttons/ChooseButton";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../../hooks/useHttpRequest";
import { ClientStackName } from "../../../navigation/ClientStack";
import { usePopup } from "../../../providers/PopUpProvider";
import { useScreenSize } from "../../../providers/ScreenSizeProvider";
import ClosedCasesCard from "./components/ClosedCasesCard";
import OpenCasesCard from "./components/OpenCasesCard";

export const ClientMainScreenName = "/ClientMainScreen";

export default function ClientMainScreen() {
    const { isSmallScreen } = useScreenSize();
    const { openPopup, closePopup } = usePopup();
    const { result: allCases, isPerforming: isPerformingAllCases, performRequest: reperformAfterSave } = useAutoHttpRequest(casesApi.getAllCases);
    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName);

    const handleSearch = (query) => {
        SearchCaseByName(query);
    };

    if (isPerformingAllCases) {
        return <SimpleLoader />;
    }

    console.log('allCases', allCases);


    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <ClientTopToolBarSmallScreen LogoNavigate={ClientStackName + ClientMainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer style={styles.responsiveContainer}>
                    <SearchInput
                        onSearch={handleSearch}
                        title={"חיפוש תיק"}
                        titleFontSize={20}
                        isPerforming={isPerformingCasesById}
                        queryResult={casesByName}
                        getButtonTextFunction={(item) => item.CaseName}
                        style={styles.searchInput}
                    />
                    <ChooseButton style={styles.chooseButton} />
                </SimpleContainer>

                <OpenCasesCard
                    openCases={allCases.filter(caseItem => caseItem.IsClosed === false)}
                />

                <ClosedCasesCard
                    closedCases={allCases.filter(caseItem => caseItem.IsClosed === true)}
                    style={{ marginTop: 16 }}
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