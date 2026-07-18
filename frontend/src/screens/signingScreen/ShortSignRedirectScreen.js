import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import { images } from "../../assets/images/images";
import { LoginStackName } from "../../navigation/LoginStack";
import { LoginScreenName } from "../loginScreen/LoginScreen";
import { PublicSignScreenName } from "../../navigation/screenPaths";
import signingFilesApi from "../../api/signingFilesApi";
import { useTranslation } from "react-i18next";

import "./PublicSigningScreen.scss";

/**
 * Resolves /s/:slug → PublicSignScreen?token=…
 * Keeps short SMS links working in the browser when the native app is not installed.
 */
export default function ShortSignRedirectScreen() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const safeSlug = String(slug || "").trim();
            if (!/^[A-Za-z0-9_-]{6,16}$/.test(safeSlug)) {
                if (!cancelled) setError(t("signing.invalidLinkTitle"));
                return;
            }
            try {
                const res = await signingFilesApi.resolvePublicSigningShortLink(safeSlug);
                const token = res?.data?.token || res?.token || "";
                if (!token) {
                    if (!cancelled) setError(t("signing.missingToken"));
                    return;
                }
                if (!cancelled) {
                    navigate(
                        `${PublicSignScreenName}?token=${encodeURIComponent(token)}`,
                        { replace: true }
                    );
                }
            } catch {
                if (!cancelled) setError(t("signing.invalidLinkTitle"));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [slug, navigate, t]);

    const goToLogin = () => {
        navigate(LoginStackName + LoginScreenName, { replace: true });
    };

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground} className="lw-publicSigningScreen">
            <SimpleContainer className="lw-publicSigningScreen__container">
                <SimpleContainer className="lw-publicSigningScreen__stack">
                    {error ? (
                        <>
                            <TextBold24>{error}</TextBold24>
                            <PrimaryButton onPress={goToLogin}>{t("common.back")}</PrimaryButton>
                        </>
                    ) : (
                        <Text14>{t("common.loading") || "טוען…"}</Text14>
                    )}
                </SimpleContainer>
            </SimpleContainer>
        </SimpleScreen>
    );
}
