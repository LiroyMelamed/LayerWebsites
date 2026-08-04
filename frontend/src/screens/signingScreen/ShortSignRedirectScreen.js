import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import { images } from "../../assets/images/images";
import { LoginStackName } from "../../navigation/LoginStack";
import { LoginScreenName } from "../loginScreen/LoginScreen";
import { PublicSignScreenName, ViewSignedDocumentName } from "../../navigation/screenPaths";
import signingFilesApi from "../../api/signingFilesApi";
import { useTranslation } from "react-i18next";

import "./PublicSigningScreen.scss";

const NATIVE_SCHEME = String(process.env.REACT_APP_NATIVE_SCHEME || "").trim();
const NATIVE_SCHEME_ALT = String(process.env.REACT_APP_NATIVE_SCHEME_ALT || "melamedia").trim();

/** Soft-open native app if installed; never redirect to the App Store. */
function tryOpenNativeSigningApp(token) {
    if (!token) return;
    const ua = navigator.userAgent || "";
    if (!/iPhone|iPad|iPod|Android/i.test(ua)) return;

    const schemes = [NATIVE_SCHEME, NATIVE_SCHEME_ALT].filter(Boolean);
    if (!schemes.length) return;

    const open = (scheme) => {
        const target = `${scheme}://PublicSigning?token=${encodeURIComponent(token)}`;
        try {
            const iframe = document.createElement("iframe");
            iframe.style.display = "none";
            iframe.src = target;
            (document.body || document.documentElement).appendChild(iframe);
            setTimeout(() => {
                try { iframe.parentNode && iframe.parentNode.removeChild(iframe); } catch (_) { /* ignore */ }
            }, 1500);
        } catch (_) { /* ignore */ }
    };

    open(schemes[0]);
    if (schemes[1] && schemes[1] !== schemes[0]) {
        setTimeout(() => {
            if (!document.hidden) open(schemes[1]);
        }, 350);
    }
}

/**
 * Resolves /s/:slug → PublicSignScreen or ViewSignedDocument (based on JWT purpose).
 * Tries to open the native app when installed; otherwise continues in the browser.
 */
export default function ShortSignRedirectScreen() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        let navTimer = null;
        (async () => {
            const safeSlug = String(slug || "").trim();
            if (!/^[A-Za-z0-9_-]{6,16}$/.test(safeSlug)) {
                if (!cancelled) setError(t("signing.invalidLinkTitle"));
                return;
            }
            try {
                const res = await signingFilesApi.resolvePublicSigningShortLink(safeSlug);
                const token = res?.data?.token || res?.token || "";
                const purpose = res?.data?.purpose || res?.purpose || "sign";
                if (!token) {
                    if (!cancelled) setError(t("signing.missingToken"));
                    return;
                }
                if (cancelled) return;

                const dest =
                    purpose === "view"
                        ? `${ViewSignedDocumentName}?token=${encodeURIComponent(token)}`
                        : `${PublicSignScreenName}?token=${encodeURIComponent(token)}`;

                // Prefer native app when installed (Universal Links may be cached/stale).
                tryOpenNativeSigningApp(token);

                // If the app claimed focus, stay on this loader; otherwise open web signing.
                navTimer = setTimeout(() => {
                    if (cancelled) return;
                    if (document.hidden) return;
                    navigate(dest, { replace: true });
                }, 900);
            } catch {
                if (!cancelled) setError(t("signing.invalidLinkTitle"));
            }
        })();
        return () => {
            cancelled = true;
            if (navTimer) clearTimeout(navTimer);
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
                        <>
                            <div className="lw-publicSigningScreen__spinner" aria-hidden="true" />
                            <Text14>{t("signing.public.loadingDocument") || t("common.loading") || "טוען מסמך לחתימה..."}</Text14>
                        </>
                    )}
                </SimpleContainer>
            </SimpleContainer>
        </SimpleScreen>
    );
}
