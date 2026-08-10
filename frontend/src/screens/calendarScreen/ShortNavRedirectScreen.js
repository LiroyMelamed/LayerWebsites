import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ApiUtils from "../../api/apiUtils";
import { getFirmName, loadFirmSettings } from "../../services/firmSettings";
import { images } from "../../assets/images/images";
import "./ShortNavRedirectScreen.scss";

function destinationLabel(kind, url) {
    const k = String(kind || "").toLowerCase();
    const u = String(url || "").toLowerCase();
    if (k === "waze" || u.includes("waze.com")) return "וויז";
    if (k === "maps" || u.includes("google.com/maps") || u.includes("maps.google") || u.includes("maps.app.goo.gl")) {
        return "מפות";
    }
    if (k === "rsvp" || u.includes("calendar-invite")) return "אישור הגעה";
    return "היעד";
}

/**
 * Branded interstitial for /n/:slug → Waze / Maps / RSVP.
 * Resolves the short link, shows a premium transition, then redirects.
 */
export default function ShortNavRedirectScreen() {
    const { slug } = useParams();
    const [error, setError] = useState("");
    const [firmName, setFirmName] = useState(() => getFirmName() || "");
    const [logoUrl, setLogoUrl] = useState("");
    const [destKind, setDestKind] = useState("");
    const [targetUrl, setTargetUrl] = useState("");

    useEffect(() => {
        let cancelled = false;
        loadFirmSettings().then(() => {
            if (cancelled) return;
            setFirmName(getFirmName() || "");
        });
        ApiUtils.get("platform-settings/public")
            .then((res) => {
                if (cancelled) return;
                const data = res?.data || {};
                if (data.LAW_FIRM_NAME) setFirmName(data.LAW_FIRM_NAME);
                if (data.FIRM_LOGO_URL) setLogoUrl(String(data.FIRM_LOGO_URL).trim());
            })
            .catch(() => { /* fallback logo below */ });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        let redirectTimer = null;

        (async () => {
            const safe = String(slug || "").trim();
            if (!/^[A-Za-z0-9_-]{6,16}$/.test(safe)) {
                if (!cancelled) setError("קישור לא תקין");
                return;
            }
            try {
                const res = await ApiUtils.get(`calendar/short-links/${encodeURIComponent(safe)}`);
                const url = res?.data?.url || res?.url || "";
                const kind = res?.data?.kind || res?.kind || "";
                if (!url) {
                    if (!cancelled) setError("קישור לא נמצא");
                    return;
                }
                if (cancelled) return;
                setTargetUrl(url);
                setDestKind(kind);

                // Premium pause so branding + animation are visible before leave.
                redirectTimer = setTimeout(() => {
                    if (!cancelled) window.location.replace(url);
                }, 1300);
            } catch {
                if (!cancelled) setError("קישור לא נמצא");
            }
        })();

        return () => {
            cancelled = true;
            if (redirectTimer) clearTimeout(redirectTimer);
        };
    }, [slug]);

    const label = useMemo(
        () => destinationLabel(destKind, targetUrl),
        [destKind, targetUrl]
    );

    const statusText = error
        ? error
        : `מעביר אותך ליעד ב${label}...`;

    const logoSrc = logoUrl || images.Logos.FullLogoBlack;

    return (
        <div className="lw-shortNavRedirect" dir="rtl">
            <div className="lw-shortNavRedirect__bg" aria-hidden="true" />
            <div className="lw-shortNavRedirect__card">
                <div className="lw-shortNavRedirect__brand">
                    <img
                        className="lw-shortNavRedirect__logo"
                        src={logoSrc}
                        alt={firmName || "Logo"}
                    />
                    {firmName ? (
                        <p className="lw-shortNavRedirect__firm">{firmName}</p>
                    ) : null}
                </div>

                {!error ? (
                    <div className="lw-shortNavRedirect__anim" aria-hidden="true">
                        <div className="lw-shortNavRedirect__radar">
                            <span className="lw-shortNavRedirect__radarRing" />
                            <span className="lw-shortNavRedirect__radarRing lw-shortNavRedirect__radarRing--delay" />
                            <span className="lw-shortNavRedirect__pin">
                                <svg viewBox="0 0 24 24" width="28" height="28" focusable="false">
                                    <path
                                        fill="currentColor"
                                        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                                    />
                                </svg>
                            </span>
                        </div>
                    </div>
                ) : null}

                <p className={`lw-shortNavRedirect__status${error ? " is-error" : ""}`}>
                    {statusText}
                </p>

                {!error && targetUrl ? (
                    <a className="lw-shortNavRedirect__manual" href={targetUrl}>
                        המשך מיד
                    </a>
                ) : null}
            </div>
        </div>
    );
}
