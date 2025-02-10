import React, { useState } from 'react';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleInput from '../../simpleComponents/SimpleInput';
import SimpleLoader from '../../simpleComponents/SimpleLoader';
import SimpleScrollView from '../../simpleComponents/SimpleScrollView';
import useAutoHttpRequest from '../../../hooks/useAutoHttpRequest';
import useHttpRequest from '../../../hooks/useHttpRequest';
import SecondaryButton from '../buttons/SecondaryButton';
import SimpleTextArea from '../../simpleComponents/SimpleTextArea';
import { buttonSizes } from '../../../styles/buttons/buttonSizes';
import SearchInput from '../../specializedComponents/containers/SearchInput';
import { DateDDMMYY } from '../../../functions/date/DateDDMMYY';
import { customersApi } from '../../../api/customersApi';
import casesApi, { casesTypeApi } from '../../../api/casesApi';

export function CaseFullView({ caseName, rePerformRequest, onFailureFunction, closePopUpFunction, style }) {
    const [caseDetails, setCaseDetails] = useState({
        CaseId: '',
        CaseName: '',
        CaseType: '',
        CompanyName: '',
        PhoneNumber: '',
        Stages: 0,
        CurrentStage: '',
        CustomerName: '',
        CustomerMail: '',
        Descriptions: [
            {
                Stage: 1,
                Text: '',
                Timestamp: '',
                New: false
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
                    CaseId: data.CaseId || data.CaseName.replace(/[^a-zA-Z0-9_-]/g, '_') || '',
                    CaseName: data.CaseName || '',
                    CaseType: data.CaseType || '',
                    CompanyName: data.CompanyName || '',
                    PhoneNumber: data.PhoneNumber || '',
                    Stages: data.Stages || 0,
                    CurrentStage: data.CurrentStage || 0,
                    CustomerName: data.CustomerName || '',
                    CustomerMail: data.CustomerMail || '',
                    Descriptions: data.Descriptions || [
                        { Stage: 1, Text: '', Timestamp: new Date(), New: false }
                    ],
                    IsTagged: data.IsTagged || false,
                });
            }
        },
        onFailure: onFailureFunction
    });

    const { isPerforming: isSaving, performRequest: saveCase } = useHttpRequest(
        casesApi.createCase,
        () => onSuccessSaveCase()
    );

    const { isPerforming: isCreatingNewUser, performRequest: createNewUser } = useHttpRequest(
        customersApi.createNewCustomer,
        () => alert('Case and Customer successfully!')
    );

    const { isPerforming: isPerformingSetCase, performRequest: setCase } = useHttpRequest(casesApi.updateCaseById);

    const onSuccessSaveCase = () => {
        const newUser = {
            CompanyName: caseDetails.CompanyName,
            CustomerName: caseDetails.CustomerName,
            CustomerMail: caseDetails.CustomerMail,
            PhoneNumber: caseDetails.PhoneNumber,
        }
        createNewUser(newUser)
        rePerformRequest?.()
        closePopUpFunction?.()
    };

    const handleInputChange = (field, value) => {
        setCaseDetails((prevDetails) => ({ ...prevDetails, [field]: value }));
    };

    const handleSaveCase = () => {
        const tempDescription = caseDetails.Descriptions;

        if (tempDescription[0].Timestamp === '') {
            tempDescription[0].Timestamp = DateDDMMYY(new Date())
            if (Number(caseDetails.CurrentStage) <= Number(caseDetails.Stages)) {
                tempDescription[Number(caseDetails.CurrentStage)].New = true
            }
        }

        saveCase({ ...caseDetails, CaseId: caseDetails.CaseName.replace(/[^a-zA-Z0-9_-]/g, '_') });
        setCaseDetails(oldCase => ({ ...oldCase, Descriptions: tempDescription }));
    };

    const handleUpdateCase = () => {
        if (Number(caseDetails.CurrentStage) + 1 <= Number(caseDetails.Stages)) {
            const tempDescription = caseDetails.Descriptions;
            tempDescription[caseDetails.CurrentStage].Timestamp = DateDDMMYY(new Date())
            tempDescription[caseDetails.CurrentStage].New = false
            if (Number(caseDetails.CurrentStage) + 2 <= Number(caseDetails.Stages)) {
                tempDescription[Number(caseDetails.CurrentStage) + 1].New = true
            }
            setCaseDetails(oldCase => ({ ...oldCase, CurrentStage: Number(caseDetails.CurrentStage) + 1, Descriptions: tempDescription }));

            setCase(caseDetails.CaseName, { ...caseDetails, CurrentStage: Number(caseDetails.CurrentStage) + 1, Descriptions: tempDescription })
            rePerformRequest?.()
        }
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
        const caseType = casesType.filter(casetype => casetype.CaseTypeName === caseTypeName);
        setCaseDetails(oldCase => ({ ...oldCase, CaseType: caseTypeName, Descriptions: caseType[0].Descriptions, Stages: caseType[0].NumberOfStages }));
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

                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"אימייל לקוח"}
                        value={caseDetails.CustomerMail}
                        onChange={(e) => handleInputChange('CustomerMail', e.target.value)}
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
