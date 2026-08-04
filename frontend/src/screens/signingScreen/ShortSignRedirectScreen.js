import React, { useEffect, useMemo, useState } from "react";
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

function buildNativeSigningHref({ token, slug }) {
    const scheme = NATIVE_SCHEME || NATIVE_SCHEME_ALT;
    if (!scheme) return "";
    if (token) return `${scheme}://PublicSigning?token=${encodeURIComponent(token)}`;
    if (slug) return `${scheme}://PublicSigning?slug=${encodeURIComponent(slug)}`;
    return "";
}

/** Soft-open native app if installed; never redirect to the App Store. */
function tryOpenNativeSigningApp({ token, slug }) {
    const href = buildNativeSigningHref({ token, slug });
    if (!href) return;
    const ua = navigator.userAgent || "";
    if (!/iPhone|iPad|iPod|Android/i.test(ua)) return;

    try {
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = href;
        (document.body || document.documentElement).appendChild(iframe);
        setTimeout(() => {
            try { iframe.parentNode && iframe.parentNode.removeChild(iframe); } catch (_) { /* ignore */ }
        }, 1500);
    } catch (_) { /* ignore */ }
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
    const [token, setToken] = useState("");

    const safeSlug = String(slug || "").trim();
    const openInAppHref = useMemo(
        () => buildNativeSigningHref({ token, slug: safeSlug }),
        [token, safeSlug]
    );

    useEffect(() => {
        let cancelled = false;
        let navTimer = null;

        // Immediate soft-open with slug (app can resolve short link natively).
        if (/^[A-Za-z0-9_-]{6,16}$/.test(safeSlug)) {
            tryOpenNativeSigningApp({ slug: safeSlug });
        }

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
                setToken(nextToken);

                const dest =
                    purpose === "view"
                        ? `${ViewSignedDocumentName}?token=${encodeURIComponent(nextToken)}`
                        : `${PublicSignScreenName}?token=${encodeURIComponent(nextToken)}`;

                // Prefer native app once token is known (WhatsApp/in-app browsers skip Universal Links).
                tryOpenNativeSigningApp({ token: nextToken, slug: safeSlug });

                // If the app claimed focus, stay on this loader; otherwise open web signing.
                navTimer = setTimeout(() => {
                    if (cancelled) return;
                    if (document.hidden) return;
                    navigate(dest, { replace: true });
                }, 1200);
            } catch {
                if (!cancelled) setError(t("signing.invalidLinkTitle", { defaultValue: "קישור לא תקין" }));
            }
        })();
        return () => {
            cancelled = true;
            if (navTimer) clearTimeout(navTimer);
        };
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
                            {openInAppHref ? (
                                <a
                                    className="lw-publicSigningScreen__openApp"
                                    href={openInAppHref}
                                >
                                    {t("signing.public.openInApp", { defaultValue: "פתח באפליקציה" })}
                                </a>
                            ) : null}
                        </>
                    )}
                </SimpleContainer>
            </SimpleContainer>
        </SimpleScreen>
    );
}
