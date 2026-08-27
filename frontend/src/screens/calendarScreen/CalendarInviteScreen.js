import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import ApiUtils from "../../api/apiUtils";
import { images } from "../../assets/images/images";
import { colors } from "../../constant/colors";
import { buttonSizes } from "../../styles/buttons/buttonSizes";
import { toastError, toastSuccess } from "../../components/ui/toast";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import TertiaryButton from "../../components/styledComponents/buttons/TertiaryButton";
import {
    Text12,
    Text14,
    TextBold14,
    TextBold16,
    TextBold20,
    TextBold24,
} from "../../components/specializedComponents/text/AllTextKindFile";

import { buildGoogleCalendarUrl, downloadIcsFile } from "./utils/calendarExport";
import {
    AppleCalendarIcon,
    GoogleCalendarIcon,
    GoogleMapsIcon,
    InviteIconButton,
    WazeIcon,
} from "./components/CalendarInviteActionIcons";
import "./CalendarInviteScreen.scss";

function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || "").trim())
        || /^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(String(value || "").trim());
}

function coerceHttpUrl(value) {
    const s = String(value || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(s)) return `https://${s}`;
    return s;
}

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

    const meetingType = String(invite?.meetingType || invite?.meeting_type || "").trim().toLowerCase();
    const placeMode = meetingType === "phone" ? "none" : (meetingType === "zoom" ? "link" : "place");
    const rawLocation = String(invite?.location || "").trim();
    const showPlace = placeMode !== "none" && Boolean(rawLocation);
    const locationIsLink = placeMode === "link" || isHttpUrl(rawLocation);
    const locationHref = locationIsLink ? coerceHttpUrl(rawLocation) : "";
    const locationLabel = placeMode === "link" || /\bzoom\.us\b/i.test(rawLocation)
        ? t("calendar.zoomLink", { defaultValue: "קישור זום" })
        : t("calendar.inviteWhere");

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
            { ...invite, uid: `invite-${token}@melamedia` },
            "meeting.ics"
        );
        if (ok) toastSuccess(t("calendar.addToAppleStarted"));
        else toastError(t("calendar.addToCalendarError"));
    };

    const openGoogleCalendar = () => {
        if (!googleCalUrl) {
            toastError(t("calendar.addToCalendarError"));
            return;
        }
        window.open(googleCalUrl, "_blank", "noopener,noreferrer");
    };

    const wazeHref = showPlace && !locationIsLink
        ? `https://waze.com/ul?q=${encodeURIComponent(rawLocation)}`
        : "";
    const mapsHref = showPlace && !locationIsLink
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rawLocation)}`
        : "";

    const showNavIcons = showPlace && !locationIsLink && Boolean(wazeHref || mapsHref);

    const statusClass =
        status === "accepted" ? "is-accepted"
            : status === "declined" ? "is-declined"
                : "is-pending";

    const showAddToCalendar = Boolean(invite) && status !== "declined";

    return (
        <SimpleScreen
            imageBackgroundSource={images.Backgrounds.AppBackground}
            className={`lw-calendarInvite ${statusClass} ${anim ? `is-anim-${anim}` : ""}`}
        >
            <SimpleContainer className="lw-calendarInvite__wrap">
                <SimpleCard className="lw-calendarInvite__card">
                    <TextBold14 color={colors.primary} className="lw-calendarInvite__eyebrow">
                        {t("calendar.inviteHeroTitle")}
                    </TextBold14>

                    {loading && (
                        <SimpleContainer className="lw-calendarInvite__loading">
                            <div className="lw-calendarInvite__spinner" aria-hidden="true" />
                            <Text14 color={colors.winter}>{t("calendar.inviteLoading")}</Text14>
                        </SimpleContainer>
                    )}

                    {!loading && error && !invite && (
                        <SimpleContainer className="lw-calendarInvite__empty">
                            <div className="lw-calendarInvite__emptyIcon" aria-hidden="true">!</div>
                            <TextBold20>{t("calendar.inviteNotFound")}</TextBold20>
                            <Text14 color={colors.winter}>{error}</Text14>
                        </SimpleContainer>
                    )}

                    {!loading && invite && (
                        <>
                            <TextBold24 className="lw-calendarInvite__title">{invite.title}</TextBold24>

                            {invite.clientName ? (
                                <SimpleContainer className="lw-calendarInvite__meta">
                                    <Text12 color={colors.winter}>{t("calendar.inviteFor")}</Text12>
                                    <TextBold16>{invite.clientName}</TextBold16>
                                </SimpleContainer>
                            ) : null}

                            {startLabel ? (
                                <SimpleContainer className="lw-calendarInvite__meta">
                                    <Text12 color={colors.winter}>{t("calendar.inviteWhen")}</Text12>
                                    <TextBold16>{startLabel}</TextBold16>
                                </SimpleContainer>
                            ) : null}

                            {showPlace ? (
                                <SimpleContainer className="lw-calendarInvite__location">
                                    <SimpleContainer className="lw-calendarInvite__meta">
                                        <Text12 color={colors.winter}>{locationLabel}</Text12>
                                        {locationHref ? (
                                            <a
                                                className="lw-calendarInvite__linkValue"
                                                href={locationHref}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                <TextBold16 color={colors.primary}>{rawLocation}</TextBold16>
                                            </a>
                                        ) : (
                                            <TextBold16>{rawLocation}</TextBold16>
                                        )}
                                    </SimpleContainer>
                                </SimpleContainer>
                            ) : null}

                            {status === "pending" && (
                                <SimpleContainer className="lw-calendarInvite__actions">
                                    <PrimaryButton
                                        disabled={busy}
                                        isPerforming={busy && anim === "accept"}
                                        onPress={() => respond("accept")}
                                    >
                                        {t("calendar.inviteAccept")}
                                    </PrimaryButton>
                                    <TertiaryButton
                                        className="lw-calendarInvite__decline"
                                        size={buttonSizes.SMALL}
                                        disabled={busy}
                                        isPerforming={busy && anim === "decline"}
                                        innerTextColor={colors.negative}
                                        onPress={() => respond("decline")}
                                    >
                                        {t("calendar.inviteDecline")}
                                    </TertiaryButton>
                                </SimpleContainer>
                            )}

                            {status === "accepted" && (
                                <SimpleContainer className="lw-calendarInvite__result lw-calendarInvite__result--ok" role="status">
                                    <div className="lw-calendarInvite__check" aria-hidden="true">
                                        <svg viewBox="0 0 52 52">
                                            <circle cx="26" cy="26" r="24" fill="none" />
                                            <path fill="none" d="M14 27l8 8 16-16" />
                                        </svg>
                                    </div>
                                    <TextBold20>{t("calendar.inviteAcceptedTitle")}</TextBold20>
                                    <Text14 color={colors.winter}>{t("calendar.inviteAcceptedBody")}</Text14>
                                </SimpleContainer>
                            )}

                            {status === "declined" && (
                                <SimpleContainer className="lw-calendarInvite__result lw-calendarInvite__result--no" role="status">
                                    <div className="lw-calendarInvite__cross" aria-hidden="true">✕</div>
                                    <TextBold20>{t("calendar.inviteDeclinedTitle")}</TextBold20>
                                    <Text14 color={colors.winter}>{t("calendar.inviteDeclinedBody")}</Text14>
                                </SimpleContainer>
                            )}

                            {(showAddToCalendar || showNavIcons) && (
                                <SimpleContainer className="lw-calendarInvite__iconRow">
                                    {showAddToCalendar ? (
                                        <>
                                            <InviteIconButton
                                                label={t("calendar.addToGoogle")}
                                                onPress={openGoogleCalendar}
                                                disabled={!googleCalUrl}
                                            >
                                                <GoogleCalendarIcon size={26} />
                                            </InviteIconButton>
                                            <InviteIconButton
                                                label={t("calendar.addToApple")}
                                                onPress={handleAppleOutlook}
                                            >
                                                <AppleCalendarIcon size={26} />
                                            </InviteIconButton>
                                        </>
                                    ) : null}
                                    {showNavIcons && mapsHref ? (
                                        <InviteIconButton
                                            label={t("calendar.openInMaps")}
                                            onPress={() => window.open(mapsHref, "_blank", "noopener,noreferrer")}
                                        >
                                            <GoogleMapsIcon size={26} />
                                        </InviteIconButton>
                                    ) : null}
                                    {showNavIcons && wazeHref ? (
                                        <InviteIconButton
                                            label={t("calendar.openInWaze")}
                                            onPress={() => window.open(wazeHref, "_blank", "noopener,noreferrer")}
                                        >
                                            <WazeIcon size={26} />
                                        </InviteIconButton>
                                    ) : null}
                                </SimpleContainer>
                            )}
                        </>
                    )}
                </SimpleCard>
            </SimpleContainer>
        </SimpleScreen>
    );
}
