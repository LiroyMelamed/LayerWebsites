import { useEffect, useState } from "react";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { adminApi } from "../../../api/adminApi";
import useHttpRequest from "../../../hooks/useHttpRequest";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";

export default function AdminPopup({ adminDetails, rePerformRequest, onFailureFunction, closePopUpFunction, style }) {
    const [admin, setAdmin] = useState({
        name: null,
        phoneNumber: null,
        email: null,
        password: null,
    });

    console.log("adminDetails", adminDetails);


    useEffect(() => {
        if (adminDetails) {
            setAdmin({
                name: adminDetails.name,
                phoneNumber: adminDetails.phonenumber,
                email: adminDetails.email,
                password: ""
            });
        }
    }, [adminDetails]);

    const { isPerforming, performRequest } = useHttpRequest(
        adminDetails ? adminApi.updateAdmin : adminApi.addAdmin,
        () => {
            closePopUpFunction?.();
            rePerformRequest?.();
        }, onFailureFunction
    );

    const { isPerforming: isPerformingDeleteAdmin, performRequest: deleteAdmin } = useHttpRequest(
        adminApi.deleteAdmin,
        () => {
            closePopUpFunction?.();
            rePerformRequest?.();
        }, onFailureFunction
    );

    const handleInputChange = (field, value) => {
        setAdmin((prev) => ({ ...prev, [field]: value }));
    };

    const handleSaveAdmin = () => {
        if (!admin.name || !admin.phoneNumber || !admin.email) {
            alert("All fields except password are required.");
            return;
        }

        const apiCall = adminDetails
            ? performRequest(adminDetails.userid, admin)
            : performRequest(admin);

        apiCall.finally(() => closePopUpFunction?.());
    };

    const handleDeleteAdmin = () => {
        deleteAdmin(adminDetails.userid);
        closePopUpFunction?.()
    };

    return (
        <SimpleContainer style={{ ...style, ...styles.container }}>
            <SimpleScrollView>
                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שם מנהל"}
                        value={admin.name}
                        onChange={(e) => handleInputChange("name", e.target.value)}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"מספר פלאפון"}
                        type="tel"
                        value={admin.phoneNumber}
                        onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                    />
                </SimpleContainer>

                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"אימייל"}
                        type="email"
                        value={admin.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"סיסמא"}
                        value={admin.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        type="password"
                    />
                </SimpleContainer>

                <SimpleContainer style={styles.buttonsRowStyle}>
                    {adminDetails &&
                        <SecondaryButton
                            style={styles.button}
                            size={buttonSizes.MEDIUM}
                            onPress={handleDeleteAdmin}
                        >
                            {isPerformingDeleteAdmin ? "מוחק..." : "מחק מנהל"}
                        </SecondaryButton>
                    }
                    <PrimaryButton
                        style={styles.button}
                        size={buttonSizes.MEDIUM}
                        onPress={handleSaveAdmin}
                    >
                        {isPerforming ? "שומר..." : !adminDetails ? "שמור מנהל" : "עדכן מנהל"}
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
