import { casesApi } from "../../api/casesApi";
import { images } from "../../assets/images/images";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleTable from "../../components/simpleComponents/SimpleTable";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import { Text40 } from "../../components/specializedComponents/text/AllTextKindFile";
import ChooseButton from "../../components/styledComponents/buttons/ChooseButton";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";
import { useScreenSize } from "../../providers/ScreenSizeProvider";

export const AllCasesScreenName = "/AllCases"

export default function AllCasesScreen() {
    const { isSmallScreen } = useScreenSize();
    const { result: allCases, isPerforming: isPerformingAllCases, performRequest } = useAutoHttpRequest(casesApi.getAllCases);
    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName);

    const handleSearch = (query) => {
        SearchCaseByName({ caseName: query });
    };

    if (isPerformingAllCases) {
        return <SimpleLoader />;
    }

    const adjustedData = allCases.map((caseItem) => {
        return {
            Column0: caseItem.CaseName,
            Column1: caseItem.CaseType,
            Column2: caseItem.CompanyName,
            Column3: caseItem.CurrentStage,
        };
    });

    const columns = ["מס' תיק", 'שם לקוח', 'שם החברה', 'סוג התיק', "מס' שלב", 'פעולות'];

    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>
            <SimpleScrollView>
                <SimpleContainer style={styles.responsiveContainer}>
                    <Text40 style={{ alignSelf: 'center', textAlign: 'center', marginLeft: 20 }}>כל התיקים</Text40>
                    <SearchInput
                        onSearch={handleSearch}
                        title={"חיפוש תיק"}
                        titleFontSize={20}
                        getButtonTextFunction={(item) => item.CaseName}
                        style={styles.searchInput}
                    />
                    <ChooseButton style={styles.chooseButton} />
                </SimpleContainer>

                <SimpleCard style={{ marginTop: 32 }}>
                    <SimpleTable
                        titles={columns}
                        data={adjustedData}
                        rePerformRequest={performRequest}
                        noDataMessage={"לא נמצאו תיקים נעוצים"}
                        style={{ width: '100%' }}
                    />
                </SimpleCard>
            </SimpleScrollView>
        </SimpleScreen>
    )
}

const styles = {
    screenStyle: (isSmallScreen) => ({
        paddingTop: isSmallScreen ? 100 : 40,
        paddingRight: 20,
        paddingLeft: 20,
        boxSizing: 'border-box',
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
        flex: '1 1 200px',
        maxWidth: '500px',
    },
    chooseButton: {
        margin: "12px 0px",
        flex: '0 1 auto',
        minWidth: '100px',
    }
}