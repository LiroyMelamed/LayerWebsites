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
import FilterSearchInput from '../../components/specializedComponents/containers/FilterSearchInput';
import PrimaryButton from '../../components/styledComponents/buttons/PrimaryButton';
import TopToolBarSmallScreen from '../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen';
import PinnedCasesCard from './components/PinnedCasesCard';
import { usePopup } from '../../providers/PopUpProvider';
import TagCasePopup from './components/TagCasePopup';
import casesApi, { casesTypeApi } from '../../api/casesApi';
import { MainScreenName } from '../mainScreen/MainScreen';
import { AdminStackName } from '../../navigation/AdminStack';
import CaseFullView from "../../components/styledComponents/cases/CaseFullView";
import { useTranslation } from 'react-i18next';

import "./TaggedCasesScreen.scss";

export const TaggedCasesScreenName = "/TaggedCasesScreen";

export default function TaggedCasesScreen() {
    const { t } = useTranslation();
    const { openPopup, closePopup } = usePopup();
    const { isSmallScreen } = useScreenSize();

    const [selectedCaseType, setSelectedCaseType] = useState(null);
    const [selectedStatus, setSelectedStatus] = useState(null);
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedManager, setSelectedManager] = useState(null);
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

    const applyFilters = (typeFilter, statusFilter, clientFilter, managerFilter) => {
        let filtered = taggedCases;

        if (typeFilter) {
            filtered = filtered.filter(item => item.CaseTypeName === typeFilter);
        }

        if (statusFilter === "open") {
            filtered = filtered.filter(item => item.IsClosed === false);
        } else if (statusFilter === "closed") {
            filtered = filtered.filter(item => item.IsClosed === true);
        }

        if (clientFilter) {
            filtered = filtered.filter(item => {
                if (Array.isArray(item.Users) && item.Users.length > 0) {
                    return item.Users.some(u => u.Name === clientFilter);
                }
                return item.CustomerName === clientFilter;
            });
        }

        if (managerFilter) {
            filtered = filtered.filter(item => item.CaseManager === managerFilter);
        }

        if (!typeFilter && !statusFilter && !clientFilter && !managerFilter) {
            setFilteredTaggedCases(null);
        } else {
            setFilteredTaggedCases(filtered);
        }
    };

    const handleFilterByType = (type) => {
        setSelectedCaseType(type);
        applyFilters(type, selectedStatus, selectedClient, selectedManager);
    };

    const handleFilterByStatus = (status) => {
        setSelectedStatus(status);
        applyFilters(selectedCaseType, status, selectedClient, selectedManager);
    };

    const handleFilterByClient = (client) => {
        setSelectedClient(client);
        applyFilters(selectedCaseType, selectedStatus, client, selectedManager);
    };

    const handleFilterByManager = (manager) => {
        setSelectedManager(manager);
        applyFilters(selectedCaseType, selectedStatus, selectedClient, manager);
    };

    const clientNames = [...new Set((taggedCases || []).flatMap(c => {
        if (Array.isArray(c.Users) && c.Users.length > 0) return c.Users.map(u => u.Name);
        return [c.CustomerName];
    }).filter(Boolean))].sort();
    const managerNames = [...new Set((taggedCases || []).map(c => c.CaseManager).filter(Boolean))].sort();

    if (isPerformingTaggedCases || isPerformingAllCasesTypes) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenNavKey="pinnedCases" LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-taggedCasesScreen__topRow">
                    <SearchInput
                        onSearch={handleSearch}
                        title={t('taggedCases.searchPinnedCaseTitle')}
                        titleFontSize={20}
                        isPerforming={isPerformingCasesById}
                        queryResult={casesByName}
                        getButtonTextFunction={(item) => item.CaseName}
                        className="lw-taggedCasesScreen__search"
                        buttonPressFunction={handleSearchSelect}
                    />

                    <FilterSearchInput
                        items={clientNames}
                        placeholder={t('cases.customerName')}
                        titleFontSize={20}
                        onSelect={handleFilterByClient}
                        className="lw-taggedCasesScreen__clientFilter"
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-taggedCasesScreen__filtersRow">
                    <ChooseButton
                        buttonText={t('cases.statusFilter')}
                        items={[
                            { value: 'closed', label: t('cases.closedCases') },
                            { value: 'open', label: t('cases.openCases') },
                        ]}
                        className="lw-taggedCasesScreen__choose"
                        OnPressChoiceFunction={handleFilterByStatus}
                    />

                    <ChooseButton
                        buttonText={t('cases.caseType')}
                        items={(allCasesTypes || []).map((ct) => ({ value: ct, label: ct }))}
                        className="lw-taggedCasesScreen__choose"
                        OnPressChoiceFunction={handleFilterByType}
                    />

                    <ChooseButton
                        buttonText={t('cases.caseManager')}
                        items={managerNames.map((name) => ({ value: name, label: name }))}
                        className="lw-taggedCasesScreen__choose"
                        OnPressChoiceFunction={handleFilterByManager}
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
                    onPress={() => openPopup(<TagCasePopup rePerformRequest={() => { performRequest(); closePopup(); }} />)}
                >
                    {t('taggedCases.pinCase')}
                </PrimaryButton>
            </SimpleContainer>
        </SimpleScreen>
    );
}
