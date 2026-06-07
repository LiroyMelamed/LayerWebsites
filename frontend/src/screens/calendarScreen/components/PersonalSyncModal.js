import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import { Text14, Text12, Text24, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../constant/colors";
import calendarApi from "../../../api/calendarApi";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import "./PersonalSyncModal.scss";

/**
 * Per-lawyer calendar sync — Google OAuth, manual sync, personal iCal feed.
 * Must only be opened from CalendarScreen (not Platform Settings).
 */
export default function PersonalSyncModal({ onClose }) {
    const { t } = useTranslation();

    // ── iCal (personal WebCal subscription) ───────────────────────────────────
    const [icalToken, setIcalToken] = useState(null);
    const [icalUrl, setIcalUrl] = useState("");
    const [icalHttpsUrl, setIcalHttpsUrl] = useState("");
    const [icalCopied, setIcalCopied] = useState(false);
    const [icalLoading, setIcalLoading] = useState(false);
    const [icalRotating, setIcalRotating] = useState(false);

    const loadIcal = useCallback(async () => {
        setIcalLoading(true);
        try {
            const res = await calendarApi.getIcalToken();
            if (res?.data) {
                setIcalToken(res.data.token);
                setIcalUrl(res.data.subscriptionUrl || "");
                setIcalHttpsUrl(res.data.httpsSubscriptionUrl || res.data.subscriptionUrl || "");
            }
        } finally {
            setIcalLoading(false);
        }
    }, []);

    const handleCopyIcal = () => {
        const copyTarget = icalHttpsUrl || icalUrl;
        if (!copyTarget) return;
        navigator.clipboard.writeText(copyTarget).then(() => {
            setIcalCopied(true);
            setTimeout(() => setIcalCopied(false), 2500);
        });
    };

    const handleRotateIcal = async () => {
        setIcalRotating(true);
        try {
            const res = await calendarApi.rotateIcalToken();
            if (res?.data) {
                setIcalToken(res.data.token);
                setIcalUrl(res.data.subscriptionUrl || "");
                setIcalHttpsUrl(res.data.httpsSubscriptionUrl || res.data.subscriptionUrl || "");
                setIcalCopied(false);
            }
        } finally {
            setIcalRotating(false);
        }
    };

    // ── Google (personal OAuth) ───────────────────────────────────────────────
    const [googleSyncing, setGoogleSyncing] = useState(false);
    const [googleSyncMsg, setGoogleSyncMsg] = useState("");
    const [googleSyncError, setGoogleSyncError] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);

    const { result: googleStatus, performRequest: refetchGoogleStatus } =
        useAutoHttpRequest(calendarApi.getGoogleStatus);

    const googleConnected = googleStatus?.connected;
    const googleEmail = googleStatus?.email;
    const googleSyncAllowed = googleStatus?.googleSyncAllowed !== false;

    const handleConnectGoogle = async () => {
        if (!googleSyncAllowed) return;
        try {
            const res = await calendarApi.getGoogleAuthUrl();
            if (res?.success && res?.data?.authUrl) {
                window.location.href = res.data.authUrl;
            } else if (!res?.success) {
                setGoogleSyncMsg(res?.data?.message || t("calendar.googleSyncError"));
                setGoogleSyncError(true);
            }
        } catch {
            setGoogleSyncMsg(t("calendar.googleSyncError"));
            setGoogleSyncError(true);
        }
    };

    const handleDisconnectGoogle = async () => {
        setDisconnecting(true);
        setGoogleSyncMsg("");
        setGoogleSyncError(false);
        try {
            await calendarApi.disconnectGoogle();
            refetchGoogleStatus();
        } finally {
            setDisconnecting(false);
        }
    };

    const handleSyncGoogle = async () => {
        if (!googleSyncAllowed) return;
        setGoogleSyncing(true);
        setGoogleSyncMsg("");
        setGoogleSyncError(false);
        try {
            const res = await calendarApi.syncGoogleEvents();
            if (res?.success && res?.data?.synced !== undefined) {
                setGoogleSyncMsg(t("calendar.googleSyncSuccess", { count: res.data.synced }));
            } else {
                setGoogleSyncMsg(res?.data?.message || t("calendar.googleSyncError"));
                setGoogleSyncError(true);
                if (res?.data?.reconnect) refetchGoogleStatus();
            }
        } catch (err) {
            const msg = err?.response?.data?.message;
            setGoogleSyncMsg(msg || t("calendar.googleSyncError"));
            setGoogleSyncError(true);
            if (err?.response?.data?.reconnect) refetchGoogleStatus();
        } finally {
            setGoogleSyncing(false);
        }
    };

    return (
        <SimpleContainer className="lw-personalSyncModal">
            <SimpleScrollView className="lw-personalSyncModal__scroll">
                <SimpleContainer className="lw-personalSyncModal__header">
                    <Text24>{t("calendar.personalSyncTitle")}</Text24>
                    <Text12 color="#718096">{t("calendar.personalSyncHint")}</Text12>
                </SimpleContainer>

                {/* ── iCal ── */}
                <SimpleContainer className="lw-personalSyncModal__section">
                    <TextBold14 color={colors.primary}>{t("calendar.icalSubscribe")}</TextBold14>
                    <Text12 color={colors.winter}>{t("calendar.icalSubscribeHint")}</Text12>

                    {!icalToken ? (
                        <PrimaryButton onPress={loadIcal} isPerforming={icalLoading}>
                            {t("calendar.icalShowLink")}
                        </PrimaryButton>
                    ) : (
                        <SimpleContainer className="lw-personalSyncModal__icalRow">
                            <SimpleContainer className="lw-personalSyncModal__icalUrl">
                                <Text12 color={colors.winter} style={{ wordBreak: "break-all" }}>
                                    {icalHttpsUrl || icalUrl}
                                </Text12>
                            </SimpleContainer>
                            <SimpleContainer className="lw-personalSyncModal__btnRow">
                                <PrimaryButton onPress={handleCopyIcal}>
                                    {icalCopied ? t("calendar.icalCopied") : t("calendar.icalCopy")}
                                </PrimaryButton>
                                <SecondaryButton onPress={handleRotateIcal} isPerforming={icalRotating}>
                                    {t("calendar.icalRotate")}
                                </SecondaryButton>
                            </SimpleContainer>
                        </SimpleContainer>
                    )}
                </SimpleContainer>

                {/* ── Google ── */}
                <SimpleContainer className="lw-personalSyncModal__section lw-personalSyncModal__section--border">
                    <TextBold14 color={colors.primary}>{t("calendar.googleCalendarTitle")}</TextBold14>

                    {!googleSyncAllowed ? (
                        <Text12 color="#744210">{t("calendar.googleSyncDisabledByFirm")}</Text12>
                    ) : googleConnected ? (
                        <>
                            <Text14 color={colors.positive}>
                                {t("calendar.googleConnected", { email: googleEmail || "" })}
                            </Text14>
                            <SimpleContainer className="lw-personalSyncModal__btnRow">
                                <PrimaryButton onPress={handleSyncGoogle} isPerforming={googleSyncing}>
                                    {googleSyncing ? t("calendar.googleSyncing") : t("calendar.syncGoogle")}
                                </PrimaryButton>
                                <SecondaryButton onPress={handleDisconnectGoogle} isPerforming={disconnecting}>
                                    {t("calendar.disconnectGoogle")}
                                </SecondaryButton>
                            </SimpleContainer>
                            {googleSyncMsg && (
                                <Text14 color={googleSyncError ? "#E53E3E" : colors.positive}>{googleSyncMsg}</Text14>
                            )}
                        </>
                    ) : (
                        <>
                            <Text12 color={colors.winter}>{t("calendar.googleConnectHint")}</Text12>
                            <PrimaryButton onPress={handleConnectGoogle}>
                                {t("calendar.connectGoogle")}
                            </PrimaryButton>
                            {googleSyncMsg && (
                                <Text14 color="#E53E3E">{googleSyncMsg}</Text14>
                            )}
                        </>
                    )}
                </SimpleContainer>

                <SimpleContainer className="lw-personalSyncModal__footer">
                    <SecondaryButton onPress={onClose}>{t("common.close")}</SecondaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}
