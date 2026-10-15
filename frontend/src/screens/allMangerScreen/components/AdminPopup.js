import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { adminApi } from "../../../api/adminApi";
import useHttpRequest from "../../../hooks/useHttpRequest";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import useFieldState from "../../../hooks/useFieldState";
import { HebrewCharsValidationWithNumbers } from "../../../functions/validation/HebrewCharsValidation";
import emailValidation from "../../../functions/validation/EmailValidation";
import IsraeliPhoneNumberValidation from "../../../functions/validation/IsraeliPhoneNumberValidation";

import "./AdminPopup.scss";

export default function AdminPopup({ adminDetails, rePerformRequest, onFailureFunction, closePopUpFunction, style }) {
    const { t } = useTranslation();
    const requiredError = (value) => {
        const trimmed = String(value || "").trim();
        return trimmed ? null : t("errors.required");
    };

    const nameValidation = (value) => HebrewCharsValidationWithNumbers(value);
    const phoneValidation = (value) => IsraeliPhoneNumberValidation(value);
    const emailValidationWithRequired = (value) => emailValidation(value);
    const passwordValidation = (value) => {
        const trimmed = String(value || "").trim();
        if (!trimmed) return t("errors.passwordMinLength");
        if (trimmed.length < 6) return t("errors.passwordMinLength");
        return null;
    };

    const [name, setName, nameError] = useFieldState(nameValidation, adminDetails?.name || "");
    const [phoneNumber, setPhoneNumber, phoneNumberError] = useFieldState(
        phoneValidation,
        adminDetails?.phonenumber || ""
    );
    const [email, setEmail, emailError] = useFieldState(emailValidationWithRequired, adminDetails?.email || "");
    const [password, setPassword, passwordError] = useFieldState(passwordValidation, "");

    const [hasError, setHasError] = useState(false);
    const [touched, setTouched] = useState({
        name: false,
        phoneNumber: false,
        email: false,
        password: false,
    });

    useEffect(() => {
        const missingRequired = !name || !phoneNumber || !email;
        const hasValidationErrors = Boolean(nameError || phoneNumberError || emailError || passwordError);
        setHasError(missingRequired || hasValidationErrors);
    }, [name, phoneNumber, email, password, nameError, phoneNumberError, emailError, passwordError]);

    const markTouched = (field) => {
        setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
    };

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

    const handleSaveAdmin = () => {
        if (hasError) return;

        const adminData = {
            name,
            phoneNumber,
            email,
            password,
        };

        const apiCall = adminDetails
            ? performRequest(adminDetails.userid, adminData)
            : performRequest(adminData);

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
                        title={t("admins.adminName")}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => markTouched("name")}
                        error={touched.name ? nameError : null}
                    />
                    <SimpleInput
                        className="lw-adminPopup__input"
                        title={t("cases.phoneNumber")}
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        onBlur={() => markTouched("phoneNumber")}
                        error={touched.phoneNumber ? phoneNumberError : null}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-adminPopup__row">
                    <SimpleInput
                        className="lw-adminPopup__input"
                        title={t("common.email")}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => markTouched("email")}
                        error={touched.email ? emailError : null}
                    />
                    <SimpleInput
                        className="lw-adminPopup__input"
                        title={t("common.password")}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => markTouched("password")}
                        error={touched.password ? passwordError : null}
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
                            {isPerformingDeleteAdmin ? t("common.deleting") : t("admins.deleteAdmin")}
                        </SecondaryButton>
                    }
                    <PrimaryButton
                        className="lw-adminPopup__actionButton"
                        size={buttonSizes.MEDIUM}
                        onPress={handleSaveAdmin}
                        disabled={hasError}
                    >
                        {isPerforming ? t("common.saving") : !adminDetails ? t("admins.saveAdmin") : t("admins.updateAdmin")}
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
