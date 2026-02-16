import { useState } from "react";
import { casesTypeApi } from "../../api/casesApi";
import { images } from "../../assets/images/images";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import ChooseButton from "../../components/styledComponents/buttons/ChooseButton";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import CaseTypeFullView from "../../components/styledComponents/cases/CaseTypeFullView";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";
import { AdminStackName } from "../../navigation/AdminStack";
import { usePopup } from "../../providers/PopUpProvider";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { MainScreenName } from "../mainScreen/MainScreen";
import AllCasesTypeCard from "./components/AllCasesTypeCard";
import { useTranslation } from "react-i18next";

import "./AllCasesTypeScreen.scss";

export const AllCasesTypeScreenName = "/AllCasesType";

export default function AllCasesTypeScreen() {
    const { t } = useTranslation();
    const { openPopup, closePopup } = usePopup();
    const { isSmallScreen } = useScreenSize();

    const [selectedStageCount, setSelectedStageCount] = useState(null);

    const {
        result: allCasesType,
        isPerforming: isPerformingAllCasesType,
        performRequest: reperformAfterSave
    } = useAutoHttpRequest(casesTypeApi.getAllCasesType);

    const {
        result: casesTypeByName,
        isPerforming: isPerformingCasesTypeById,
        performRequest: SearchCaseTypeByName
    } = useHttpRequest(casesTypeApi.getCaseTypeByName, null, () => { });

    const handleSearch = (query) => {
        SearchCaseTypeByName(query);
    };

    const handleButtonPress = (query) => {
        const foundItem = casesTypeByName.find(caseType => caseType.CaseTypeName === query);
        openPopup(
            <CaseTypeFullView
                onFailureFunction={() => { }}
                caseTypeDetails={foundItem}
                rePerformRequest={reperformAfterSave}
                closePopUpFunction={closePopup}
            />
        );
    };

    const handleStageCountFilter = (stageCount) => {
        if (stageCount == null) {
            setSelectedStageCount(null);
            return;
        }

        setSelectedStageCount(Number(stageCount));
    };

    const filteredCasesType = selectedStageCount
        ? allCasesType?.filter(item => item?.NumberOfStages === selectedStageCount)
        : allCasesType;

    return (
        <SimpleScreen
            imageBackgroundSource={images.Backgrounds.AppBackground}
        >
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    chosenNavKey="allCaseTypes"
                    LogoNavigate={AdminStackName + MainScreenName}
                />
            )}

            <SimpleScrollView>
                <SimpleContainer className="lw-allCasesTypeScreen__row">
                    <SearchInput
                        onSearch={handleSearch}
                        title={t('cases.searchCaseTypeTitle')}
                        titleFontSize={20}
                        isPerforming={isPerformingCasesTypeById}
                        queryResult={casesTypeByName}
                        getButtonTextFunction={(item) => item.CaseTypeName}
                        className="lw-allCasesTypeScreen__search"
                        buttonPressFunction={handleButtonPress}
                    />

                    <ChooseButton
                        className="lw-allCasesTypeScreen__choose"
                        buttonText={t('cases.stageCount')}
                        items={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => ({ value: n, label: String(n) }))}
                        OnPressChoiceFunction={handleStageCountFilter}
                    />
                </SimpleContainer>

                <AllCasesTypeCard
                    allCasesType={filteredCasesType}
                    reperformAfterSave={reperformAfterSave}
                    isPerforming={isPerformingAllCasesType}
                />
            </SimpleScrollView>

            <SimpleContainer className="lw-allCasesTypeScreen__footer">
                <PrimaryButton
                    onPress={() =>
                        openPopup(
                            <CaseTypeFullView
                                onFailureFunction={() => { }}
                                caseTypeName={null}
                                closePopUpFunction={closePopup}
                                rePerformRequest={reperformAfterSave}
                            />
                        )
                    }
                >
                    {t('cases.addCaseType')}
                </PrimaryButton>
            </SimpleContainer>
        </SimpleScreen>
    );
}
