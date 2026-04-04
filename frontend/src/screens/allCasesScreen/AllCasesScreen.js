import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import casesApi, { casesTypeApi } from "../../api/casesApi";
import { images } from "../../assets/images/images";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import ChooseButton from "../../components/styledComponents/buttons/ChooseButton";
import FilterSearchInput from "../../components/specializedComponents/containers/FilterSearchInput";

import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import { AdminStackName } from "../../navigation/AdminStack";

import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { MainScreenName } from "../mainScreen/MainScreen";
import AllCasesCard from "./components/AllCasesCard";
import { useTranslation } from "react-i18next";

import "./AllCasesScreen.scss";

export const AllCasesScreenName = "/AllCasesScreen";

export default function AllCasesScreen() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const initialStatus = searchParams.get('status') === 'closed' ? 'closed' : 'open';

    const { isSmallScreen } = useScreenSize();
    const [selectedCaseType, setSelectedCaseType] = useState(null);
    const [selectedStatus, setSelectedStatus] = useState(initialStatus);
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedManager, setSelectedManager] = useState(null);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [selectedCaseName, setSelectedCaseName] = useState(null);
    const [filteredCases, setFilteredCases] = useState(null);

    const { result: allCasesTypes, isPerforming: isPerformingAllCasesTypes } = useAutoHttpRequest(casesTypeApi.getAllCasesTypeForFilter);
    const { result: allCases, isPerforming: isPerformingAllCases, performRequest: reperformAfterSave } = useAutoHttpRequest(casesApi.getAllCases);

    const [initialFilterApplied, setInitialFilterApplied] = useState(false);
    useEffect(() => {
        if (allCases?.length > 0 && !initialFilterApplied) {
            setInitialFilterApplied(true);
            if (selectedStatus === "open") {
                setFilteredCases(allCases.filter(item => item.IsClosed === false));
            } else if (selectedStatus === "closed") {
                setFilteredCases(allCases.filter(item => item.IsClosed === true));
            }
        }
    }, [allCases, initialFilterApplied, selectedStatus]);

    const handleFilterByCaseName = (caseName) => {
        setSelectedCaseName(caseName);
        applyFilters(selectedCaseType, selectedStatus, selectedClient, selectedManager, selectedCompany, caseName);
    };

    const applyFilters = (typeFilter, statusFilter, clientFilter, managerFilter, companyFilter, caseNameFilter) => {
        let filtered = allCases;

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
            setFilteredCases(null);
        } else {
            setFilteredCases(filtered);
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

    const caseNames = [...new Set((allCases || []).map(c => c.CaseName).filter(Boolean))].sort();
    const clientNames = [...new Set((allCases || []).flatMap(c => {
        if (Array.isArray(c.Users) && c.Users.length > 0) return c.Users.map(u => u.Name);
        return [c.CustomerName];
    }).filter(Boolean))].sort();
    const managerNames = [...new Set((allCases || []).map(c => c.CaseManager).filter(Boolean))].sort();
    const companyNames = [...new Set((allCases || []).map(c => c.CompanyName).filter(Boolean))].sort();

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenNavKey="allCases" LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-allCasesScreen__filtersRow">
                    <ChooseButton
                        buttonText={t('cases.statusFilter')}
                        items={[
                            { value: 'closed', label: t('cases.closedCases') },
                            { value: 'open', label: t('cases.openCases') },
                        ]}
                        defaultValue={initialStatus}
                        className="lw-allCasesScreen__choose lw-allCasesScreen__choose--openClose"
                        OnPressChoiceFunction={handleFilterByStatus}
                    />

                    <ChooseButton
                        buttonText={t('cases.caseType')}
                        items={(allCasesTypes || []).map((ct) => ({ value: ct, label: ct }))}
                        className="lw-allCasesScreen__choose"
                        OnPressChoiceFunction={handleFilterByType}
                    />

                    <ChooseButton
                        buttonText={t('cases.caseManager')}
                        items={managerNames.map((name) => ({ value: name, label: name }))}
                        className="lw-allCasesScreen__choose"
                        OnPressChoiceFunction={handleFilterByManager}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-allCasesScreen__topRow">
                    <FilterSearchInput
                        items={caseNames}
                        placeholder={t('cases.searchCaseTitle')}
                        titleFontSize={20}
                        onSelect={handleFilterByCaseName}
                        className="lw-allCasesScreen__search"
                    />

                    <FilterSearchInput
                        items={clientNames}
                        placeholder={t('cases.customerName')}
                        titleFontSize={20}
                        onSelect={handleFilterByClient}
                        className="lw-allCasesScreen__clientFilter"
                    />

                    <FilterSearchInput
                        items={companyNames}
                        placeholder={t('cases.companyName')}
                        titleFontSize={20}
                        onSelect={handleFilterByCompany}
                        className="lw-allCasesScreen__companyFilter"
                    />
                </SimpleContainer>

                <AllCasesCard
                    allCases={filteredCases || allCases}
                    reperformAfterSave={reperformAfterSave}
                    isPerforming={isPerformingAllCases}
                />
            </SimpleScrollView>


        </SimpleScreen>
    )
}
