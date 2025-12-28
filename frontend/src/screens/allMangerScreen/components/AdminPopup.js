import { useEffect, useState } from "react";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { adminApi } from "../../../api/adminApi";
import useHttpRequest from "../../../hooks/useHttpRequest";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";

import "./AdminPopup.scss";

export default function AdminPopup({ adminDetails, rePerformRequest, onFailureFunction, closePopUpFunction, style }) {
    const [admin, setAdmin] = useState({
        name: null,
        phoneNumber: null,
        email: null,
        password: null,
    });

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
        <SimpleContainer className="lw-adminPopup" style={style}>
            <SimpleScrollView>
                <SimpleContainer className="lw-adminPopup__row">
                    <SimpleInput
                        className="lw-adminPopup__input"
                        title={"שם מנהל"}
                        value={admin.name}
                        onChange={(e) => handleInputChange("name", e.target.value)}
                    />
                    <SimpleInput
                        className="lw-adminPopup__input"
                        title={"מספר פלאפון"}
                        type="tel"
                        value={admin.phoneNumber}
                        onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-adminPopup__row">
                    <SimpleInput
                        className="lw-adminPopup__input"
                        title={"אימייל"}
                        type="email"
                        value={admin.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                    />
                    <SimpleInput
                        className="lw-adminPopup__input"
                        title={"סיסמא"}
                        value={admin.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        type="password"
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-adminPopup__actions">
                    {adminDetails &&
                        <SecondaryButton
                            className="lw-adminPopup__actionButton"
                            size={buttonSizes.MEDIUM}
                            onPress={handleDeleteAdmin}
                        >
                            {isPerformingDeleteAdmin ? "מוחק..." : "מחק מנהל"}
                        </SecondaryButton>
                    }
                    <PrimaryButton
                        className="lw-adminPopup__actionButton"
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
