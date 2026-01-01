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

import "./ClientPopUp.scss";

export default function ClientPopup({ clientDetails, initialName, rePerformRequest, onFailureFunction, closePopUpFunction, style }) {
    const [name, setName, nameError] = useFieldState(
        HebrewCharsValidationWithNumbers,
        clientDetails?.name || initialName || ""
    );
    const [companyName, setCompanyName, companyNameError] = useFieldState(HebrewCharsValidationWithNULL, clientDetails?.companyname || "");
    const [email, setEmail, emailError] = useFieldState(emailValidation, clientDetails?.email || "");
    const [phoneNumber, setPhoneNumber, phoneNumberError] = useFieldState(IsraeliPhoneNumberValidation, clientDetails?.phonenumber || "");

    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!name || !phoneNumber || !email || nameError || phoneNumberError || emailError) {
            setHasError(true)
        } else {
            setHasError(false)
        }
    }, [name, phoneNumber, email, companyName, nameError, phoneNumberError, emailError, companyNameError])

    const { isPerforming, performRequest } = useHttpRequest(
        clientDetails ? customersApi.updateCustomerById : customersApi.addCustomer,
        () => {

            closePopUpFunction?.();
            rePerformRequest?.();
        },
    );

    const { isPerforming: isPerformingDeleteClient, performRequest: deleteClient } = useHttpRequest(
        customersApi.deleteCustomerById,
        () => {
            closePopUpFunction?.();
            rePerformRequest?.();
        },
        onFailureFunction
    );

    const handleSaveClient = () => {
        const clientData = {
            name: name,
            phoneNumber: phoneNumber,
            email: email,
            companyName: companyName
        };

        const apiCall = clientDetails
            ? performRequest(clientDetails.userid, clientData)
            : performRequest(clientData);

        apiCall.finally(() => closePopUpFunction?.());
    };

    const handleDeleteClient = () => {
        deleteClient(clientDetails.userid);
    };

    return (
        <SimpleContainer className="lw-clientPopup" style={style}>
            <SimpleScrollView>
                <SimpleContainer className="lw-clientPopup__row">
                    <SimpleInput
                        className="lw-clientPopup__input"
                        title={"שם לקוח"}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        error={nameError}
                    />
                    <SimpleInput
                        className="lw-clientPopup__input"
                        title={"מספר פלאפון"}
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        error={phoneNumberError}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-clientPopup__row">
                    <SimpleInput
                        className="lw-clientPopup__input"
                        title={"אימייל"}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        error={emailError}
                    />
                    <SimpleInput
                        className="lw-clientPopup__input"
                        title={"שם החברה"}
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        error={companyNameError}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-clientPopup__actions">
                    {clientDetails && (
                        <SecondaryButton
                            className="lw-clientPopup__actionButton"
                            size={buttonSizes.MEDIUM}
                            onPress={handleDeleteClient}
                        >
                            {isPerformingDeleteClient ? "מוחק..." : "מחק לקוח"}
                        </SecondaryButton>
                    )}
                    <PrimaryButton
                        className="lw-clientPopup__actionButton"
                        size={buttonSizes.MEDIUM}
                        onPress={handleSaveClient}
                        disabled={hasError}
                    >
                        {isPerforming ? "שומר..." : !clientDetails ? "שמור לקוח" : "עדכן לקוח"}
                    </PrimaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}
