import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import { images } from "../../assets/images/images";
import { LoginStackName } from "../../navigation/LoginStack";
import { LoginScreenName } from "../loginScreen/LoginScreen";
import { PublicSignScreenName, ViewSignedDocumentName } from "../../navigation/screenPaths";
import signingFilesApi from "../../api/signingFilesApi";

import "./PublicSigningScreen.scss";

/**
 * Resolves /s/:slug → PublicSignScreen or ViewSignedDocument (browser only).
 */
export default function ShortSignRedirectScreen() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [error, setError] = useState("");

    const safeSlug = String(slug || "").trim();

    useEffect(() => {
        let cancelled = false;

        (async () => {
            if (!/^[A-Za-z0-9_-]{6,16}$/.test(safeSlug)) {
                if (!cancelled) setError(t("signing.invalidLinkTitle", { defaultValue: "קישור לא תקין" }));
                return;
            }
            try {
                const res = await signingFilesApi.resolvePublicSigningShortLink(safeSlug);
                const nextToken = res?.data?.token || res?.token || "";
                const purpose = res?.data?.purpose || res?.purpose || "sign";
                if (!nextToken) {
                    if (!cancelled) setError(t("signing.missingToken", { defaultValue: "חסר טוקן חתימה" }));
                    return;
                }
                if (cancelled) return;

                const dest =
                    purpose === "view"
                        ? `${ViewSignedDocumentName}?token=${encodeURIComponent(nextToken)}`
                        : `${PublicSignScreenName}?token=${encodeURIComponent(nextToken)}`;
                navigate(dest, { replace: true });
            } catch {
                if (!cancelled) setError(t("signing.invalidLinkTitle", { defaultValue: "קישור לא תקין" }));
            }
        })();

        return () => { cancelled = true; };
    }, [safeSlug, navigate, t]);

    const goToLogin = () => {
        navigate(LoginStackName + LoginScreenName, { replace: true });
    };

    const loadingText = t("signing.public.loadingDocument", {
        defaultValue: "טוען מסמך לחתימה...",
    });

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground} className="lw-publicSigningScreen">
            <SimpleContainer className="lw-publicSigningScreen__container">
                <SimpleContainer className="lw-publicSigningScreen__stack">
                    {error ? (
                        <>
                            <TextBold24>{error}</TextBold24>
                            <PrimaryButton onPress={goToLogin}>{t("common.back", { defaultValue: "חזרה" })}</PrimaryButton>
                        </>
                    ) : (
                        <>
                            <div className="lw-publicSigningScreen__spinner" aria-hidden="true" />
                            <Text14>{loadingText}</Text14>
                        </>
                    )}
                </SimpleContainer>
            </SimpleContainer>
        </SimpleScreen>
    );
}
