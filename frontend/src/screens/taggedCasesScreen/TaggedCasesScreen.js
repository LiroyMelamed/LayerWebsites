import React, { useState } from 'react';
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
import CaseFullView from "../../components/styledComponents/cases/CaseFullView";

import "./TaggedCasesScreen.scss";

export const TaggedCasesScreenName = "/TaggedCasesScreen";

export default function TaggedCasesScreen() {
    const { openPopup, closePopup } = usePopup();
    const { isSmallScreen } = useScreenSize();

    const [selectedCaseType, setSelectedCaseType] = useState("הכל");
    const [selectedStatus, setSelectedStatus] = useState("הכל");
    const [filteredTaggedCases, setFilteredTaggedCases] = useState(null);

    const { result: taggedCases, isPerforming: isPerformingTaggedCases, performRequest } = useAutoHttpRequest(casesApi.getAllTaggedCases);
    const { result: allCasesTypes, isPerforming: isPerformingAllCasesTypes } = useAutoHttpRequest(casesTypeApi.getAllCasesTypeForFilter);
    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getTaggedCaseByName, null, () => { });

    const handleSearch = (query) => {
        SearchCaseByName(query);
    };

    const handleSearchSelect = (text, result) => {
        openPopup(
            <CaseFullView
                caseDetails={result}
                rePerformRequest={performRequest}
                closePopUpFunction={closePopup}
            />
        );
    };

    const applyFilters = (typeFilter, statusFilter) => {
        let filtered = taggedCases;

        if (typeFilter !== "הכל") {
            filtered = filtered.filter(item => item.CaseTypeName === typeFilter);
        }

        if (statusFilter === "תיקים פתוחים") {
            filtered = filtered.filter(item => item.IsClosed === false);
        } else if (statusFilter === "תיקים סגורים") {
            filtered = filtered.filter(item => item.IsClosed === true);
        }

        if (typeFilter === "הכל" && statusFilter === "הכל") {
            setFilteredTaggedCases(null);
        } else {
            setFilteredTaggedCases(filtered);
        }
    };

    const handleFilterByType = (type) => {
        setSelectedCaseType(type);
        applyFilters(type, selectedStatus);
    };

    const handleFilterByStatus = (status) => {
        setSelectedStatus(status);
        applyFilters(selectedCaseType, status);
    };

    if (isPerformingTaggedCases || isPerformingAllCasesTypes) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenIndex={0} LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-taggedCasesScreen__row">
                    <SearchInput
                        onSearch={handleSearch}
                        title={"חיפוש תיק נעוץ"}
                        titleFontSize={20}
                        isPerforming={isPerformingCasesById}
                        queryResult={casesByName}
                        getButtonTextFunction={(item) => item.CaseName}
                        className="lw-taggedCasesScreen__search"
                        buttonPressFunction={handleSearchSelect}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-taggedCasesScreen__row">
                    <ChooseButton
                        buttonChoices={allCasesTypes}
                        className="lw-taggedCasesScreen__choose"
                        OnPressChoiceFunction={handleFilterByType}
                    />
                    <ChooseButton
                        buttonChoices={["תיקים סגורים", "תיקים פתוחים"]}
                        className="lw-taggedCasesScreen__choose"
                        OnPressChoiceFunction={handleFilterByStatus}
                        buttonText="סגור/פתוח"
                    />
                </SimpleContainer>

                <PinnedCasesCard
                    taggedCases={filteredTaggedCases || taggedCases}
                    rePerformFunction={performRequest}
                    isPerforming={isPerformingTaggedCases}
                />
            </SimpleScrollView>

            <SimpleContainer className="lw-taggedCasesScreen__footer">
                <PrimaryButton
                    className="lw-taggedCasesScreen__pinButton"
                    onPress={() => openPopup(<TagCasePopup rePerformRequest={() => { performRequest(); closePopup(); }} />)}
                >
                    נעיצת תיק
                </PrimaryButton>
            </SimpleContainer>
        </SimpleScreen>
    );
}
