import { useState } from "react";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SearchInput from "../../../components/specializedComponents/containers/SearchInput";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import useHttpRequest from "../../../hooks/useHttpRequest";
import casesApi from "../../../api/casesApi";
import { useTranslation } from "react-i18next";

import "./TagCasePopup.scss";

export default function TagCasePopup({ rePerformRequest, style }) {
    const { t } = useTranslation();
    const [CaseType, setCaseType] = useState();
    const { isPerforming: isPerformingSetCase, performRequest: setCase } = useHttpRequest(casesApi.updateCaseById, () => { rePerformRequest?.() });
    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName);

    const handleSearch = (query) => {
        SearchCaseByName(query);
    };

    function tagCase() {
        setCase(CaseType?.CaseId, { ...CaseType, IsTagged: true })
    }

    function buttonPressFunction(text, result) {
        setCaseType(result)
    }

    return (
        <SimpleContainer className="lw-tagCasePopup" style={style}>
            <SimpleScrollView>
                <SimpleContainer className="lw-tagCasePopup__row">
                    <SearchInput
                        className="lw-tagCasePopup__input"
                        title={t('taggedCases.caseNumber')}
                        queryResult={casesByName}
                        onSearch={(query) => handleSearch(query)}
                        getButtonTextFunction={(item) => item.CaseName}
                        isPerforming={isPerformingCasesById}
                        buttonPressFunction={(text, result) => { buttonPressFunction(text, result) }}
                        value={CaseType?.CaseName}
                    // onChange={(e) => handleInputChange('CaseTypeName', e.target.value)}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-tagCasePopup__actions">
                    <SecondaryButton
                        onPress={tagCase}
                        isPerforming={isPerformingSetCase}
                        className="lw-tagCasePopup__actionButton"
                    >
                        {t('taggedCases.pin')}
                    </SecondaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}
