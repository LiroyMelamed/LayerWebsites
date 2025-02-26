import React from 'react';
import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import SearchInput from '../../components/specializedComponents/containers/SearchInput';
import SimpleScrollView from '../../components/simpleComponents/SimpleScrollView';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import useAutoHttpRequest from '../../hooks/useAutoHttpRequest';
import useHttpRequest from '../../hooks/useHttpRequest';
import { images } from '../../assets/images/images';
import SimpleLoader from '../../components/simpleComponents/SimpleLoader';
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import ChooseButton from '../../components/styledComponents/buttons/ChooseButton';
import PrimaryButton from '../../components/styledComponents/buttons/PrimaryButton';
import TopToolBarSmallScreen from '../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen';
import PinnedCasesCard from './components/PinnedCasesCard';
import { usePopup } from '../../providers/PopUpProvider';
import TagCasePopup from './components/TagCasePopup';
import casesApi, { casesTypeApi } from '../../api/casesApi';
import { MainScreenName } from '../mainScreen/MainScreen';
import { AdminStackName } from '../../navigation/AdminStack';

export const TaggedCasesScreenName = "/TaggedCasesScreen";

export default function TaggedCasesScreen() {
    const { openPopup } = usePopup();
    const { isSmallScreen } = useScreenSize();
    const { result: taggedCases, isPerforming: isPerformingTaggedCases, performRequest } = useAutoHttpRequest(casesApi.getAllTaggedCases);
    const { result: allCasesTypes, isPerforming: isPerformingAllCasesTypes } = useAutoHttpRequest(casesTypeApi.getAllCasesTypeForFilter);
    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getTaggedCaseByName, null, () => { });

    const handleSearch = (query) => {
        SearchCaseByName(query);
    };

    if (isPerformingTaggedCases || isPerformingAllCasesTypes) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenIndex={0} LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer style={styles.responsiveContainer}>
                    <SearchInput
                        onSearch={handleSearch}
                        title={"חיפוש תיק נעוץ"}
                        titleFontSize={20}
                        isPerforming={isPerformingCasesById}
                        queryResult={casesByName}
                        getButtonTextFunction={(item) => item.CaseName}
                        style={styles.searchInput}
                    />
                    <ChooseButton
                        buttonChoices={allCasesTypes}
                        style={styles.chooseButton}
                    />
                </SimpleContainer>

                <PinnedCasesCard
                    taggedCases={taggedCases}
                    rePerformFunction={performRequest}
                />

            </SimpleScrollView>
            <SimpleContainer style={{ display: 'flex', justifyContent: 'center' }}>
                <PrimaryButton style={{ margin: '8px 0px', selfAlign: 'center' }} onPress={() => openPopup(<TagCasePopup rePerformRequest={performRequest} />)}>נעיצת תיק</PrimaryButton>
            </SimpleContainer>
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
};
