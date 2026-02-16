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

    const applyFilters = (typeFilter, statusFilter) => {
        let filtered = allCases;

        if (typeFilter) {
            filtered = filtered.filter(item => item.CaseTypeName === typeFilter);
        }

        if (statusFilter === "open") {
            filtered = filtered.filter(item => item.IsClosed === false);
        } else if (statusFilter === "closed") {
            filtered = filtered.filter(item => item.IsClosed === true);
        }

        if (!typeFilter && !statusFilter) {
            setFilteredCases(null);
        } else {
            setFilteredCases(filtered);
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

    if (isPerformingAllCases || isPerformingAllCasesTypes) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenNavKey="allCases" LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-allCasesScreen__row">
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
