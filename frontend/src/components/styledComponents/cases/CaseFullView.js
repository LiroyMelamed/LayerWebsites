import { useMemo, useState } from 'react';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleInput from '../../simpleComponents/SimpleInput';
import SimpleScrollView from '../../simpleComponents/SimpleScrollView';
import useHttpRequest from '../../../hooks/useHttpRequest';
import SecondaryButton from '../buttons/SecondaryButton';
import SimpleTextArea from '../../simpleComponents/SimpleTextArea';
import PrimaryButton from '../buttons/PrimaryButton';
import SearchInput from '../../specializedComponents/containers/SearchInput';
import { customersApi } from '../../../api/customersApi';
import casesApi, { casesTypeApi } from '../../../api/casesApi';
import { buttonSizes } from '../../../styles/buttons/buttonSizes';
import { adminApi } from '../../../api/adminApi';
import { formatDateForInput } from '../../../functions/date/formatDateForInput';
import IsraeliPhoneNumberValidation from '../../../functions/validation/IsraeliPhoneNumberValidation';
import emailValidation from '../../../functions/validation/EmailValidation';

import './CaseFullView.scss';
import useAutoHttpRequest from '../../../hooks/useAutoHttpRequest';

export default function CaseFullView({ caseDetails, rePerformRequest, onFailureFunction, closePopUpFunction, style: _style }) {
    const [caseHasBeenChosen, setCaseHasBeenChosen] = useState(false)
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [caseData, setCaseData] = useState({
        CaseId: caseDetails?.CaseId || '',
        CaseName: caseDetails?.CaseName || '',
        CaseTypeName: caseDetails?.CaseTypeName || '',
        CompanyName: caseDetails?.CompanyName || '',
        CurrentStage: caseDetails?.CurrentStage || '',
        CustomerMail: caseDetails?.CustomerMail || '',
        CustomerName: caseDetails?.CustomerName || '',
        Descriptions: caseDetails?.Descriptions || [{ Stage: 1, Text: '', Timestamp: '', New: false }],
        IsClosed: caseDetails?.IsClosed || false,
        IsTagged: caseDetails?.IsTagged || false,
        PhoneNumber: caseDetails?.PhoneNumber || '',
        UserId: caseDetails?.UserId || null,
        CaseManager: caseDetails?.CaseManager || '',
        CaseManagerId: caseDetails?.CaseManagerId || '',
        EstimatedCompletionDate: caseDetails?.EstimatedCompletionDate,
        LicenseExpiryDate: caseDetails?.LicenseExpiryDate,
    });

    const validateCaseData = useMemo(() => {
        return (data) => {
            const errors = {};

            const caseName = String(data?.CaseName || '').trim();
            if (!caseName) errors.CaseName = 'חובה';

            const caseTypeName = String(data?.CaseTypeName || '').trim();
            if (!caseTypeName) errors.CaseTypeName = 'חובה';

            const customerName = String(data?.CustomerName || '').trim();
            if (!customerName) errors.CustomerName = 'חובה';

            const phoneRequired = true;
            const phone = String(data?.PhoneNumber || '').trim();
            if (phoneRequired && !phone) {
                errors.PhoneNumber = 'חובה';
            } else {
                const phoneError = IsraeliPhoneNumberValidation(phone);
                if (phoneError) errors.PhoneNumber = phoneError;
            }

            const email = String(data?.CustomerMail || '').trim();
            const emailErr = emailValidation(email);
            if (emailErr) errors.CustomerMail = emailErr;

            return errors;
        };
    }, []);

    const applyFieldErrorUpdates = (partialUpdates) => {
        if (!hasSubmitted) return;

        const nextData = { ...caseData, ...partialUpdates };
        setFieldErrors(validateCaseData(nextData));
    };

    const { result: customers, isPerforming: isPerformingCustomers, performRequest: searchCustomers } = useHttpRequest(customersApi.getCustomersByName, null, () => { });

    const { result: caseTypes, isPerforming: isPerformingCaseTypes, performRequest: searchCaseTypes } = useAutoHttpRequest(casesTypeApi.getCaseTypeByName);

    const { result: adminByName, isPerforming: isPerformingGetAdmin, performRequest: getAdminByName } = useAutoHttpRequest(adminApi.getAdminByName);

    const { result: cases, isPerforming: isPerformingCases, performRequest: searchCases } = useAutoHttpRequest(casesApi.getCaseByName);

    const { isPerforming: isSaving, performRequest: saveCase } = useHttpRequest(
        caseDetails ? casesApi.updateCaseById : casesApi.addCase,
        () => {
            rePerformRequest?.();
            closePopUpFunction?.();
        },
        onFailureFunction
    );

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
        applyFieldErrorUpdates({ [field]: value });
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

            applyFieldErrorUpdates({
                CaseTypeName: selectedCaseType.CaseTypeName,
                CaseTypeId: selectedCaseType.CaseTypeId,
            });
        }
    };

    const handleSaveCase = () => {
        setHasSubmitted(true);
        const errors = validateCaseData(caseData);
        setFieldErrors(errors);
        if (Object.keys(errors).length) return;

        saveCase(caseData);
    };

    const handleUpdateCase = () => {
        setHasSubmitted(true);
        const errors = validateCaseData(caseData);
        setFieldErrors(errors);
        if (Object.keys(errors).length) return;

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

            applyFieldErrorUpdates({
                UserId: selectedUser.UserId,
                CustomerName: selectedUser.Name,
                CustomerMail: selectedUser.Email,
                PhoneNumber: selectedUser.PhoneNumber,
                CompanyName: selectedUser.CompanyName || '',
            });
        }
    };

    const handleManagerSelected = (selectedManager) => {
        const selectedAdmin = adminByName.find(admin => admin.name === selectedManager);

        console.log('selectedAdmin', selectedAdmin);

        setCaseData((prevDetails) => ({
            ...prevDetails,
            CaseManager: selectedAdmin.name,
            CaseManagerId: selectedAdmin.userid
        }));
    }

    const handleCaseSelect = (selectedCase) => {
        setCaseData((prevDetails) => ({
            ...prevDetails,
            CaseName: selectedCase
        }));

        applyFieldErrorUpdates({ CaseName: selectedCase });

        const caseDetails = cases.find(c => c.CaseName === selectedCase);
        if (caseDetails) {
            setCaseHasBeenChosen(true);
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
                CaseManager: caseDetails.CaseManager || '',
                CaseManagerId: caseDetails?.CaseManagerId || '',
                EstimatedCompletionDate: caseDetails.EstimatedCompletionDate,
                LicenseExpiryDate: caseDetails.LicenseExpiryDate,
            });
        }
    };

    return (
        <SimpleContainer className="lw-caseFullView">
            <SimpleScrollView>
                <SimpleContainer className="lw-caseFullView__row">
                    {caseDetails ?
                        <SimpleInput
                            className="lw-caseFullView__field"
                            title={"מספר התיק"}
                            value={caseData.CaseName}
                            onChange={(e) => handleInputChange('CaseName', e.target.value)}
                            error={fieldErrors?.CaseName}
                        />
                        :
                        <SearchInput
                            onSearch={(caseName) => {
                                searchCases(caseName); setCaseData((prevDetails) => ({
                                    ...prevDetails,
                                    CaseName: caseName
                                }));

                                applyFieldErrorUpdates({ CaseName: caseName });
                            }}
                            title={"מספר התיק"}
                            value={caseData.CaseName}
                            isPerforming={isPerformingCases}
                            getButtonTextFunction={(item) => item.CaseName}
                            buttonPressFunction={handleCaseSelect}
                            queryResult={cases}
                            className="lw-caseFullView__field"
                            error={fieldErrors?.CaseName}
                        />
                    }

                    <SearchInput
                        onSearch={searchCaseTypes}
                        title={"סוג התיק"}
                        value={caseData.CaseTypeName}
                        isPerforming={isPerformingCaseTypes}
                        getButtonTextFunction={(item) => item.CaseTypeName}
                        buttonPressFunction={handleCaseTypeSelect}
                        queryResult={caseTypes}
                        className="lw-caseFullView__field"
                        error={fieldErrors?.CaseTypeName}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-caseFullView__row">
                    <SearchInput
                        onSearch={searchCustomers}
                        title={"שם לקוח"}
                        value={caseData.CustomerName}
                        isPerforming={isPerformingCustomers}
                        getButtonTextFunction={(item) => item.Name}
                        buttonPressFunction={handleCustomerSelect}
                        queryResult={customers}
                        className="lw-caseFullView__field"
                        error={fieldErrors?.CustomerName}
                    />
                    <SimpleInput
                        className="lw-caseFullView__field"
                        title={"שם החברה"}
                        value={caseData.CompanyName}
                        onChange={(e) => handleInputChange('CompanyName', e.target.value)}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-caseFullView__row">
                    <SimpleInput
                        className="lw-caseFullView__field"
                        title={"מספר פלאפון"}
                        value={caseData.PhoneNumber}
                        onChange={(e) => handleInputChange('PhoneNumber', e.target.value)}
                        error={fieldErrors?.PhoneNumber}
                    />
                    <SimpleInput
                        className="lw-caseFullView__field"
                        title={"שלב נוכחי"}
                        value={caseData.CurrentStage}
                        onChange={(e) => handleInputChange('CurrentStage', e.target.value)}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-caseFullView__row">
                    <SimpleInput
                        className="lw-caseFullView__field"
                        title={"אימייל לקוח"}
                        type="email"
                        value={caseData.CustomerMail}
                        onChange={(e) => handleInputChange('CustomerMail', e.target.value)}
                        error={fieldErrors?.CustomerMail}
                    />
                    <SearchInput
                        onSearch={getAdminByName}
                        title={"מנהל התיק"}
                        value={caseData.CaseManager}
                        isPerforming={isPerformingGetAdmin}
                        getButtonTextFunction={(item) => item.name}
                        buttonPressFunction={handleManagerSelected}
                        queryResult={adminByName}
                        className="lw-caseFullView__field"
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-caseFullView__row">
                    <SimpleInput
                        className="lw-caseFullView__field"
                        title={"תאריך סיום משוער"}
                        type="date"
                        lang="he-IL"
                        value={formatDateForInput(caseData.EstimatedCompletionDate)}
                        onChange={(e) => handleInputChange('EstimatedCompletionDate', e.target.value)}
                    />
                    <SimpleInput
                        className="lw-caseFullView__field"
                        title={"תוקף רישיון"}
                        type="date"
                        lang="he-IL"
                        value={formatDateForInput(caseData.LicenseExpiryDate)}
                        onChange={(e) => handleInputChange('LicenseExpiryDate', e.target.value)}
                    />
                </SimpleContainer>

                {caseData?.Descriptions?.map((description, index) => (
                    <SimpleContainer key={`DescriptionNumber${index}`} className="lw-caseFullView__textAreaRow">
                        <SimpleTextArea
                            title={`תיאור מס' ${index + 1}`}
                            value={description?.Text || ''}
                            onChange={(text) => {
                                setCaseData((prevDetails) => {
                                    const updatedDescriptions = [...prevDetails.Descriptions];
                                    updatedDescriptions[index].Text = text;
                                    return { ...prevDetails, Descriptions: updatedDescriptions };
                                });
                            }}
                        />
                    </SimpleContainer>
                ))}

                <SimpleContainer className="lw-caseFullView__buttonsRow">
                    {((caseDetails != null) || caseHasBeenChosen) && (
                        <SecondaryButton
                            onPress={handleDeleteCase}
                            isPerforming={isDeleting}
                            size={buttonSizes.MEDIUM}
                        >
                            {isDeleting ? "מוחק..." : "מחק תיק"}
                        </SecondaryButton>
                    )}
                    <PrimaryButton
                        onPress={caseDetails ? handleUpdateCase : handleSaveCase}
                        isPerforming={isSaving}
                        size={buttonSizes.MEDIUM}
                    >
                        {isSaving ? "שומר..." : caseDetails || caseHasBeenChosen ? "עדכן תיק" : "שמור תיק"}
                    </PrimaryButton>
                    <SecondaryButton
                        onPress={() => closePopUpFunction?.()}
                        size={buttonSizes.MEDIUM}
                        className="lw-cancelButton"
                    >
                        ביטול
                    </SecondaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}
