import React, { useEffect, useState } from 'react';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleInput from '../../simpleComponents/SimpleInput';
import SimpleLoader from '../../simpleComponents/SimpleLoader';
import SimpleScrollView from '../../simpleComponents/SimpleScrollView';
import useHttpRequest from '../../../hooks/useHttpRequest';
import SecondaryButton from '../buttons/SecondaryButton';
import SimpleTextArea from '../../simpleComponents/SimpleTextArea';
import PrimaryButton from '../buttons/PrimaryButton';
import SearchInput from '../../specializedComponents/containers/SearchInput';
import { DateDDMMYY } from '../../../functions/date/DateDDMMYY';
import { customersApi } from '../../../api/customersApi';
import casesApi, { casesTypeApi } from '../../../api/casesApi';
import { buttonSizes } from '../../../styles/buttons/buttonSizes';

export default function CaseFullView({ caseDetails, rePerformRequest, onFailureFunction, closePopUpFunction, style }) {
    const [caseData, setCaseData] = useState({
        CaseId: '',
        CaseName: '',
        CaseTypeName: '',
        CompanyName: '',
        CurrentStage: '',
        CustomerMail: '',
        CustomerName: '',
        Descriptions: [{ Stage: 1, Text: '', Timestamp: '', New: false }],
        PhoneNumber: '',
    });

    useEffect(() => {
        if (caseDetails) {
            setCaseData({
                CaseId: caseDetails.CaseId || '',
                CaseName: caseDetails.CaseName || '',
                CaseTypeName: caseDetails.CaseTypeName || '',
                CompanyName: caseDetails.CompanyName || '',
                CurrentStage: caseDetails.CurrentStage || '',
                CustomerMail: caseDetails.CustomerMail || '',
                CustomerName: caseDetails.CustomerName || '',
                Descriptions: caseDetails.Descriptions || [{ Stage: 1, Text: '', Timestamp: '', New: false }],
                IsClosed: caseDetails.IsClosed || false,
                IsTagged: caseDetails.IsTagged || false,
                PhoneNumber: caseDetails.PhoneNumber || '',
                UserId: caseDetails.UserId,
            });
        }
    }, [caseDetails]);

    const { result: customers, isPerforming: isPerformingCustomers, performRequest: searchCustomers } = useHttpRequest(customersApi.getCustomersByName);

    const { result: caseTypes, isPerforming: isPerformingCaseTypes, performRequest: searchCaseTypes } = useHttpRequest(casesTypeApi.getCaseTypeByName);

    const { isPerforming: isSaving, performRequest: saveCase } = useHttpRequest(
        caseDetails ? casesApi.updateCaseById : casesApi.addCase,
        () => {
            rePerformRequest?.();
            closePopUpFunction?.();
        },
        onFailureFunction
    );

    // Delete Case
    const { isPerforming: isDeleting, performRequest: deleteCase } = useHttpRequest(
        casesApi.deleteCaseById,
        () => {
            rePerformRequest?.();
            closePopUpFunction?.();
        },
        onFailureFunction
    );

    const handleInputChange = (field, value) => {
        setCaseData((prevDetails) => ({ ...prevDetails, [field]: value }));
    };

    const handleCaseTypeSelect = (caseTypeName) => {
        const selectedCaseType = caseTypes.find(type => type.CaseTypeName === caseTypeName);
        if (selectedCaseType) {
            setCaseData((prevDetails) => ({
                ...prevDetails,
                CaseTypeName: selectedCaseType.CaseTypeName,
                Stages: selectedCaseType.NumberOfStages,
                Descriptions: selectedCaseType.Descriptions || [{ Stage: 1, Text: '', Timestamp: '', New: false }],
                CaseTypeId: selectedCaseType.CaseTypeId
            }));
        }
    };

    const handleSaveCase = () => {
        console.log('caseData', caseData);

        if (!caseData.CaseName || !caseData.CaseTypeName) {
            alert("Both Case Name and Case Type are required.");
            return;
        }

        saveCase(caseData);
    };

    const handleUpdateCase = () => {
        console.log('caseData', caseData);

        if (!caseData.CaseName || !caseData.CaseTypeName) {
            alert("Both Case Name and Case Type are required.");
            return;
        }

        saveCase(caseData.CaseId, caseData);
    };

    const handleDeleteCase = () => {
        deleteCase(caseData.CaseId);
    };

    const handleCustomerSelect = (userName) => {
        const selectedUser = customers.find(user => user.Name === userName);
        if (selectedUser) {
            setCaseData((prevDetails) => ({
                ...prevDetails,
                UserId: selectedUser.UserId,
                CustomerName: selectedUser.Name,
                CustomerMail: selectedUser.Email,
                PhoneNumber: selectedUser.PhoneNumber,
                CompanyName: selectedUser.CompanyName || '',
            }));
        }
    };

    return (
        <SimpleContainer style={{ ...style, ...styles.container }}>
            <SimpleScrollView>
                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שם התיק"}
                        value={caseData.CaseName}
                        onChange={(e) => handleInputChange('CaseName', e.target.value)}
                    />

                    <SearchInput
                        onSearch={searchCaseTypes}
                        title={"סוג התיק"}
                        value={caseData.CaseTypeName}
                        isPerforming={isPerformingCaseTypes}
                        getButtonTextFunction={(item) => item.CaseTypeName}
                        buttonPressFunction={handleCaseTypeSelect}
                        queryResult={caseTypes}
                    />
                </SimpleContainer>

                <SimpleContainer style={styles.rowStyle}>
                    <SearchInput
                        onSearch={searchCustomers}
                        title={"שם לקוח"}
                        value={caseData.CustomerName}
                        isPerforming={isPerformingCustomers}
                        getButtonTextFunction={(item) => item.Name}
                        buttonPressFunction={handleCustomerSelect}
                        queryResult={customers}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שם החברה"}
                        value={caseData.CompanyName}
                        onChange={(e) => handleInputChange('CompanyName', e.target.value)}
                    />
                </SimpleContainer>

                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"מספר פלאפון"}
                        value={caseData.PhoneNumber}
                        onChange={(e) => handleInputChange('PhoneNumber', e.target.value)}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שלב נוכחי"}
                        value={caseData.CurrentStage}
                        onChange={(e) => handleInputChange('CurrentStage', e.target.value)}
                    />
                </SimpleContainer>

                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"אימייל לקוח"}
                        value={caseData.CustomerMail}
                        onChange={(e) => handleInputChange('CustomerMail', e.target.value)}
                    />
                </SimpleContainer>

                {caseData?.Descriptions?.map((description, index) => (
                    <SimpleTextArea
                        key={`DescriptionNumber${index}`}
                        title={`תיאור מס' ${index + 1}`}
                        value={description?.Text || ''}
                        style={{ marginTop: 8 }}
                        onChange={(text) => {
                            setCaseData((prevDetails) => {
                                const updatedDescriptions = [...prevDetails.Descriptions];
                                updatedDescriptions[index].Text = text;
                                return { ...prevDetails, Descriptions: updatedDescriptions };
                            });
                        }}
                    />
                ))}

                <SimpleContainer style={styles.buttonsRowStyle}>
                    {caseDetails && (
                        <SecondaryButton
                            onPress={handleDeleteCase}
                            isPerforming={isDeleting}
                            style={styles.button}
                            size={buttonSizes.MEDIUM}
                        >
                            {isDeleting ? "מוחק..." : "מחק תיק"}
                        </SecondaryButton>
                    )}
                    <PrimaryButton
                        onPress={caseDetails ? handleUpdateCase : handleSaveCase}
                        isPerforming={isSaving}
                        style={styles.button}
                        size={buttonSizes.MEDIUM}
                    >
                        {isSaving ? "שומר..." : caseDetails ? "עדכן תיק" : "שמור תיק"}
                    </PrimaryButton>
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
