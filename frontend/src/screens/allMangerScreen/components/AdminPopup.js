import { useFirmPermissions } from '../../../providers/FirmPermissionsProvider';
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { adminApi } from "../../../api/adminApi";
import { staffRolesApi } from "../../../api/staffRolesApi";
import useHttpRequest from "../../../hooks/useHttpRequest";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import useFieldState from "../../../hooks/useFieldState";
import { HebrewCharsValidationWithNumbers } from "../../../functions/validation/HebrewCharsValidation";
import emailValidation from "../../../functions/validation/EmailValidation";
import IsraeliPhoneNumberValidation from "../../../functions/validation/IsraeliPhoneNumberValidation";

import "./AdminPopup.scss";

function readInitialFirmStaffRoleId(details) {
    const raw = details?.firm_staff_role_id ?? details?.firmStaffRoleId;
    return raw ? String(raw) : "";
}

export default function AdminPopup({ adminDetails, rePerformRequest, onFailureFunction, closePopUpFunction, style }) {
    const { t } = useTranslation();
    const { permissionMode, canAction } = useFirmPermissions() || {};
    const canManageOfficeUsers = permissionMode !== 'role' || Boolean(canAction?.('officeUsers', 'manage'));
    const isPlatformAdminSession =
        typeof window !== "undefined" && localStorage.getItem("isPlatformAdmin") === "true";
    const userRole = adminDetails?.role || "Admin";
    const isLawyer = userRole === "Lawyer";
    const isCreateAdmin = !adminDetails;
    const targetIsPlatformAdmin = Boolean(
        adminDetails?.is_platform_admin ?? adminDetails?.isPlatformAdmin,
    );
    const showFirmStaffRoleSection =
        isPlatformAdminSession && adminDetails?.userid && !targetIsPlatformAdmin;

    const [firmStaffRoles, setFirmStaffRoles] = useState([]);
    const [firmStaffRoleId, setFirmStaffRoleId] = useState(() => readInitialFirmStaffRoleId(adminDetails));
    const initialFirmStaffRoleId = useMemo(
        () => readInitialFirmStaffRoleId(adminDetails),
        [adminDetails],
    );

    useEffect(() => {
        setFirmStaffRoleId(readInitialFirmStaffRoleId(adminDetails));
    }, [adminDetails]);

    useEffect(() => {
        if (!showFirmStaffRoleSection) return;
        let cancelled = false;
        staffRolesApi
            .listRoles()
            .then((list) => {
                if (!cancelled && Array.isArray(list)) setFirmStaffRoles(list);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [showFirmStaffRoleSection]);

    const nameValidation = (value) => HebrewCharsValidationWithNumbers(value);
    const phoneValidation = (value) => IsraeliPhoneNumberValidation(value);
    const emailValidationWithRequired = (value) => emailValidation(value);
    const passwordValidation = (value) => {
        const trimmed = String(value || "").trim();
        if (isLawyer || adminDetails) {
            if (!trimmed) return null;
        }
        if (!trimmed) return t("errors.passwordMinLength");
        if (trimmed.length < 6) return t("errors.passwordMinLength");
        return null;
    };

    const [name, setName, nameError] = useFieldState(nameValidation, adminDetails?.name || "");
    const [phoneNumber, setPhoneNumber, phoneNumberError] = useFieldState(
        phoneValidation,
        adminDetails?.phonenumber || "",
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
        if (isLawyer) {
            setHasError(false);
            return;
        }
        const missingRequired = !name || !phoneNumber || !email;
        const hasValidationErrors = Boolean(nameError || phoneNumberError || emailError || passwordError);
        const passwordRequired = isCreateAdmin && !password;
        setHasError(missingRequired || hasValidationErrors || passwordRequired);
    }, [name, phoneNumber, email, password, nameError, phoneNumberError, emailError, passwordError, isLawyer, isCreateAdmin]);

    const markTouched = (field) => {
        setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
    };

    const { isPerforming: isPerformingDeleteAdmin, performRequest: deleteAdmin } = useHttpRequest(
        adminApi.deleteAdmin,
        () => {
            closePopUpFunction?.();
            rePerformRequest?.();
        },
        onFailureFunction,
    );

    const [savingAll, setSavingAll] = useState(false);

    const handleSave = async () => {
        if (!canManageOfficeUsers) return;
        if (hasError || savingAll) return;

        const firmStaffRoleChanged =
            showFirmStaffRoleSection && firmStaffRoleId !== initialFirmStaffRoleId;

        if (isLawyer) {
            if (!firmStaffRoleChanged) {
                closePopUpFunction?.();
                return;
            }
            setSavingAll(true);
            try {
                await staffRolesApi.assignUserFirmStaffRole(
                    adminDetails.userid,
                    firmStaffRoleId ? firmStaffRoleId : null,
                );
                closePopUpFunction?.();
                rePerformRequest?.();
            } catch (err) {
                onFailureFunction?.(err);
            } finally {
                setSavingAll(false);
            }
            return;
        }

        const adminData = { name, phoneNumber, email, password };

        setSavingAll(true);
        try {
            const res = adminDetails
                ? await adminApi.updateAdmin(adminDetails.userid, adminData)
                : await adminApi.addAdmin(adminData);
            if (res?.status !== 200 && res?.status !== 201) {
                onFailureFunction?.(res);
                return;
            }
            if (firmStaffRoleChanged && adminDetails?.userid) {
                await staffRolesApi.assignUserFirmStaffRole(
                    adminDetails.userid,
                    firmStaffRoleId ? firmStaffRoleId : null,
                );
            }
            closePopUpFunction?.();
            rePerformRequest?.();
        } catch (err) {
            onFailureFunction?.(err);
        } finally {
            setSavingAll(false);
        }
    };

    const handleDeleteAdmin = () => {
        if (!canManageOfficeUsers) return;
        deleteAdmin(adminDetails.userid);
        closePopUpFunction?.();
    };

    const profileReadOnly = isLawyer;

    return (
        <SimpleContainer className="lw-adminPopup" style={style}>
            <SimpleScrollView>
                {isLawyer && (
                    <p className="lw-adminPopup__userTypeBadge">{t("admins.userTypeLawyer", "עורך דין")}</p>
                )}

                <SimpleContainer className="lw-adminPopup__row">
                    <SimpleInput
                        className="lw-adminPopup__input"
                        title={t("admins.adminName")}
                        value={name}
                        onChange={(e) => !profileReadOnly && setName(e.target.value)}
                        onBlur={() => markTouched("name")}
                        error={!profileReadOnly && touched.name ? nameError : null}
                        disabled={profileReadOnly}
                    />
                    <SimpleInput
                        className="lw-adminPopup__input"
                        title={t("cases.phoneNumber")}
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => !profileReadOnly && setPhoneNumber(e.target.value)}
                        onBlur={() => markTouched("phoneNumber")}
                        error={!profileReadOnly && touched.phoneNumber ? phoneNumberError : null}
                        disabled={profileReadOnly}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-adminPopup__row">
                    <SimpleInput
                        className="lw-adminPopup__input"
                        title={t("common.email")}
                        type="email"
                        value={email}
                        onChange={(e) => !profileReadOnly && setEmail(e.target.value)}
                        onBlur={() => markTouched("email")}
                        error={!profileReadOnly && touched.email ? emailError : null}
                        disabled={profileReadOnly}
                    />
                    {!isLawyer && (
                        <SimpleInput
                            className="lw-adminPopup__input"
                            title={t("common.password")}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onBlur={() => markTouched("password")}
                            error={touched.password ? passwordError : null}
                            type="password"
                        />
                    )}
                </SimpleContainer>

                {targetIsPlatformAdmin && (
                    <SimpleContainer className="lw-adminPopup__platformOwner">
                        <p className="lw-adminPopup__platformOwnerLabel">
                            {t("admins.platformOwner", "בעל מערכת")}
                        </p>
                        <p className="lw-adminPopup__firmStaffRoleHint">
                            {t(
                                "admins.platformOwnerHint",
                                "מנהל פלטפורמה נשאר עם הרשאות מלאות — לא ניתן להגביל בתפקיד מותאם.",
                            )}
                        </p>
                    </SimpleContainer>
                )}

                {showFirmStaffRoleSection && (
                    <SimpleContainer className="lw-adminPopup__firmStaffRole">
                        <label className="lw-adminPopup__firmStaffRoleLabel">
                            {t("admins.firmStaffRoleSection", "תפקיד והרשאות")}
                        </label>
                        <select
                            className="lw-adminPopup__firmStaffRoleSelect"
                            value={firmStaffRoleId}
                            onChange={(e) => setFirmStaffRoleId(e.target.value)}
                        >
                            <option value="">
                                {t("admins.firmStaffRoleNone", "ללא תפקיד מותאם")}
                            </option>
                            {firmStaffRoles.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                        <p className="lw-adminPopup__firmStaffRoleHint">
                            {t(
                                "admins.firmStaffRoleHint",
                                "ללא תפקיד מותאם — המשתמש ממשיך עם ההרשאות הרגילות של סוג המשתמש שלו.",
                            )}
                        </p>
                    </SimpleContainer>
                )}

                <SimpleContainer className="lw-adminPopup__actions">
                    {adminDetails && !isLawyer && (
                        <SecondaryButton
                            className="lw-adminPopup__actionButton"
                            size={buttonSizes.MEDIUM}
                            disabled={!canManageOfficeUsers}
                            onPress={handleDeleteAdmin}
                        >
                            {isPerformingDeleteAdmin ? t("common.deleting") : t("admins.deleteAdmin")}
                        </SecondaryButton>
                    )}
                    <PrimaryButton
                        className="lw-adminPopup__actionButton"
                        size={buttonSizes.MEDIUM}
                        onPress={handleSave}
                        disabled={!canManageOfficeUsers || hasError || savingAll}
                    >
                        {savingAll
                            ? t("common.saving")
                            : isLawyer
                              ? t("common.save", "שמירה")
                              : !adminDetails
                                ? t("admins.saveAdmin")
                                : t("admins.updateAdmin")}
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
