import React, { useState, useEffect } from 'react';
import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import SimpleScrollView from '../../components/simpleComponents/SimpleScrollView';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import useAutoHttpRequest from '../../hooks/useAutoHttpRequest';
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
import { useTranslation } from 'react-i18next';

import "./TaggedCasesScreen.scss";

export const TaggedCasesScreenName = "/TaggedCasesScreen";

export default function TaggedCasesScreen() {
    const { t } = useTranslation();
    const { openPopup, closePopup } = usePopup();
    const { isSmallScreen } = useScreenSize();

    const [selectedCaseType, setSelectedCaseType] = useState(null);
    const [selectedStatus, setSelectedStatus] = useState('open');
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedManager, setSelectedManager] = useState(null);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [selectedCaseName, setSelectedCaseName] = useState(null);
    const [filteredTaggedCases, setFilteredTaggedCases] = useState(null);

    const { result: taggedCases, isPerforming: isPerformingTaggedCases, performRequest } = useAutoHttpRequest(casesApi.getAllTaggedCases);

    // Apply initial 'open' filter when data loads
    useEffect(() => {
        if (taggedCases && taggedCases.length > 0) {
            applyFilters(selectedCaseType, 'open', selectedClient, selectedManager, selectedCompany, selectedCaseName);
        }
    }, [taggedCases]);
    const { result: allCasesTypes, isPerforming: isPerformingAllCasesTypes } = useAutoHttpRequest(casesTypeApi.getAllCasesTypeForFilter);

    const handleFilterByCaseName = (caseName) => {
        setSelectedCaseName(caseName);
        applyFilters(selectedCaseType, selectedStatus, selectedClient, selectedManager, selectedCompany, caseName);
    };

    const applyFilters = (typeFilter, statusFilter, clientFilter, managerFilter, companyFilter, caseNameFilter) => {
        let filtered = taggedCases;

        if (caseNameFilter) {
            filtered = filtered.filter(item =>
                item.CaseName && item.CaseName.toLowerCase().includes(caseNameFilter.toLowerCase())
            );
        }

        if (typeFilter) {
            filtered = filtered.filter(item => item.CaseTypeName === typeFilter);
        }

        if (statusFilter === "open") {
            filtered = filtered.filter(item => item.IsClosed === false);
        } else if (statusFilter === "closed") {
            filtered = filtered.filter(item => item.IsClosed === true);
        }

        if (clientFilter) {
            const q = clientFilter.toLowerCase();
            filtered = filtered.filter(item => {
                if (Array.isArray(item.Users) && item.Users.length > 0) {
                    return item.Users.some(u => u.Name && u.Name.toLowerCase().includes(q));
                }
                return item.CustomerName && item.CustomerName.toLowerCase().includes(q);
            });
        }

        if (managerFilter) {
            filtered = filtered.filter(item => item.CaseManager === managerFilter);
        }

        if (companyFilter) {
            filtered = filtered.filter(item =>
                item.CompanyName && item.CompanyName.toLowerCase().includes(companyFilter.toLowerCase())
            );
        }

        if (!typeFilter && !statusFilter && !clientFilter && !managerFilter && !companyFilter && !caseNameFilter) {
            setFilteredTaggedCases(null);
        } else {
            setFilteredTaggedCases(filtered);
        }
    };

    const handleFilterByType = (type) => {
        setSelectedCaseType(type);
        applyFilters(type, selectedStatus, selectedClient, selectedManager, selectedCompany, selectedCaseName);
    };

    const handleFilterByStatus = (status) => {
        setSelectedStatus(status);
        applyFilters(selectedCaseType, status, selectedClient, selectedManager, selectedCompany, selectedCaseName);
    };

    const handleFilterByClient = (client) => {
        setSelectedClient(client);
        applyFilters(selectedCaseType, selectedStatus, client, selectedManager, selectedCompany, selectedCaseName);
    };

    const handleFilterByManager = (manager) => {
        setSelectedManager(manager);
        applyFilters(selectedCaseType, selectedStatus, selectedClient, manager, selectedCompany, selectedCaseName);
    };

    const handleFilterByCompany = (company) => {
        setSelectedCompany(company);
        applyFilters(selectedCaseType, selectedStatus, selectedClient, selectedManager, company, selectedCaseName);
    };

    const caseNames = [...new Set((taggedCases || []).map(c => c.CaseName).filter(Boolean))].sort();
    const clientNames = [...new Set((taggedCases || []).flatMap(c => {
        if (Array.isArray(c.Users) && c.Users.length > 0) return c.Users.map(u => u.Name);
        return [c.CustomerName];
    }).filter(Boolean))].sort();
    const managerNames = [...new Set((taggedCases || []).map(c => c.CaseManager).filter(Boolean))].sort();
    const companyNames = [...new Set((taggedCases || []).map(c => c.CompanyName).filter(Boolean))].sort();

    if (isPerformingTaggedCases || isPerformingAllCasesTypes) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenNavKey="pinnedCases" LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-taggedCasesScreen__topRow">
                    <FilterSearchInput
                        items={caseNames}
                        placeholder={t('taggedCases.searchPinnedCaseTitle')}
                        titleFontSize={20}
                        onSelect={handleFilterByCaseName}
                        className="lw-taggedCasesScreen__search"
                    />

                    <FilterSearchInput
                        items={clientNames}
                        placeholder={t('cases.customerName')}
                        titleFontSize={20}
                        onSelect={handleFilterByClient}
                        className="lw-taggedCasesScreen__clientFilter"
                    />

                    <FilterSearchInput
                        items={companyNames}
                        placeholder={t('cases.companyName')}
                        titleFontSize={20}
                        onSelect={handleFilterByCompany}
                        className="lw-taggedCasesScreen__companyFilter"
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
                        defaultValue={'open'}
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
