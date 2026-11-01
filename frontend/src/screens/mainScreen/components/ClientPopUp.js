import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from 'react-router-dom';
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { customersApi } from "../../../api/customersApi";
import useHttpRequest from "../../../hooks/useHttpRequest";
import useFieldState from "../../../hooks/useFieldState";
import { clientDocumentProfile, clientDocumentProfileErrors, hasClientDocumentProfile, invalidClientText } from "../../../functions/validation/clientDocumentProfile";
import SegmentedSwitch from "../../../components/styledComponents/SegmentedSwitch";
import SigningSelect from "../../signingScreen/templates/SigningSelect";
import emailValidation from "../../../functions/validation/EmailValidation";
import IsraeliPhoneNumberValidation from "../../../functions/validation/IsraeliPhoneNumberValidation";
import ClientSigningFlow from '../../signingScreen/templates/ClientSigningFlow';
import { useSigningV2Available } from '../../signingScreen/templates/SigningPackagesHub';
import { useFirmPermissions } from '../../../providers/FirmPermissionsProvider';
import { useTranslation } from "react-i18next";
import SimplePopUp from "../../../components/simpleComponents/SimplePopUp";
import SearchInput from "../../../components/specializedComponents/containers/SearchInput";

import { parseDateInput, toNativeDateValue } from "../../../functions/date/formatDateForInput";
import "./ClientPopUp.scss";
import { AdminStackName, SigningManagerScreenName } from '../../../navigation/screenPaths';

export default function ClientPopup({
    clientDetails,
    initialName,
    initialPhone,
    initialEmail,
    initialCompanyName,
    rePerformRequest,
    onFailureFunction,
    closePopUpFunction,
    style: _style,
}) {
    const { t, i18n } = useTranslation();
    const direction = i18n.dir();
    const profileText = key => t(`customers.documentProfile.${key}`);
    const validateName = value => invalidClientText(value) ? profileText('invalidText') : null;
    const navigate = useNavigate();
    const { canAction } = useFirmPermissions() || { canAction: () => false };
    const signingAvailable = useSigningV2Available();
    const [signingOpen, setSigningOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState(clientDetails || null);
    const [name, setName, nameError] = useFieldState(
        validateName,
        clientDetails?.Name || clientDetails?.name || initialName || ""
    );
    const [companyName, setCompanyName, companyNameError] = useFieldState(
        validateName,
        clientDetails?.CompanyName || clientDetails?.companyname || initialCompanyName || ""
    );
    const [email, setEmail, emailError] = useFieldState(
        emailValidation,
        clientDetails?.Email || clientDetails?.email || initialEmail || ""
    );
    const [phoneNumber, setPhoneNumber, phoneNumberError] = useFieldState(
        IsraeliPhoneNumberValidation,
        clientDetails?.PhoneNumber || clientDetails?.phonenumber || initialPhone || ""
    );
    const [documentProfile, setDocumentProfile] = useState(() => clientDocumentProfile(clientDetails));
    const [profileDirty, setProfileDirty] = useState(false);
    const [profileLoaded, setProfileLoaded] = useState(() => !clientDetails || hasClientDocumentProfile(clientDetails));
    const [profileLoadError, setProfileLoadError] = useState(false);
    const profileLoadRequest = useRef(0);
    const profileErrors = useMemo(() => clientDocumentProfileErrors(documentProfile), [documentProfile]);
    const hasProfileError = Object.keys(profileErrors).length > 0;
    const updateProfile = (section, key, value) => {
        if (!profileLoaded) return;
        setProfileDirty(true);
        setDocumentProfile(previous => ({ ...previous, [section]: { ...previous[section], [key]: value } }));
    };
    const [dateOfBirth, setDateOfBirth] = useState((clientDetails?.DateOfBirth || clientDetails?.dateofbirth) ? toNativeDateValue(clientDetails.DateOfBirth || clientDetails.dateofbirth) : "");

    useEffect(() => {
        const request = ++profileLoadRequest.current;
        const id = selectedClient?.UserId || selectedClient?.userid;
        setProfileDirty(false);
        setProfileLoadError(false);
        if (!id || hasClientDocumentProfile(selectedClient)) {
            setProfileLoaded(true);
            setDocumentProfile(clientDocumentProfile(selectedClient));
            return;
        }
        setProfileLoaded(false);
        let cancelled = false;
        Promise.resolve().then(() => customersApi.getCustomerById(id)).then(response => {
            if (cancelled || request !== profileLoadRequest.current) return;
            const customer = response?.data;
            if (response?.status !== 200 || Number(customer?.UserId || customer?.userid) !== Number(id)
                || !hasClientDocumentProfile(customer)) throw new Error('Profile unavailable');
            setDocumentProfile(clientDocumentProfile(customer));
            setProfileLoaded(true);
        }).catch(() => {
            if (!cancelled && request === profileLoadRequest.current) setProfileLoadError(true);
        });
        return () => { cancelled = true; };
    }, [selectedClient]);

    const { result: customersByName, isPerforming: isPerformingCustomersByName, performRequest: searchCustomersByName } = useHttpRequest(customersApi.getCustomersByName, null, () => { });
    const { result: companiesByName, isPerforming: isPerformingCompaniesByName, performRequest: searchCompaniesByName } = useHttpRequest(customersApi.getCompaniesByName, null, () => { });

    const [existingMatch, setExistingMatch] = useState(null);
    const detectPhoneTimerRef = useRef(null);
    const detectEmailTimerRef = useRef(null);

    const detectExisting = useCallback(async (query) => {
        if (!query || query.length < 3) { setExistingMatch(null); return; }
        try {
            const results = await customersApi.getCustomersByName(query);
            const list = Array.isArray(results) ? results : (results?.data || []);
            if (list.length > 0) {
                const match = list[0];
                const matchId = match.UserId || match.userid;
                const currentId = selectedClient?.UserId || selectedClient?.userid;
                if (matchId && matchId !== currentId) {
                    setExistingMatch(match);
                    return;
                }
            }
            setExistingMatch(null);
        } catch { setExistingMatch(null); }
    }, [selectedClient]);

    useEffect(() => {
        if (detectPhoneTimerRef.current) clearTimeout(detectPhoneTimerRef.current);
        const phone = (phoneNumber || '').trim();
        const digits = phone.replace(/\D/g, '');
        if (digits.length >= 7) {
            detectPhoneTimerRef.current = setTimeout(() => detectExisting(phone), 500);
        } else {
            setExistingMatch(null);
        }
        return () => { if (detectPhoneTimerRef.current) clearTimeout(detectPhoneTimerRef.current); };
    }, [phoneNumber, detectExisting]);

    useEffect(() => {
        if (detectEmailTimerRef.current) clearTimeout(detectEmailTimerRef.current);
        const emailVal = (email || '').trim();
        if (emailVal && emailVal.includes('@') && emailVal.includes('.')) {
            detectEmailTimerRef.current = setTimeout(() => detectExisting(emailVal), 500);
        }
        return () => { if (detectEmailTimerRef.current) clearTimeout(detectEmailTimerRef.current); };
    }, [email, detectExisting]);

    const loadExistingClient = () => {
        if (!existingMatch) return;
        setSelectedClient(existingMatch);
        setDocumentProfile(clientDocumentProfile(existingMatch));
        setProfileDirty(false);
        setProfileLoaded(hasClientDocumentProfile(existingMatch));
        setName(existingMatch.Name || existingMatch.name || "");
        setPhoneNumber(existingMatch.PhoneNumber || existingMatch.phonenumber || "");
        setEmail(existingMatch.Email || existingMatch.email || "");
        setCompanyName(existingMatch.CompanyName || existingMatch.companyname || "");
        setDateOfBirth(existingMatch.DateOfBirth || existingMatch.dateofbirth ? toNativeDateValue(existingMatch.DateOfBirth || existingMatch.dateofbirth) : "");
        setExistingMatch(null);
    };

    const handleSelectCustomer = (_text, customer) => {
        setSelectedClient(customer);
        setDocumentProfile(clientDocumentProfile(customer));
        setProfileDirty(false);
        setProfileLoaded(hasClientDocumentProfile(customer));
        setName(customer.Name || customer.name || "");
        setPhoneNumber(customer.PhoneNumber || customer.phonenumber || "");
        setEmail(customer.Email || customer.email || "");
        setCompanyName(customer.CompanyName || customer.companyname || "");
        setDateOfBirth(customer.DateOfBirth || customer.dateofbirth ? toNativeDateValue(customer.DateOfBirth || customer.dateofbirth) : "");
    };

    const handleSelectCompany = (_text, company) => {
        setCompanyName(_text || company?.Name || company?.CompanyName || "");
    };

    const handleSearchCustomer = (query) => {
        setName(query);
        searchCustomersByName(query);
    };

    const handleSearchCompany = (query) => {
        setCompanyName(query);
        searchCompaniesByName(query);
    };

    const [saveDisabledReason, setSaveDisabledReason] = useState('');
    const [isLegalDeleteConfirmOpen, setIsLegalDeleteConfirmOpen] = useState(false);
    const [legalDeleteMessage, setLegalDeleteMessage] = useState("");

    const hasError = Boolean(saveDisabledReason);

    useEffect(() => {
        const hasName = Boolean((name || '').trim());
        const hasPhone = Boolean((phoneNumber || '').trim());
        const hasEmail = Boolean((email || '').trim());
        const contactOk = hasPhone || hasEmail;
        const fieldErrors = Boolean(
            nameError
            || companyNameError
            || (hasPhone && phoneNumberError)
            || (hasEmail && emailError)
        );

        if (!hasName) {
            setSaveDisabledReason(t('customers.saveBlockedMissingName', { defaultValue: 'נא למלא שם לקוח' }));
        } else if (!contactOk) {
            setSaveDisabledReason(t('customers.contactRequiredHint'));
        } else if (hasPhone && phoneNumberError) {
            setSaveDisabledReason(phoneNumberError);
        } else if (hasEmail && emailError) {
            setSaveDisabledReason(emailError);
        } else if (documentProfile.partyType === 'organization' && !(companyName || '').trim()) {
            setSaveDisabledReason(t('customers.documentProfile.requiredCompanyName'));
        } else if (hasProfileError) {
            setSaveDisabledReason(t('customers.documentProfile.invalidProfile'));
        } else if (fieldErrors) {
            setSaveDisabledReason(t('customers.saveBlockedInvalidFields', { defaultValue: 'נא לתקן את השדות המסומנים' }));
        } else {
            setSaveDisabledReason('');
        }
    }, [name, phoneNumber, email, companyName, nameError, phoneNumberError, emailError, companyNameError, documentProfile.partyType, hasProfileError, t]);

    const { isPerforming, performRequest } = useHttpRequest(
        selectedClient ? customersApi.updateCustomerById : customersApi.addCustomer,
        (data) => {
            closePopUpFunction?.();
            const savedClient = selectedClient
                ? {
                    UserId: selectedClient.UserId || selectedClient.userid,
                    Name: (name || '').trim() || selectedClient.Name || selectedClient.name,
                    Email: (email || '').trim() || null,
                    PhoneNumber: (phoneNumber || '').trim() || null,
                    CompanyName: (companyName || '').trim() || null,
                    ...(data?.ClientProfile || profileLoaded ? { ClientProfile: data?.ClientProfile || documentProfile } : {}),
                    DateOfBirth: parseDateInput(dateOfBirth) || null,
                }
                : {
                    UserId: data?.UserId,
                    Name: data?.Name || (name || '').trim(),
                    Email: data?.Email ?? ((email || '').trim() || null),
                    PhoneNumber: data?.PhoneNumber ?? ((phoneNumber || '').trim() || null),
                    CompanyName: data?.CompanyName ?? ((companyName || '').trim() || null),
                    ClientProfile: data?.ClientProfile || documentProfile,
                    DateOfBirth: data?.DateOfBirth || parseDateInput(dateOfBirth) || null,
                };
            rePerformRequest?.(savedClient);
        },
    );

    const handleDeleteFailure = (err) => {
        const status = Number(err?.status);
        const errorCode = String(err?.data?.errorCode || err?.data?.code || '').trim();

        if (status === 409 && errorCode === 'CLIENT_HAS_LEGAL_DATA') {
            setLegalDeleteMessage(
                String(
                    err?.data?.message ||
                    'ללקוח יש נתונים משפטיים. מחיקה שלו עלולה לפגוע באמינות המסמכים והראיות. האם אתה מאשר למחוק בכל זאת?'
                )
            );
            setIsLegalDeleteConfirmOpen(true);
            return;
        }

        onFailureFunction?.(err);
    };

    const { isPerforming: isPerformingDeleteClient, performRequest: deleteClient } = useHttpRequest(
        customersApi.deleteCustomerById,
        () => {
            closePopUpFunction?.();
            rePerformRequest?.();
        },
        handleDeleteFailure
    );

    const handleSaveClient = () => {
        const clientData = {
            name: (name || '').trim(),
            phoneNumber: (phoneNumber || '').trim(),
            email: (email || '').trim(),
            companyName: (companyName || '').trim(),
            ...(!selectedClient || (profileLoaded && profileDirty) ? { clientProfile: documentProfile } : {}),
            dateOfBirth: parseDateInput(dateOfBirth) || null
        };

        if (selectedClient) {
            performRequest(selectedClient.UserId || selectedClient.userid, clientData);
        } else {
            performRequest(clientData);
        }
    };

    const handleDeleteClient = () => {
        deleteClient(selectedClient.UserId || selectedClient.userid);
    };

    const handleConfirmLegalDelete = () => {
        setIsLegalDeleteConfirmOpen(false);
        deleteClient(selectedClient.UserId || selectedClient.userid, { confirmLegalDelete: true });
    };

    const profileInput = (section, key, label, maxLength, inputDirection = direction) => <SimpleInput
        className="lw-clientPopup__input" title={profileText(label)} aria-label={profileText(label)}
        containerDir={inputDirection} value={documentProfile[section][key]} maxLength={maxLength} timeToWaitInMilli={0}
        autoComplete="off" onChange={event => updateProfile(section, key, event.target.value)}
        error={profileErrors[`${section}.${key}`] ? profileText('invalidText') : null} />;

    const persistedClientId = selectedClient?.UserId || selectedClient?.userid;
    const openWordDocument = () => {
        const id = Number(persistedClientId);
        if (!Number.isSafeInteger(id) || id <= 0) return;
        // Selected identity is persisted; current unsaved profile fields are not copied.
        const initialContext = { clientRecord: { id, label: String(selectedClient?.name || selectedClient?.Name || '') } };
        closePopUpFunction?.();
        navigate(`${AdminStackName}${SigningManagerScreenName}?panel=templates&mode=word`, { state: { wordInitialContext: initialContext } });
    };
    if (signingOpen) return <ClientSigningFlow clientId={persistedClientId} onBack={() => setSigningOpen(false)} />;

    return (
        <SimpleContainer className="lw-clientPopup" dir={direction}>
            <SimplePopUp
                isOpen={isLegalDeleteConfirmOpen}
                onClose={() => setIsLegalDeleteConfirmOpen(false)}
                className="lw-clientPopup__legalDeletePopUp"
            >
                <SimpleContainer className="lw-clientPopup__legalDeleteModal">
                    <SimpleContainer className="lw-clientPopup__legalDeleteText">
                        {legalDeleteMessage}
                    </SimpleContainer>
                    <SimpleContainer className="lw-clientPopup__legalDeleteButtons">
                        <SecondaryButton
                            className="lw-clientPopup__legalDeleteBtn"
                            size={buttonSizes.MEDIUM}
                            onPress={() => setIsLegalDeleteConfirmOpen(false)}
                        >
                            ביטול
                        </SecondaryButton>
                        <PrimaryButton
                            className="lw-clientPopup__legalDeleteBtn"
                            size={buttonSizes.MEDIUM}
                            onPress={handleConfirmLegalDelete}
                            disabled={isPerformingDeleteClient}
                        >
                            אני מאשר
                        </PrimaryButton>
                    </SimpleContainer>
                </SimpleContainer>
            </SimplePopUp>
            <SimpleScrollView>
                {existingMatch && (
                    <SimpleContainer className="lw-clientPopup__existingBanner" onPress={loadExistingClient}>
                        <span className="lw-clientPopup__existingIcon">ℹ️</span>
                        <span>
                            {t('customers.existingClientFound', {
                                defaultValue: 'לקוח קיים במערכת: {{name}}',
                                name: existingMatch.Name || existingMatch.name,
                            })}
                            {' — '}
                            {t('customers.clickToLoad', { defaultValue: 'לחץ לטעינה' })}
                        </span>
                    </SimpleContainer>
                )}
                <SegmentedSwitch className="lw-clientPopup__partyType" title={profileText('partyType')}
                    value={documentProfile.partyType} onChange={partyType => {
                        if (!profileLoaded) return;
                        setProfileDirty(true);
                        setDocumentProfile(previous => ({ ...previous, partyType }));
                    }}
                    options={['person', 'organization'].map(value => ({ value, label: profileText(value), disabled: !profileLoaded }))} />
                {!profileLoaded && <p role="status">{profileText(profileLoadError ? 'loadFailed' : 'loading')}</p>}
                <SimpleContainer className="lw-clientPopup__row">
                    <SearchInput
                        className="lw-clientPopup__input"
                        containerDir={direction}
                        title={documentProfile.partyType === 'organization' ? profileText('contactName') : t("cases.customerName")}
                        aria-label={documentProfile.partyType === 'organization' ? profileText('contactName') : t("cases.customerName")}
                        value={name}
                        onSearch={handleSearchCustomer}
                        isPerforming={isPerformingCustomersByName}
                        queryResult={customersByName}
                        getButtonTextFunction={(item) => item.Name || item.name}
                        buttonPressFunction={handleSelectCustomer}
                        error={nameError}
                    />
                    <SimpleInput
                        className="lw-clientPopup__input"
                        containerDir={direction}
                        title={t("cases.phoneNumber")}
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        error={phoneNumberError}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-clientPopup__row">
                    <SimpleInput
                        className="lw-clientPopup__input"
                        containerDir={direction}
                        title={t("common.email")}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        error={emailError}
                    />
                    <SearchInput
                        className="lw-clientPopup__input"
                        containerDir={direction}
                        title={documentProfile.partyType === 'organization' ? profileText('registeredName') : t("customers.companyName")}
                        aria-label={documentProfile.partyType === 'organization' ? profileText('registeredName') : t("customers.companyName")}
                        value={companyName}
                        onSearch={handleSearchCompany}
                        isPerforming={isPerformingCompaniesByName}
                        queryResult={companiesByName}
                        getButtonTextFunction={(item) => item.Name || item.name}
                        buttonPressFunction={handleSelectCompany}
                        error={companyNameError}
                        clearOnSelect={false}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-clientPopup__row">
                    <SimpleInput
                        className="lw-clientPopup__input"
                        containerDir={direction}
                        title={t("profile.dateOfBirth")}
                        type="date"
                        value={dateOfBirth || ""}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                    />
                </SimpleContainer>

                <details className="lw-clientPopup__documentProfile" open={hasProfileError || undefined}>
                    <summary>{profileText('title')}</summary>
                    <p className="lw-clientPopup__profileHelp">{profileText('help')}</p>
                    <fieldset className="lw-clientPopup__profileFields" disabled={!profileLoaded}>
                    {documentProfile.partyType === 'organization' && <fieldset className="lw-clientPopup__profileGroup">
                        <legend>{profileText('organizationIdentity')}</legend>
                        <label className="lw-clientPopup__profileSelect">{profileText('registrationType')}
                            <SigningSelect dir={direction} value={documentProfile.organization.registrationType}
                                onChange={event => updateProfile('organization', 'registrationType', event.target.value)}>
                                {['company', 'partnership', 'nonprofit', 'other'].map(value => <option key={value} value={value}>
                                    {profileText({ company: 'registrationCompany', partnership: 'registrationPartnership', nonprofit: 'registrationNonprofit', other: 'registrationOther' }[value])}
                                </option>)}
                            </SigningSelect>
                        </label>
                        <SimpleContainer className="lw-clientPopup__row">
                            {profileInput('organization', 'registrationNumber', 'registrationNumber', 40, 'ltr')}
                            {profileInput('organization', 'registrationCountry', 'registrationCountry', 80)}
                        </SimpleContainer>
                    </fieldset>}
                    <fieldset className="lw-clientPopup__profileGroup">
                        <legend>{profileText(documentProfile.partyType === 'organization' ? 'contactIdentity' : 'personIdentity')}</legend>
                        <label className="lw-clientPopup__profileSelect">{profileText('identityType')}
                            <SigningSelect dir={direction} value={documentProfile.identity.type}
                                onChange={event => updateProfile('identity', 'type', event.target.value)}>
                                {['national_id', 'passport', 'other'].map(value => <option key={value} value={value}>{profileText(value)}</option>)}
                            </SigningSelect>
                        </label>
                        <SimpleContainer className="lw-clientPopup__row">
                            {profileInput('identity', 'number', 'identityNumber', 40, 'ltr')}
                            {profileInput('identity', 'country', 'identityCountry', 80)}
                        </SimpleContainer>
                    </fieldset>
                    <fieldset className="lw-clientPopup__profileGroup">
                        <legend>{profileText('address')}</legend>
                        <SimpleContainer className="lw-clientPopup__row">
                            {profileInput('address', 'line1', 'line1', 250)}
                            {profileInput('address', 'line2', 'line2', 250)}
                        </SimpleContainer>
                        <SimpleContainer className="lw-clientPopup__row">
                            {profileInput('address', 'city', 'city', 100)}
                            {profileInput('address', 'postalCode', 'postalCode', 24, 'ltr')}
                            {profileInput('address', 'country', 'country', 80)}
                        </SimpleContainer>
                    </fieldset>
                    </fieldset>
                </details>
                {saveDisabledReason && <p className="lw-clientPopup__saveBlockedHint" role="status">{saveDisabledReason}</p>}

                {persistedClientId && signingAvailable && canAction('signing', 'upload') && canAction('clients', 'view') && <SecondaryButton
                    onPress={() => setSigningOpen(true)} disabled={isPerforming || isPerformingDeleteClient}>
                    {t('signingV2.compose.clientContext.send')}
                </SecondaryButton>}
                {persistedClientId && signingAvailable && canAction('signing', 'upload') && canAction('clients', 'view') && <SecondaryButton
                    onPress={openWordDocument} disabled={isPerforming || isPerformingDeleteClient}>
                    {t('signingWord.openFromClient')}
                </SecondaryButton>}
                <SimpleContainer className="lw-clientPopup__actions">
                    {selectedClient && (
                        <SecondaryButton
                            className="lw-clientPopup__actionButton"
                            size={buttonSizes.MEDIUM}
                            onPress={handleDeleteClient}
                        >
                            {isPerformingDeleteClient ? t("common.deleting") : t("customers.deleteCustomer")}
                        </SecondaryButton>
                    )}
                    <PrimaryButton
                        className="lw-clientPopup__actionButton"
                        size={buttonSizes.MEDIUM}
                        onPress={handleSaveClient}
                        disabled={hasError || isPerforming || isPerformingDeleteClient}
                    >
                        {isPerforming
                            ? t("common.saving")
                            : !selectedClient
                                ? t("customers.saveCustomer")
                                : t("customers.updateCustomer")}
                    </PrimaryButton>
                    <SecondaryButton
                        className="lw-cancelButton"
                        size={buttonSizes.MEDIUM}
                        onPress={() => closePopUpFunction?.()}
                    >
                        {t("common.cancel")}
                    </SecondaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}
