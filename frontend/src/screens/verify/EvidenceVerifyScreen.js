import React, { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import { images } from "../../assets/images/images";
import { LoginStackName } from "../../navigation/LoginStack";
import { LoginScreenName } from "../loginScreen/LoginScreen";
import { AdminStackName } from "../../navigation/AdminStack";
import { ClientStackName } from "../../navigation/ClientStack";
import { EvidenceDocumentsScreenName } from "../evidenceDocuments/EvidenceDocumentsScreen";
import { SigningManagerScreenName } from "../signingScreen/SigningManagerScreen";
import { SigningScreenName } from "../signingScreen/SigningScreen";
import { AppRoles } from "../otpScreen/OtpScreen.js/LoginOtpScreen";
import { useTranslation } from "react-i18next";

export const EvidenceVerifyScreenName = "/verify/evidence/:signingFileId";

export default function EvidenceVerifyScreen() {
    const navigate = useNavigate();
    const { signingFileId } = useParams();
    const { t } = useTranslation();

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const role = typeof window !== "undefined" ? localStorage.getItem("role") : null;

    const idText = useMemo(() => {
        const raw = String(signingFileId || "").trim();
        return raw || "-";
    }, [signingFileId]);

    const goToLogin = () => {
        navigate(LoginStackName + LoginScreenName, { replace: true });
    };

    const goToAdmin = () => {
        navigate(AdminStackName + SigningManagerScreenName, { replace: true });
    };

    const goToEvidenceDocs = () => {
        navigate(AdminStackName + EvidenceDocumentsScreenName, { replace: true });
    };

    const goToClientSigning = () => {
        navigate(ClientStackName + SigningScreenName, { replace: true });
    };

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            <SimpleContainer style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
                <TextBold24>{t("verifyEvidence.title")}</TextBold24>
                <Text14 style={{ marginTop: 8 }}>
                    {t("verifyEvidence.subtitle")}
                </Text14>

                <SimpleContainer style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.7)" }}>
                    <Text14>
                        {t("verifyEvidence.signingFileIdLabel")} <span style={{ fontFamily: "monospace" }}>{idText}</span>
                    </Text14>
                </SimpleContainer>

                <SimpleContainer style={{ marginTop: 14 }}>
                    <Text14>{t("verifyEvidence.instructions")}</Text14>
                </SimpleContainer>

                <SimpleContainer style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                    {!token ? (
                        <PrimaryButton onPress={goToLogin}>{t("verifyEvidence.actions.login")}</PrimaryButton>
                    ) : role === AppRoles.Admin ? (
                        <>
                            <PrimaryButton onPress={goToEvidenceDocs}>{t("verifyEvidence.actions.openEvidence")}</PrimaryButton>
                            <PrimaryButton onPress={goToAdmin}>{t("verifyEvidence.actions.openSigningManager")}</PrimaryButton>
                        </>
                    ) : (
                        <PrimaryButton onPress={goToClientSigning}>{t("verifyEvidence.actions.openSigning")}</PrimaryButton>
                    )}
                </SimpleContainer>

                <SimpleContainer style={{ marginTop: 18 }}>
                    <Text14>{t("verifyEvidence.privacyNote")}</Text14>
                </SimpleContainer>
            </SimpleContainer>
        </SimpleScreen>
    );
}
