import React, { useState } from 'react';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleInput from '../../simpleComponents/SimpleInput';
import SimpleLoader from '../../simpleComponents/SimpleLoader';
import { Text12, Text40 } from '../../specializedComponents/text/AllTextKindFile';
import SimpleScrollView from '../../simpleComponents/SimpleScrollView';
import useAutoHttpRequest from '../../../hooks/useAutoHttpRequest';
import useHttpRequest from '../../../hooks/useHttpRequest';
import { casesApi, casesTypeApi } from '../../../api/casesApi';
import SecondaryButton from '../buttons/SecondaryButton';
import SimpleTextArea from '../../simpleComponents/SimpleTextArea';
import { buttonSizes } from '../../../styles/buttons/buttonSizes';
import SearchInput from '../../specializedComponents/containers/SearchInput';

export function CaseFullView({ caseName, rePerformRequest, onFailureFunction, style }) {
    const [caseDetails, setCaseDetails] = useState({
        CaseName: '',
        CaseType: '',
        CompanyName: '',
        PhoneNumber: '',
        Stages: 0,
        CostumerTaz: 0,
        CurrentStage: '',
        CustomerName: '',
        Descriptions: [
            {
                Stage: 1,
                Text: '',
                IsTagged: false,
                Timestamp: ''
            }
        ],
        IsTagged: false,
    });

    const { result: searchCases, isPerforming: isPerformingSearchCases, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName);

    const { result: casesType, isPerforming: isPerformingCasesType, performRequest: SearchCaseTypeByName } = useHttpRequest(casesTypeApi.getCaseTypeByName);

    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: caseNamePressed } = useAutoHttpRequest(casesApi.getCaseByName, {
        body: { caseName },
        onSuccess: (fetchedData) => {
            if (fetchedData) {
                const data = fetchedData[0]

                setCaseDetails({
                    CaseName: data.CaseName || '',
                    CaseType: data.CaseType || '',
                    CompanyName: data.CompanyName || '',
                    PhoneNumber: data.PhoneNumber || '',
                    Stages: data.Stages || 0,
                    CostumerTaz: data.CostumerTaz || 0,
                    CurrentStage: data.CurrentStage || 0,
                    CustomerName: data.CustomerName || '',
                    Descriptions: data.Descriptions || [
                        { Stage: 1, Text: '', Timestamp: '' }
                    ],
                    IsTagged: data.IsTagged || false,
                });
            }
        },
        onFailure: onFailureFunction
    });

    const { isPerforming: isSaving, performRequest: saveCase } = useHttpRequest(
        casesApi.createCase,
        () => alert('Case saved successfully!')
    );

    const handleInputChange = (field, value) => {
        setCaseDetails((prevDetails) => ({ ...prevDetails, [field]: value }));
    };

    const handleSaveCase = () => {
        saveCase(caseDetails);
        rePerformRequest?.()
    };

    const handleUpdateCase = () => {
        const updatedCase = { ...caseDetails, CurrentStage: Number(caseDetails.CurrentStage) + 1 };
        setCaseDetails(updatedCase);
        saveCase(updatedCase);
        rePerformRequest?.()
    };

    const handleIsTagChange = () => {
        const updatedCase = { ...caseDetails, IsTagged: !caseDetails.IsTagged };
        setCaseDetails(updatedCase);
        saveCase(updatedCase);
        rePerformRequest?.()
    };

    const handleSearch = (query) => {
        setCaseDetails(oldCase => ({ ...oldCase, CaseName: query }));
        SearchCaseByName({ caseName: query });
    };

    const handleSearchCaseType = (query) => {
        SearchCaseTypeByName({ caseTypeName: query });
    };

    function CaseButtonPressed(caseName) {
        caseNamePressed({ caseName })
    }

    function CaseTypeButtonPressed(caseTypeName) {
        const caseType = casesType.filter(casetype => casetype.CaseTypeName = caseTypeName);
        setCaseDetails(oldCase => ({ ...oldCase, CaseType: caseTypeName, Descriptions: caseType[0].Descriptions }));
    }

    if (isPerformingCasesById) {
        return <SimpleLoader />;
    }

    return (
        <SimpleContainer style={{ ...style, ...styles.container }}>
            <SimpleScrollView>
                <SimpleContainer style={styles.rowStyle}>
                    <SearchInput
                        onSearch={handleSearch}
                        style={styles.inputStyle}
                        title={"מספר תיק"}
                        value={caseDetails.CaseName}
                        isPerforming={isPerformingSearchCases}
                        getButtonTextFunction={(item) => item.CaseName}
                        buttonPressFunction={CaseButtonPressed}
                        queryResult={searchCases}
                    />
                    <SearchInput
                        onSearch={handleSearchCaseType}
                        style={styles.inputStyle}
                        title={"סוג התיק"}
                        value={caseDetails.CaseType}
                        isPerforming={isPerformingCasesType}
                        getButtonTextFunction={(item) => item.CaseTypeName}
                        buttonPressFunction={CaseTypeButtonPressed}
                        queryResult={casesType}
                    />
                </SimpleContainer>

                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שם לקוח"}
                        value={caseDetails.CustomerName}
                        onChange={(e) => handleInputChange('CustomerName', e.target.value)}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שם החברה"}
                        value={caseDetails.CompanyName}
                        onChange={(e) => handleInputChange('CompanyName', e.target.value)}
                    />
                </SimpleContainer>

                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"מספר פלאפון"}
                        value={caseDetails.PhoneNumber}
                        onChange={(e) => handleInputChange('PhoneNumber', e.target.value)}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שלב נוכחי"}
                        value={caseDetails.CurrentStage}
                        onChange={(e) => handleInputChange('CurrentStage', e.target.value)}
                    />
                </SimpleContainer>

                {caseDetails?.Descriptions?.map((descriptions, index) => (
                    <SimpleTextArea
                        key={`DescriptionNumber${index}`}
                        title={`תיאור מס' ${index + 1}`}
                        value={descriptions?.Text || ''}
                        style={{ marginTop: 8 }}
                        onChange={(text) =>
                            setCaseDetails((prevDetails) => {
                                const updatedDescriptions = [...prevDetails.Descriptions];
                                updatedDescriptions[index].Text = text;
                                return { ...prevDetails, Descriptions: updatedDescriptions };
                            })
                        }
                    />
                ))}


                <SimpleContainer style={styles.buttonsRowStyle}>
                    <SecondaryButton onPress={handleSaveCase} isPerforming={isSaving} style={styles.button} size={buttonSizes.MEDIUM}>
                        שמור שינויים
                    </SecondaryButton>
                    <SecondaryButton onPress={handleUpdateCase} isPerforming={isSaving} style={styles.button} size={buttonSizes.MEDIUM}>
                        קידום שלב
                    </SecondaryButton>
                    <SecondaryButton onPress={handleIsTagChange} isPerforming={isSaving} style={styles.button} size={buttonSizes.MEDIUM}>
                        {caseDetails.IsTagged ? "בטל נעיצה" : "נעץ"}
                    </SecondaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}

const styles = {
    container: {
        width: '100%',
        margin: '0 auto', // Center container
    },
    rowStyle: {
        display: 'flex',
        flexDirection: 'row-reverse',
        marginBottom: '16px',
        flexWrap: 'wrap', // Allow wrapping for small screens
    },
    inputStyle: {
        flex: 1,
        minWidth: '150px', // Minimum width to maintain input size
    },
    descriptionRowStyle: {
        display: 'flex',
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'center',
    },
    textareaStyle: {
        flex: 1,
        padding: '10px',
        margin: '12px 4px',
        borderRadius: '8px',
        border: '1px solid #ddd',
    },
    buttonsRowStyle: {
        display: 'flex',
        flexDirection: 'row', // Stack buttons for small screens
        justifyContent: 'center',
        marginBottom: '16px',
        marginTop: '16px',
        flexWrap: 'wrap'
    },
    button: {
        margin: '8px 8px',
    },
};

export default CaseFullView;
