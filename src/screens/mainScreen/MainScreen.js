import React from 'react';
import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import { Text40 } from '../../components/specializedComponents/text/AllTextKindFile';
import { icons } from '../../assets/icons/icons';
import SearchInput from '../../components/specializedComponents/search/SearchInput';
import SimpleScrollView from '../../components/simpleComponents/SimpleScrollView';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import colors from '../../constant/colors';
import SimpleCard from '../../components/simpleComponents/SimpleCard';
import SimpleTable from '../../components/simpleComponents/SimpleTable';
import useAutoHttpRequest from '../../hooks/useAutoHttpRequest';
import { casesApi } from '../../api/casesApi';
import useHttpRequest from '../../hooks/useHttpRequest';

export const MainScreenName = "/MainScreen";

export default function MainScreen() {
    const { isSmallScreen } = useScreenSize();
    const { result: taggedCases, isPerforming: isPerformingTaggedCases } = useAutoHttpRequest(casesApi.getAllTagedCases);
    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName);

    const handleSearch = (query) => {
        SearchCaseByName(query)
    };

    const columns = ["מס' תיק", 'סוג תיק', 'שם חברה', 'שלב נוכחי'];

    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)}>
            <SimpleScrollView>
                <SearchInput
                    rightIcon={icons.Search.MagnifyingGlass}
                    onSearch={handleSearch}
                    tintColor={colors.text}
                    placeholder={"חיפוש תיק"}
                    textStyle={{ textAlign: 'center' }}
                />

                <SimpleCard style={{ marginTop: 32 }}>
                    <Text40 style={{ alignSelf: 'center' }}>תיקים נעוצים</Text40>
                </SimpleCard>

                <SimpleTable
                    titles={columns}
                    data={taggedCases}
                    isLoading={isPerformingTaggedCases}
                    noDataMessage="לא נמצאו תיקים נעוצים"
                    style={{ marginTop: 32 }}
                />
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
