import React, { useState } from 'react';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleInput from '../../simpleComponents/SimpleInput';
import SimpleLoader from '../../simpleComponents/SimpleLoader';
import { Text12, Text40 } from '../../specializedComponents/text/AllTextKindFile';
import SimpleScrollView from '../../simpleComponents/SimpleScrollView';
import useAutoHttpRequest from '../../../hooks/useAutoHttpRequest';
import useHttpRequest from '../../../hooks/useHttpRequest';
import { casesApi } from '../../../api/casesApi';
import SecondaryButton from '../buttons/SecondaryButton';
import SimpleTextArea from '../../simpleComponents/SimpleTextArea';

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

    const { result: casesByName, isPerforming: isPerformingCasesById } = useAutoHttpRequest(casesApi.getCaseByName, {
        body: { caseName },
        onSuccess: (fetchedData) => {
            if (fetchedData) {
                const data = fetchedData[0]
                console.log("hereeeeeeeeee", data);

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

    if (isPerformingCasesById) {
        return <SimpleLoader />;
    }

    console.log("casesByName", casesByName);

    return (
        <SimpleContainer style={{ ...style, ...styles.container }}>
            <SimpleScrollView>
                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"מספר תיק"}
                        value={caseDetails.CaseName}
                        onChange={(e) => handleInputChange('CaseName', e.target.value)}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"סוג התיק"}
                        value={caseDetails.CaseType}
                        onChange={(e) => handleInputChange('CaseType', e.target.value)}
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
                        title={`תיאור מס' ${index + 1}`}
                        value={descriptions?.Text || ''}
                        onChange={(text) =>
                            setCaseDetails((prevDetails) => {
                                const updatedDescriptions = [...prevDetails.Descriptions];
                                updatedDescriptions[0].Text = text;
                                return { ...prevDetails, Descriptions: updatedDescriptions };
                            })
                        }
                    />
                ))}


                <SimpleContainer style={styles.buttonsRowStyle}>
                    <SecondaryButton onClick={handleSaveCase} isPerforming={isSaving} style={styles.button}>
                        שמור שינויים
                    </SecondaryButton>
                    <SecondaryButton onClick={handleUpdateCase} isPerforming={isSaving} style={styles.button}>
                        קידום שלב
                    </SecondaryButton>
                    <SecondaryButton onClick={handleIsTagChange} isPerforming={isSaving} style={styles.button}>
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
        margin: '8px 4px',
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
