import { useEffect, useState } from "react";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { customersApi } from "../../../api/customersApi";
import useHttpRequest from "../../../hooks/useHttpRequest";
import useFieldState from "../../../hooks/useFieldState";
import { HebrewCharsValidationWithNULL, HebrewCharsValidationWithNumbers } from "../../../functions/validation/HebrewCharsValidation";
import emailValidation from "../../../functions/validation/EmailValidation";
import IsraeliPhoneNumberValidation from "../../../functions/validation/IsraeliPhoneNumberValidation";
import { useTranslation } from "react-i18next";
import SimplePopUp from "../../../components/simpleComponents/SimplePopUp";
import SearchInput from "../../../components/specializedComponents/containers/SearchInput";

import "./ClientPopUp.scss";

export default function ClientPopup({ clientDetails, initialName, rePerformRequest, onFailureFunction, closePopUpFunction, style: _style }) {
    const { t } = useTranslation();
    const [selectedClient, setSelectedClient] = useState(clientDetails || null);
    const [name, setName, nameError] = useFieldState(
        HebrewCharsValidationWithNumbers,
        clientDetails?.name || initialName || ""
    );
    const [companyName, setCompanyName, companyNameError] = useFieldState(HebrewCharsValidationWithNULL, clientDetails?.companyname || "");
    const [email, setEmail, emailError] = useFieldState(emailValidation, clientDetails?.email || "");
    const [phoneNumber, setPhoneNumber, phoneNumberError] = useFieldState(IsraeliPhoneNumberValidation, clientDetails?.phonenumber || "");

    const { result: customersByName, isPerforming: isPerformingCustomersByName, performRequest: searchCustomersByName } = useHttpRequest(customersApi.getCustomersByName, null, () => { });

    const handleSearchCustomer = (query) => {
        setName(query);
        searchCustomersByName(query);
    };

    const handleSelectCustomer = (_text, customer) => {
        setSelectedClient(customer);
        setName(customer.Name || customer.name || "");
        setPhoneNumber(customer.PhoneNumber || customer.phonenumber || "");
        setEmail(customer.Email || customer.email || "");
        setCompanyName(customer.CompanyName || customer.companyname || "");
    };

    const [hasError, setHasError] = useState(false);
    const [isLegalDeleteConfirmOpen, setIsLegalDeleteConfirmOpen] = useState(false);
    const [legalDeleteMessage, setLegalDeleteMessage] = useState("");

    useEffect(() => {
        if (!name || !phoneNumber || !email || nameError || phoneNumberError || emailError) {
            setHasError(true)
        } else {
            setHasError(false)
        }
    }, [name, phoneNumber, email, companyName, nameError, phoneNumberError, emailError, companyNameError])

    const { isPerforming, performRequest } = useHttpRequest(
        selectedClient ? customersApi.updateCustomerById : customersApi.addCustomer,
        () => {

            closePopUpFunction?.();
            rePerformRequest?.();
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
            name: name,
            phoneNumber: phoneNumber,
            email: email,
            companyName: companyName
        };

        const apiCall = selectedClient
            ? performRequest(selectedClient.UserId || selectedClient.userid, clientData)
            : performRequest(clientData);

        apiCall.finally(() => closePopUpFunction?.());
    };

    const handleDeleteClient = () => {
        deleteClient(selectedClient.UserId || selectedClient.userid);
    };

    const handleConfirmLegalDelete = () => {
        setIsLegalDeleteConfirmOpen(false);
        deleteClient(selectedClient.UserId || selectedClient.userid, { confirmLegalDelete: true });
    };

    return (
        <SimpleContainer className="lw-clientPopup">
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
                <SimpleContainer className="lw-clientPopup__row">
                    <SearchInput
                        className="lw-clientPopup__input"
                        title={t("cases.customerName")}
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
                        title={t("common.email")}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        error={emailError}
                    />
                    <SimpleInput
                        className="lw-clientPopup__input"
                        title={t("customers.companyName")}
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        error={companyNameError}
                    />
                </SimpleContainer>

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
                        disabled={hasError}
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
