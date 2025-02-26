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
import HebrewCharsValidation from "../../../functions/validation/HebrewCharsValidation";
import emailValidation from "../../../functions/validation/EmailValidation";
import IsraeliPhoneNumberValidation from "../../../functions/validation/IsraeliPhoneNumberValidation";

export default function ClientPopup({ clientDetails, rePerformRequest, onFailureFunction, closePopUpFunction, style }) {
    const [name, setName, nameError] = useFieldState(HebrewCharsValidation, clientDetails?.Name || "");
    const [companyName, setCompanyName, companyNameError] = useFieldState(HebrewCharsValidation, clientDetails?.CompanyName || "");
    const [email, setEmail, emailError] = useFieldState(emailValidation, clientDetails?.Email || "");
    const [phoneNumber, setPhoneNumber, phoneNumberError] = useFieldState(IsraeliPhoneNumberValidation, clientDetails?.PhoneNumber || "");

    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!name || !phoneNumber || !email || !companyName || nameError || phoneNumberError || emailError || companyNameError) {
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
        onFailureFunction
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
            UserId: clientDetails?.UserId,
            Name: name,
            PhoneNumber: phoneNumber,
            Email: email,
            CompanyName: companyName
        };

        const apiCall = clientDetails
            ? performRequest(clientDetails.UserId, clientData)
            : performRequest(clientData);

        apiCall.finally(() => closePopUpFunction?.());
    };

    const handleDeleteClient = () => {
        deleteClient(clientDetails.UserId);
    };

    return (
        <SimpleContainer style={{ ...style, ...styles.container }}>
            <SimpleScrollView>
                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שם לקוח"}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        error={nameError}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"מספר פלאפון"}
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        error={phoneNumberError}
                    />
                </SimpleContainer>

                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"אימייל"}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        error={emailError}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שם החברה"}
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        error={companyNameError}
                    />
                </SimpleContainer>

                <SimpleContainer style={styles.buttonsRowStyle}>
                    {clientDetails && (
                        <SecondaryButton
                            style={styles.button}
                            size={buttonSizes.MEDIUM}
                            onPress={handleDeleteClient}
                        >
                            {isPerformingDeleteClient ? "מוחק..." : "מחק לקוח"}
                        </SecondaryButton>
                    )}
                    <PrimaryButton
                        style={styles.button}
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

const styles = {
    container: {
        width: "100%",
        margin: "0 auto",
    },
    rowStyle: {
        display: "flex",
        flexDirection: "row-reverse",
        marginBottom: "16px",
        flexWrap: "wrap",
    },
    inputStyle: {
        flex: 1,
        minWidth: "150px",
    },
    buttonsRowStyle: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        marginBottom: "16px",
        marginTop: "16px",
        flexWrap: "wrap",
    },
    button: {
        margin: "8px 8px",
    },
};
