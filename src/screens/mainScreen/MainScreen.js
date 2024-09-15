import React from 'react';
import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import { Text40 } from '../../components/specializedComponents/text/AllTextKindFile';
import { icons } from '../../assets/icons/icons';
import SearchInput from '../../components/specializedComponents/containers/SearchInput';
import SimpleScrollView from '../../components/simpleComponents/SimpleScrollView';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import colors from '../../constant/colors';
import SimpleCard from '../../components/simpleComponents/SimpleCard';
import SimpleTable from '../../components/simpleComponents/SimpleTable';
import useAutoHttpRequest from '../../hooks/useAutoHttpRequest';
import { casesApi } from '../../api/casesApi';
import useHttpRequest from '../../hooks/useHttpRequest';
import { images } from '../../assets/images/images';
import SimpleLoader from '../../components/simpleComponents/SimpleLoader';

export const MainScreenName = "/MainScreen";

export default function MainScreen() {
    const { isSmallScreen } = useScreenSize();
    const { result: taggedCases, isPerforming: isPerformingTaggedCases, performRequest } = useAutoHttpRequest(casesApi.getAllTagedCases);
    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName);

    const handleSearch = (query) => {
        SearchCaseByName({ caseName: query });
    };

    if (isPerformingTaggedCases) {
        return <SimpleLoader />
    }

    const adjustedData = taggedCases.map((caseItem) => {
        return {
            Column0: caseItem.CaseName,
            Column1: caseItem.CaseType,
            Column2: caseItem.CompanyName,
            Column3: caseItem.CurrentStage,
        };
    });

    const columns = ["מס' תיק", 'סוג תיק', 'שם חברה', 'שלב נוכחי'];

    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>
            <SimpleScrollView>
                <SearchInput
                    rightIcon={icons.Search.MagnifyingGlass}
                    onSearch={handleSearch}
                    tintColor={colors.text}
                    title={"חיפוש תיק"}
                    textStyle={{ textAlign: 'center' }}
                    titleFontSize={20}
                    isPerforming={isPerformingCasesById}
                    queryResult={casesByName}
                    getButtonTextFunction={(item) => item.CaseName}
                />

                <SimpleCard style={{ marginTop: 32 }}>
                    <Text40 style={{ alignSelf: 'center' }}>תיקים נעוצים</Text40>
                    <SimpleTable
                        titles={columns}
                        data={adjustedData}
                        rePerformRequest={performRequest}
                        noDataMessage={"לא נמצאו תיקים נעוצים"}
                        style={{ marginTop: 40, width: '100%' }}
                    />
                </SimpleCard>


            </SimpleScrollView>
        </SimpleScreen>
    );
}

const styles = {
    screenStyle: (isSmallScreen) => ({
        paddingTop: isSmallScreen ? 80 : 40,
        paddingRight: 20,
        paddingLeft: 20,
    }),
};
