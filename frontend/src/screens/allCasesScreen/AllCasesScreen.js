import { useState } from "react";
import casesApi, { casesTypeApi } from "../../api/casesApi";
import { images } from "../../assets/images/images";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import ChooseButton from "../../components/styledComponents/buttons/ChooseButton";
import FilterSearchInput from "../../components/specializedComponents/containers/FilterSearchInput";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import CaseFullView from "../../components/styledComponents/cases/CaseFullView";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";
import { AdminStackName } from "../../navigation/AdminStack";
import { usePopup } from "../../providers/PopUpProvider";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { MainScreenName } from "../mainScreen/MainScreen";
import AllCasesCard from "./components/AllCasesCard";
import { useTranslation } from "react-i18next";

import "./AllCasesScreen.scss";

export const AllCasesScreenName = "/AllCasesScreen";

export default function AllCasesScreen() {
    const { t } = useTranslation();
    const { openPopup, closePopup } = usePopup();
    const { isSmallScreen } = useScreenSize();
    const [selectedCaseType, setSelectedCaseType] = useState(null);
    const [selectedStatus, setSelectedStatus] = useState(null);
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedManager, setSelectedManager] = useState(null);
    const [filteredCases, setFilteredCases] = useState(null);

    const { result: allCasesTypes, isPerforming: isPerformingAllCasesTypes } = useAutoHttpRequest(casesTypeApi.getAllCasesTypeForFilter);
    const { result: allCases, isPerforming: isPerformingAllCases, performRequest: reperformAfterSave } = useAutoHttpRequest(casesApi.getAllCases);
    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName, null, () => { });

    const handleSearch = (query) => {
        SearchCaseByName(query);
    };

    const handleSearchSelect = (text, result) => {
        openPopup(
            <CaseFullView
                caseDetails={result}
                rePerformRequest={reperformAfterSave}
                closePopUpFunction={closePopup}
            />
        );
    };

    const applyFilters = (typeFilter, statusFilter, clientFilter, managerFilter) => {
        let filtered = allCases;

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
            setFilteredCases(null);
        } else {
            setFilteredCases(filtered);
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

    const clientNames = [...new Set((allCases || []).flatMap(c => {
        if (Array.isArray(c.Users) && c.Users.length > 0) return c.Users.map(u => u.Name);
        return [c.CustomerName];
    }).filter(Boolean))].sort();
    const managerNames = [...new Set((allCases || []).map(c => c.CaseManager).filter(Boolean))].sort();

    if (isPerformingAllCases || isPerformingAllCasesTypes) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenNavKey="allCases" LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-allCasesScreen__topRow">
                    <SearchInput
                        onSearch={handleSearch}
                        title={t('cases.searchCaseTitle')}
                        titleFontSize={20}
                        isPerforming={isPerformingCasesById}
                        queryResult={casesByName}
                        getButtonTextFunction={(item) => item.CaseName}
                        className="lw-allCasesScreen__search"
                        buttonPressFunction={handleSearchSelect}
                    />

                    <FilterSearchInput
                        items={clientNames}
                        placeholder={t('cases.customerName')}
                        titleFontSize={20}
                        onSelect={handleFilterByClient}
                        className="lw-allCasesScreen__clientFilter"
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-allCasesScreen__filtersRow">
                    <ChooseButton
                        buttonText={t('cases.statusFilter')}
                        items={[
                            { value: 'closed', label: t('cases.closedCases') },
                            { value: 'open', label: t('cases.openCases') },
                        ]}
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

                <AllCasesCard
                    allCases={filteredCases || allCases}
                    reperformAfterSave={reperformAfterSave}
                    isPerforming={isPerformingAllCases}
                />
            </SimpleScrollView>
            <SimpleContainer className="lw-allCasesScreen__footer">
                <PrimaryButton
                    className="lw-allCasesScreen__addButton"
                    onPress={() =>
                        openPopup(
                            <CaseFullView
                                closePopUpFunction={closePopup}
                                rePerformRequest={reperformAfterSave}
                            />
                        )
                    }
                >
                    {t('cases.addNewCase')}
                </PrimaryButton>
            </SimpleContainer>

        </SimpleScreen>
    )
}
