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

export const AllCasesScreenName = "/AllCases"

export default function AllCasesScreen() {
    const { openPopup, closePopup } = usePopup();
    const { isSmallScreen } = useScreenSize();
    const [selectedCaseType, setSelectedCaseType] = useState("הכל");
    const [selectedStatus, setSelectedStatus] = useState("הכל");
    const [filteredCases, setFilteredCases] = useState(null);

    const { result: allCasesTypes, isPerforming: isPerformingAllCasesTypes } = useAutoHttpRequest(casesTypeApi.getAllCasesTypeForFilter);
    const { result: allCases, isPerforming: isPerformingAllCases, performRequest: reperformAfterSave } = useAutoHttpRequest(casesApi.getAllCases);
    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName, null, () => { });

    const handleSearch = (query) => {
        SearchCaseByName(query);
    };

    const applyFilters = (typeFilter, statusFilter) => {
        let filtered = allCases;

        if (typeFilter !== "הכל") {
            filtered = filtered.filter(item => item.CaseTypeName === typeFilter);
        }

        if (statusFilter === "תיקים פתוחים") {
            filtered = filtered.filter(item => item.IsClosed === false);
        } else if (statusFilter === "תיקים סגורים") {
            filtered = filtered.filter(item => item.IsClosed === true);
        }

        if (typeFilter === "הכל" && statusFilter === "הכל") {
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
            {isSmallScreen && <TopToolBarSmallScreen chosenIndex={1} LogoNavigate={AdminStackName + MainScreenName} />}

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
                </SimpleContainer>

                <SimpleContainer style={styles.responsiveContainer}>
                    <ChooseButton
                        buttonChoices={allCasesTypes}
                        style={styles.chooseButton}
                        OnPressChoiceFunction={handleFilterByType}
                    />
                    <ChooseButton
                        buttonChoices={["תיקים סגורים", "תיקים פתוחים"]}
                        style={styles.chooseButtonOpenClose}
                        OnPressChoiceFunction={handleFilterByStatus}
                        buttonText="סגור/פתוח"
                    />
                </SimpleContainer>

                <AllCasesCard
                    allCases={filteredCases || allCases}
                    reperformAfterSave={reperformAfterSave}
                    isPerforming={isPerformingAllCases}
                />
            </SimpleScrollView>
            <SimpleContainer style={{ display: 'flex', justifyContent: 'center' }}>
                <PrimaryButton style={{ margin: '8px 0px', selfAlign: 'center' }} onPress={() => openPopup(<CaseFullView closePopUpFunction={closePopup} rePerformRequest={reperformAfterSave} />)}>הוספת תיק חדש</PrimaryButton>
            </SimpleContainer>

        </SimpleScreen>
    )
}

const styles = {
    responsiveContainer: {
        display: 'flex',
        flexDirection: 'row-reverse',
        alignItems: 'center',
        flexWrap: 'wrap',
        width: '100%',
        overflow: 'hidden',
    },
    searchInput: {
        marginTop: "12px",
        maxWidth: '500px',
    },
    chooseButton: {
        margin: "12px 12px",
        flex: '0 1 auto',
    },
    chooseButtonOpenClose: {
        flex: '0 1 auto',
    }
}