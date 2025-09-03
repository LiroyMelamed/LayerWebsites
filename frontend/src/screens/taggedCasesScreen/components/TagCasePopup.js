import { useState } from "react";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SearchInput from "../../../components/specializedComponents/containers/SearchInput";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import useHttpRequest from "../../../hooks/useHttpRequest";
import casesApi from "../../../api/casesApi";

export default function TagCasePopup({ rePerformRequest, style }) {
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
        <SimpleContainer style={{ ...style, ...styles.container }}>
            <SimpleScrollView>
                <SimpleContainer style={styles.rowStyle}>
                    <SearchInput
                        style={styles.inputStyle}
                        title={"מספר התיק"}
                        queryResult={casesByName}
                        onSearch={(query) => handleSearch(query)}
                        getButtonTextFunction={(item) => item.CaseName}
                        isPerforming={isPerformingCasesById}
                        buttonPressFunction={(text, result) => { buttonPressFunction(text, result) }}
                        value={CaseType?.CaseName}
                    // onChange={(e) => handleInputChange('CaseTypeName', e.target.value)}
                    />
                </SimpleContainer>

                <SimpleContainer style={styles.buttonsRowStyle}>
                    <SecondaryButton onPress={tagCase} isPerforming={isPerformingSetCase} style={styles.button}>
                        נעץ
                    </SecondaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}

const styles = {
    container: {
        width: '100%',
        margin: '0 auto',
    },
    rowStyle: {
        display: 'flex',
        flexDirection: 'row-reverse',
        marginBottom: '16px',
        flexWrap: 'wrap',
    },
    inputStyle: {
        flex: 1,
        minWidth: '150px',
        margin: '8px 4px',
    },
    buttonsRowStyle: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: '16px',
        marginTop: '16px',
        flexWrap: 'wrap',
    },
    button: {
        margin: '8px 8px',
    },
};