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
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import ChooseButton from '../../components/styledComponents/buttons/ChooseButton';
import PrimaryButton from '../../components/styledComponents/buttons/PrimaryButton';
import PinnedCasesCard from './components/PinnedCasesCard';

export const MainScreenName = "/MainScreen";

export default function MainScreen() {
    const { isSmallScreen } = useScreenSize();
    const { result: taggedCases, isPerforming: isPerformingTaggedCases, performRequest } = useAutoHttpRequest(casesApi.getAllTagedCases);
    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName);

    const handleSearch = (query) => {
        SearchCaseByName({ caseName: query });
    };

    if (isPerformingTaggedCases) {
        return <SimpleLoader />;
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

                {/* <SimpleCard style={{ marginTop: 32 }}>
                    <SimpleTable
                        titles={columns}
                        data={adjustedData}
                        rePerformRequest={performRequest}
                        noDataMessage={"לא נמצאו תיקים נעוצים"}
                        style={{ width: '100%' }}
                    />
                </SimpleCard> */}

                <PinnedCasesCard
                    taggedCases={taggedCases}
                />

                <SimpleContainer style={{ display: 'flex', justifyContent: 'center' }}>
                    <PrimaryButton style={{ marginTop: 32, selfAlign: 'center' }} >הוספת תיק חדש</PrimaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen >
    );
}

const styles = {
    screenStyle: (isSmallScreen) => ({
        paddingTop: 40,
        paddingRight: 20,
        paddingLeft: 20,
        boxSizing: 'border-box',
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
};
