import { useEffect, useState } from "react";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { customersApi } from "../../../api/customersApi";
import useHttpRequest from "../../../hooks/useHttpRequest";

export default function ClientPopup({ clientDetails, rePerformRequest, onFailureFunction, closePopUpFunction, style }) {
    const [client, setClient] = useState({
        name: "",
        phoneNumber: "",
        email: "",
        companyName: "",
    });

    useEffect(() => {
        if (clientDetails) {
            setClient({
                name: clientDetails.Name,
                phoneNumber: clientDetails.PhoneNumber,
                email: clientDetails.Email,
                companyName: clientDetails.CompanyName,
            });
        }
    }, [clientDetails]);

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

    const handleInputChange = (field, value) => {
        setClient((prev) => ({ ...prev, [field]: value }));
    };

    const handleSaveClient = () => {
        if (!client.name || !client.phoneNumber || !client.email || !client.companyName) {
            alert("All fields are required.");
            return;
        }

        const apiCall = clientDetails
            ? performRequest(clientDetails.UserId, client)
            : performRequest(client);

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
                        value={client.name}
                        onChange={(e) => handleInputChange("name", e.target.value)}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"מספר פלאפון"}
                        value={client.phoneNumber}
                        onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                    />
                </SimpleContainer>

                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"אימייל"}
                        value={client.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שם החברה"}
                        value={client.companyName}
                        onChange={(e) => handleInputChange("companyName", e.target.value)}
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
