import React, { useEffect, useState } from 'react';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleInput from '../../simpleComponents/SimpleInput';
import SimpleLoader from '../../simpleComponents/SimpleLoader';
import { Text12, Text40 } from '../../specializedComponents/text/AllTextKindFile';
import SimpleScrollView from '../../simpleComponents/SimpleScrollView';
import useAutoHttpRequest from '../../../hooks/useAutoHttpRequest';
import useHttpRequest from '../../../hooks/useHttpRequest';
import SecondaryButton from '../buttons/SecondaryButton';
import SimpleTextArea from '../../simpleComponents/SimpleTextArea';
import { casesTypeApi } from '../../../api/casesApi';
import Separator from '../separators/Separator';

export function CaseTypeFullView({ caseTypeName, rePerformRequest, onFailureFunction, style }) {
    const [caseTypeDetails, setCaseTypeDetails] = useState({
        CaseTypeName: '',
        NumberOfStages: '',
        Descriptions: [
            {
                Stage: 1,
                Text: '',
                Timestamp: '',
            },
        ],
    });

    useEffect(() => {
        const numberOfStages = Number(caseTypeDetails.NumberOfStages);
        setCaseTypeDetails((prevDetails) => {
            const updatedDescriptions = [...prevDetails.Descriptions];
            if (updatedDescriptions.length < numberOfStages) {
                for (let i = updatedDescriptions.length; i < numberOfStages; i++) {
                    updatedDescriptions.push({ Stage: i + 1, Text: '', Timestamp: '' });
                }
            } else if (updatedDescriptions.length > numberOfStages) {
                updatedDescriptions.splice(numberOfStages);
            }
            return { ...prevDetails, Descriptions: updatedDescriptions };
        });
    }, [caseTypeDetails.NumberOfStages]);

    const { result: caseTypeByName, isPerforming: isPerformingCaseTypeByName } = useAutoHttpRequest(casesTypeApi.getCaseTypeByName, {
        body: { caseTypeName: caseTypeDetails.CaseTypeName },
        onSuccess: (fetchedData) => {
            if (fetchedData) {
                const data = fetchedData[0];
                setCaseTypeDetails({
                    CaseTypeName: data.CaseTypeName || '',
                    NumberOfStages: data.NumberOfStages || 0,
                    Descriptions: data.Descriptions || [
                        { Stage: 1, Text: '', Timestamp: '' },
                    ],
                });
            }
        },
        onFailure: onFailureFunction,
    });

    const { isPerforming: isSaving, performRequest: saveCaseType } = useHttpRequest(
        casesTypeApi.createOrUpdateCaseType,
        () => alert('Case type saved successfully!')
    );

    const handleInputChange = (field, value) => {
        setCaseTypeDetails((prevDetails) => ({ ...prevDetails, [field]: value }));
    };

    const handleSaveCaseType = () => {
        saveCaseType({ caseTypeName: caseTypeDetails.CaseTypeName, caseTypeData: caseTypeDetails });
        rePerformRequest?.();
    };

    const handleAddStage = () => {
        setCaseTypeDetails((prevDetails) => {
            const updatedNumberOfStages = Number(prevDetails.NumberOfStages) + 1;

            const updatedDescriptions = [
                ...prevDetails.Descriptions,
                {
                    Stage: updatedNumberOfStages,
                    Text: '',
                    Timestamp: '',
                },
            ];

            const updatedCaseType = {
                ...prevDetails,
                NumberOfStages: updatedNumberOfStages,
                Descriptions: updatedDescriptions,
            };

            saveCaseType({ caseTypeName: updatedCaseType.CaseTypeName, caseTypeData: updatedCaseType });

            rePerformRequest?.();

            return updatedCaseType;
        });
    };

    if (isPerformingCaseTypeByName) {
        return <SimpleLoader />;
    }



    return (
        <SimpleContainer style={{ ...style, ...styles.container }}>
            <SimpleScrollView>
                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שם סוג התיק"}
                        value={caseTypeDetails.CaseTypeName}
                        onChange={(e) => handleInputChange('CaseTypeName', e.target.value)}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"מספר שלבים"}
                        value={caseTypeDetails.NumberOfStages}
                        onChange={(e) => handleInputChange('NumberOfStages', e.target.value)}
                    />
                </SimpleContainer>

                {caseTypeDetails?.Descriptions?.map((description, index) => (
                    <>
                        {index != 0 && <SimpleContainer style={{ paddingTop: 16 }} />}
                        <SimpleTextArea
                            key={index}
                            title={`תיאור מס' ${index + 1}`}
                            value={description?.Text || ''}
                            onChange={(text) =>
                                setCaseTypeDetails((prevDetails) => {
                                    const updatedDescriptions = [...prevDetails.Descriptions];
                                    updatedDescriptions[index].Text = text;
                                    return { ...prevDetails, Descriptions: updatedDescriptions };
                                })
                            }
                        />
                    </>
                ))}

                <SimpleContainer style={styles.buttonsRowStyle}>
                    <SecondaryButton onClick={handleSaveCaseType} isPerforming={isSaving} style={styles.button}>
                        שמור שינויים
                    </SecondaryButton>
                    <SecondaryButton onClick={handleAddStage} isPerforming={isSaving} style={styles.button}>
                        הוסף שלב
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

export default CaseTypeFullView;
