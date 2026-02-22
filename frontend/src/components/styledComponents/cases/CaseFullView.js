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
import { useTranslation } from 'react-i18next';
import { usePopup } from '../../../providers/PopUpProvider';
import ConfirmationDialog from '../popups/ConfirmationDialog';

export default function CaseFullView({ caseDetails, rePerformRequest, onFailureFunction, closePopUpFunction, style: _style }) {
    const { t } = useTranslation();
    const { openPopup: openConfirm, closePopup: closeConfirm } = usePopup();
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
        Users: caseDetails?.Users || (caseDetails?.UserId ? [{ UserId: caseDetails.UserId, Name: caseDetails.CustomerName || '', Email: caseDetails.CustomerMail || '', PhoneNumber: caseDetails.PhoneNumber || '' }] : []),
        CaseManager: caseDetails?.CaseManager || '',
        CaseManagerId: caseDetails?.CaseManagerId || '',
        EstimatedCompletionDate: caseDetails?.EstimatedCompletionDate,
        LicenseExpiryDate: caseDetails?.LicenseExpiryDate,
    });

    const moveStage = (fromIndex, toIndex) => {
        setCaseData((prev) => {
            const descs = [...prev.Descriptions];
            const [moved] = descs.splice(fromIndex, 1);
            descs.splice(toIndex, 0, moved);
            return { ...prev, Descriptions: descs.map((d, i) => ({ ...d, Stage: i + 1 })) };
        });
    };

    const validateCaseData = useMemo(() => {
        return (data) => {
            const errors = {};

            const caseName = String(data?.CaseName || '').trim();
            if (!caseName) errors.CaseName = t('errors.required');

            const caseTypeName = String(data?.CaseTypeName || '').trim();
            if (!caseTypeName) errors.CaseTypeName = t('errors.required');

            const customerName = String(data?.CustomerName || '').trim();
            if (!customerName) errors.CustomerName = t('errors.required');

            const phoneRequired = true;
            const phone = String(data?.PhoneNumber || '').trim();
            if (phoneRequired && !phone) {
                errors.PhoneNumber = t('errors.required');
            } else {
                const phoneError = IsraeliPhoneNumberValidation(phone);
                if (phoneError) errors.PhoneNumber = phoneError;
            }

            const email = String(data?.CustomerMail || '').trim();
            const emailErr = emailValidation(email);
            if (emailErr) errors.CustomerMail = emailErr;

            const caseManager = String(data?.CaseManagerId || '').trim();
            if (!caseManager) errors.CaseManager = t('errors.required');

            return errors;
        };
    }, [t]);

    const applyFieldErrorUpdates = (partialUpdates) => {
        if (!hasSubmitted) return;

        const nextData = { ...caseData, ...partialUpdates };
        setFieldErrors(validateCaseData(nextData));
    };

    const { result: customers, isPerforming: isPerformingCustomers, performRequest: searchCustomers } = useAutoHttpRequest(customersApi.getCustomersByName, { onFailure: () => { } });

    const { result: caseTypes, isPerforming: isPerformingCaseTypes, performRequest: searchCaseTypes } = useAutoHttpRequest(casesTypeApi.getCaseTypeByName, { onFailure: () => { } });

    const { result: adminByName, isPerforming: isPerformingGetAdmin, performRequest: getAdminByName } = useAutoHttpRequest(adminApi.getAdminByName, { onFailure: () => { } });

    const { result: cases, isPerforming: isPerformingCases, performRequest: searchCases } = useAutoHttpRequest(casesApi.getCaseByName, { onFailure: () => { } });

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
        setCaseData((prevDetails) => {
            const update = { ...prevDetails, [field]: value };

            // When CurrentStage is rolled back, clear timestamps and IsNew
            // on descriptions that are now ahead of the new stage,
            // and also un-close the case.
            if (field === 'CurrentStage') {
                const newStage = Number(value) || 0;
                if (newStage > 0 && Array.isArray(prevDetails.Descriptions)) {
                    update.Descriptions = prevDetails.Descriptions.map((d) => {
                        const descStage = Number(d.Stage) || 0;
                        if (descStage > newStage) {
                            return { ...d, Timestamp: null, IsNew: false };
                        }
                        return d;
                    });
                }
                // If we're going backwards, un-close the case
                if (newStage > 0 && prevDetails.IsClosed) {
                    update.IsClosed = false;
                }
            }

            return update;
        });
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

        const payload = { ...caseData, UserIds: caseData.Users.map(u => u.UserId) };
        saveCase(payload);
    };

    const handleUpdateCase = () => {
        setHasSubmitted(true);
        const errors = validateCaseData(caseData);
        setFieldErrors(errors);
        if (Object.keys(errors).length) return;

        const payload = { ...caseData, UserIds: caseData.Users.map(u => u.UserId) };
        saveCase(caseData.CaseId, payload);
    };

    const handleDeleteCase = () => {
        openConfirm(
            <ConfirmationDialog
                title={t('cases.deleteCase')}
                message={t('cases.deleteCaseConfirm')}
                confirmText={t('cases.deleteCase')}
                cancelText={t('common.cancel')}
                danger
                onCancel={closeConfirm}
                onConfirm={() => {
                    closeConfirm();
                    deleteCase(caseData.CaseId);
                }}
            />
        );
    };

    const handleCustomerSelect = (userName) => {
        const selectedUser = customers.find(user => user.Name.trim() === userName.trim());

        if (selectedUser) {
            setCaseData((prevDetails) => {
                // Don't add if already linked
                if (prevDetails.Users.some(u => u.UserId === selectedUser.UserId)) return prevDetails;

                const updatedUsers = [...prevDetails.Users, {
                    UserId: selectedUser.UserId,
                    Name: selectedUser.Name,
                    Email: selectedUser.Email,
                    PhoneNumber: selectedUser.PhoneNumber,
                }];

                // Primary client = first user
                const primary = updatedUsers[0];
                return {
                    ...prevDetails,
                    Users: updatedUsers,
                    UserId: primary.UserId,
                    CustomerName: primary.Name,
                    CustomerMail: primary.Email || prevDetails.CustomerMail,
                    PhoneNumber: primary.PhoneNumber || prevDetails.PhoneNumber,
                    CompanyName: selectedUser.CompanyName || prevDetails.CompanyName,
                };
            });

            applyFieldErrorUpdates({
                CustomerName: selectedUser.Name,
                CustomerMail: selectedUser.Email,
                PhoneNumber: selectedUser.PhoneNumber,
            });
        }
    };

    const handleRemoveUser = (userId) => {
        setCaseData((prevDetails) => {
            const updatedUsers = prevDetails.Users.filter(u => u.UserId !== userId);
            const primary = updatedUsers[0];
            return {
                ...prevDetails,
                Users: updatedUsers,
                UserId: primary?.UserId || null,
                CustomerName: primary?.Name || '',
                CustomerMail: primary?.Email || '',
                PhoneNumber: primary?.PhoneNumber || '',
            };
        });
    };

    const handleManagerSelected = (selectedManager) => {
        const selectedAdmin = adminByName.find(admin => admin.name === selectedManager);
        if (!selectedAdmin) return;

        setCaseData((prevDetails) => ({
            ...prevDetails,
            CaseManager: selectedAdmin.name,
            CaseManagerId: selectedAdmin.userid
        }));

        applyFieldErrorUpdates({ CaseManagerId: selectedAdmin.userid });
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
                Users: caseDetails.Users || (caseDetails.UserId ? [{ UserId: caseDetails.UserId, Name: caseDetails.CustomerName || '', Email: caseDetails.CustomerMail || '', PhoneNumber: caseDetails.PhoneNumber || '' }] : []),
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
                            title={t('cases.caseNumber')}
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
                            title={t('cases.caseNumber')}
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
                        title={t('cases.caseType')}
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
                    <SimpleContainer className="lw-caseFullView__field lw-caseFullView__clientsCol">
                        <SearchInput
                            onSearch={searchCustomers}
                            title={t('cases.customerName')}
                            value={caseData.CustomerName}
                            isPerforming={isPerformingCustomers}
                            getButtonTextFunction={(item) => item.Name}
                            buttonPressFunction={handleCustomerSelect}
                            queryResult={customers}
                            error={fieldErrors?.CustomerName}
                        />
                        {caseData.Users.length > 0 && (
                            <SimpleContainer className="lw-caseFullView__clientChips">
                                {caseData.Users.map((u) => (
                                    <span key={u.UserId} className="lw-caseFullView__clientChip">
                                        {u.Name}
                                        <button type="button" className="lw-caseFullView__chipRemove" onClick={() => handleRemoveUser(u.UserId)}>&times;</button>
                                    </span>
                                ))}
                            </SimpleContainer>
                        )}
                    </SimpleContainer>
                    <SimpleInput
                        className="lw-caseFullView__field"
                        title={t('cases.companyName')}
                        value={caseData.CompanyName}
                        onChange={(e) => handleInputChange('CompanyName', e.target.value)}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-caseFullView__row">
                    <SimpleInput
                        className="lw-caseFullView__field"
                        title={t('cases.phoneNumber')}
                        value={caseData.PhoneNumber}
                        onChange={(e) => handleInputChange('PhoneNumber', e.target.value)}
                        error={fieldErrors?.PhoneNumber}
                    />
                    <SimpleInput
                        className="lw-caseFullView__field"
                        title={t('cases.currentStage')}
                        value={caseData.CurrentStage}
                        onChange={(e) => handleInputChange('CurrentStage', e.target.value)}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-caseFullView__row">
                    <SimpleInput
                        className="lw-caseFullView__field"
                        title={t('cases.customerEmail')}
                        type="email"
                        value={caseData.CustomerMail}
                        onChange={(e) => handleInputChange('CustomerMail', e.target.value)}
                        error={fieldErrors?.CustomerMail}
                    />
                    <SearchInput
                        onSearch={getAdminByName}
                        title={t('cases.caseManager')}
                        value={caseData.CaseManager}
                        isPerforming={isPerformingGetAdmin}
                        getButtonTextFunction={(item) => item.name}
                        buttonPressFunction={handleManagerSelected}
                        queryResult={adminByName}
                        className="lw-caseFullView__field"
                        error={fieldErrors?.CaseManager}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-caseFullView__row">
                    <SimpleInput
                        className="lw-caseFullView__field"
                        title={t('cases.estimatedCompletionDate')}
                        type="date"
                        lang="he-IL"
                        value={formatDateForInput(caseData.EstimatedCompletionDate)}
                        onChange={(e) => handleInputChange('EstimatedCompletionDate', e.target.value)}
                    />
                    <SimpleInput
                        className="lw-caseFullView__field"
                        title={t('cases.licenseExpiryDate')}
                        type="date"
                        lang="he-IL"
                        value={formatDateForInput(caseData.LicenseExpiryDate)}
                        onChange={(e) => handleInputChange('LicenseExpiryDate', e.target.value)}
                    />
                </SimpleContainer>

                {caseData?.Descriptions?.map((description, index) => (
                    <SimpleContainer
                        key={`DescriptionNumber${description.DescriptionId || index}`}
                        className="lw-caseFullView__textAreaRow"
                    >
                        <SimpleContainer className="lw-caseFullView__stageHeader">
                            <SimpleContainer className="lw-caseFullView__stageArrows">
                                {index > 0 && (
                                    <button type="button" className="lw-caseFullView__arrowBtn" onClick={() => moveStage(index, index - 1)} title={t('common.moveUp')}>&#x25B2;</button>
                                )}
                                {index < caseData.Descriptions.length - 1 && (
                                    <button type="button" className="lw-caseFullView__arrowBtn" onClick={() => moveStage(index, index + 1)} title={t('common.moveDown')}>&#x25BC;</button>
                                )}
                            </SimpleContainer>
                            {caseData.Descriptions.length > 1 && (
                                <button
                                    type="button"
                                    className="lw-caseFullView__removeStageBtn"
                                    onClick={() => {
                                        setCaseData((prev) => {
                                            const updated = prev.Descriptions.filter((_, i) => i !== index)
                                                .map((d, i) => ({ ...d, Stage: i + 1 }));
                                            return { ...prev, Descriptions: updated };
                                        });
                                    }}
                                    title={t('cases.removeStage')}
                                >&#x2715;</button>
                            )}
                        </SimpleContainer>
                        <SimpleTextArea
                            title={t('cases.descriptionNumber', { number: index + 1 })}
                            value={description?.Text || ''}
                            onChange={(text) => {
                                setCaseData((prevDetails) => {
                                    const updatedDescriptions = prevDetails.Descriptions.map((d, i) =>
                                        i === index ? { ...d, Text: text } : d
                                    );
                                    return { ...prevDetails, Descriptions: updatedDescriptions };
                                });
                            }}
                        />

                    </SimpleContainer>
                ))}

                <SimpleContainer className="lw-caseFullView__addStageRow">
                    <SecondaryButton
                        onPress={() => {
                            setCaseData((prev) => {
                                const nextStage = (prev.Descriptions?.length || 0) + 1;
                                return {
                                    ...prev,
                                    Descriptions: [
                                        ...(prev.Descriptions || []),
                                        { Stage: nextStage, Text: '', Timestamp: null, IsNew: false },
                                    ],
                                };
                            });
                        }}
                        size={buttonSizes.SMALL}
                        style={{ height: 20, padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    >
                        {t('cases.addStage')}
                    </SecondaryButton>
                </SimpleContainer>

                <SimpleContainer className="lw-caseFullView__buttonsRow">
                    {((caseDetails != null) || caseHasBeenChosen) && (
                        <SecondaryButton
                            onPress={handleDeleteCase}
                            isPerforming={isDeleting}
                            size={buttonSizes.MEDIUM}
                        >
                            {isDeleting ? t('common.deleting') : t('cases.deleteCase')}
                        </SecondaryButton>
                    )}
                    <PrimaryButton
                        onPress={caseDetails ? handleUpdateCase : handleSaveCase}
                        isPerforming={isSaving}
                        size={buttonSizes.MEDIUM}
                    >
                        {isSaving ? t('common.saving') : caseDetails || caseHasBeenChosen ? t('cases.updateCase') : t('cases.saveCase')}
                    </PrimaryButton>
                    <SecondaryButton
                        onPress={() => closePopUpFunction?.()}
                        size={buttonSizes.MEDIUM}
                        className="lw-cancelButton"
                    >
                        {t('common.cancel')}
                    </SecondaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}
