import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ApiUtils from "../../api/apiUtils";
import { toastError, toastSuccess } from "../../components/ui/toast";
import { buildGoogleCalendarUrl, downloadIcsFile } from "./utils/calendarExport";
import "./CalendarInviteScreen.scss";

export default function CalendarInviteScreen() {
    const { token } = useParams();
    const { t } = useTranslation();
    const [invite, setInvite] = useState(null);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const [anim, setAnim] = useState(""); // 'accept' | 'decline' | ''
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await ApiUtils.get(`calendar/invite/${encodeURIComponent(token)}`);
                const data = res?.data?.invite || res?.invite;
                if (!cancelled) {
                    if (!data) setError(t("calendar.inviteNotFound"));
                    else {
                        setInvite(data);
                        setStatus(data.status || "pending");
                    }
                }
            } catch (e) {
                if (!cancelled) setError(e?.response?.data?.message || t("calendar.inviteNotFound"));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [token, t]);

    const respond = async (action) => {
        if (busy) return;
        setBusy(true);
        setAnim(action === "accept" ? "accept" : "decline");
        try {
            const res = await ApiUtils.post(`calendar/invite/${encodeURIComponent(token)}`, { action });
            const next = res?.data?.status || res?.status;
            await new Promise((r) => setTimeout(r, 480));
            if (next) setStatus(next);
            toastSuccess(action === "accept" ? t("calendar.inviteStatusAccepted") : t("calendar.inviteStatusDeclined"));
        } catch (e) {
            setAnim("");
            toastError(e?.response?.data?.message || "שגיאה בשמירת התשובה");
        } finally {
            setBusy(false);
        }
    };

    const startLabel = useMemo(() => {
        if (!invite?.startTime) return "";
        return new Date(invite.startTime).toLocaleString("he-IL", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Jerusalem",
        });
    }, [invite?.startTime]);

    const googleCalUrl = useMemo(
        () => (invite ? buildGoogleCalendarUrl(invite) : ""),
        [invite]
    );

    const handleAppleOutlook = () => {
        if (!invite) return;
        const ok = downloadIcsFile(
            { ...invite, uid: `invite-${token}@ashrafessa` },
            "meeting.ics"
        );
        if (ok) toastSuccess(t("calendar.addToAppleStarted"));
        else toastError(t("calendar.addToCalendarError"));
    };

    const wazeHref = invite?.location
        ? `https://waze.com/ul?q=${encodeURIComponent(invite.location)}`
        : "";
    const mapsHref = invite?.location
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(invite.location)}`
        : "";

    const statusClass =
        status === "accepted" ? "is-accepted"
            : status === "declined" ? "is-declined"
                : "is-pending";

    return (
        <div className={`lw-calendarInvite ${statusClass} ${anim ? `is-anim-${anim}` : ""}`}>
            <div className="lw-calendarInvite__bg" aria-hidden="true" />
            <div className="lw-calendarInvite__card">
                <p className="lw-calendarInvite__eyebrow">{t("calendar.inviteHeroTitle")}</p>

                {loading && (
                    <div className="lw-calendarInvite__loading">
                        <div className="lw-calendarInvite__spinner" aria-hidden="true" />
                        <p>{t("calendar.inviteLoading")}</p>
                    </div>
                )}

                {!loading && error && !invite && (
                    <div className="lw-calendarInvite__empty">
                        <div className="lw-calendarInvite__emptyIcon" aria-hidden="true">!</div>
                        <h1>{t("calendar.inviteNotFound")}</h1>
                        <p>{error}</p>
                    </div>
                )}

                {!loading && invite && (
                    <>
                        <h1 className="lw-calendarInvite__title">{invite.title}</h1>

                        {invite.clientName && (
                            <p className="lw-calendarInvite__meta">
                                <span>{t("calendar.inviteFor")}</span>
                                <strong>{invite.clientName}</strong>
                            </p>
                        )}

                        {startLabel && (
                            <p className="lw-calendarInvite__meta">
                                <span>{t("calendar.inviteWhen")}</span>
                                <strong>{startLabel}</strong>
                            </p>
                        )}

                        {invite.location && (
                            <div className="lw-calendarInvite__location">
                                <p className="lw-calendarInvite__meta">
                                    <span>{t("calendar.inviteWhere")}</span>
                                    <strong>{invite.location}</strong>
                                </p>
                                <div className="lw-calendarInvite__nav">
                                    {wazeHref && (
                                        <a href={wazeHref} target="_blank" rel="noreferrer">
                                            {t("calendar.openInWaze")}
                                        </a>
                                    )}
                                    {mapsHref && (
                                        <a href={mapsHref} target="_blank" rel="noreferrer">
                                            {t("calendar.openInMaps")}
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}

                        {status === "pending" && (
                            <div className="lw-calendarInvite__actions">
                                <button
                                    type="button"
                                    className="lw-calendarInvite__btn lw-calendarInvite__btn--accept"
                                    disabled={busy}
                                    onClick={() => respond("accept")}
                                >
                                    {t("calendar.inviteAccept")}
                                </button>
                                <button
                                    type="button"
                                    className="lw-calendarInvite__btn lw-calendarInvite__btn--decline"
                                    disabled={busy}
                                    onClick={() => respond("decline")}
                                >
                                    {t("calendar.inviteDecline")}
                                </button>
                            </div>
                        )}

                        {status === "accepted" && (
                            <div className="lw-calendarInvite__result lw-calendarInvite__result--ok" role="status">
                                <div className="lw-calendarInvite__check" aria-hidden="true">
                                    <svg viewBox="0 0 52 52">
                                        <circle cx="26" cy="26" r="24" fill="none" />
                                        <path fill="none" d="M14 27l8 8 16-16" />
                                    </svg>
                                </div>
                                <h2>{t("calendar.inviteAcceptedTitle")}</h2>
                                <p>{t("calendar.inviteAcceptedBody")}</p>
                                <div className="lw-calendarInvite__addToCal">
                                    {googleCalUrl ? (
                                        <a
                                            className="lw-calendarInvite__calBtn lw-calendarInvite__calBtn--google"
                                            href={googleCalUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {t("calendar.addToGoogle")}
                                        </a>
                                    ) : null}
                                    <button
                                        type="button"
                                        className="lw-calendarInvite__calBtn lw-calendarInvite__calBtn--apple"
                                        onClick={handleAppleOutlook}
                                    >
                                        {t("calendar.addToApple")}
                                    </button>
                                </div>
                            </div>
                        )}

                        {status === "declined" && (
                            <div className="lw-calendarInvite__result lw-calendarInvite__result--no" role="status">
                                <div className="lw-calendarInvite__cross" aria-hidden="true">✕</div>
                                <h2>{t("calendar.inviteDeclinedTitle")}</h2>
                                <p>{t("calendar.inviteDeclinedBody")}</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
