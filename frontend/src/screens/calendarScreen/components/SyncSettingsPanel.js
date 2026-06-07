import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import { Text14, Text12, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../constant/colors";
import calendarApi from "../../../api/calendarApi";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import "./SyncSettingsPanel.scss";

export default function SyncSettingsPanel() {
    const { t } = useTranslation();

    // ── iCal ──────────────────────────────────────────────────────────────────
    const [icalToken, setIcalToken] = useState(null);
    const [icalUrl, setIcalUrl] = useState("");
    const [icalCopied, setIcalCopied] = useState(false);
    const [icalLoading, setIcalLoading] = useState(false);
    const [icalRotating, setIcalRotating] = useState(false);

    const loadIcal = useCallback(async () => {
        setIcalLoading(true);
        try {
            const res = await calendarApi.getIcalToken();
            if (res?.data) {
                setIcalToken(res.data.token);
                setIcalUrl(res.data.subscriptionUrl);
            }
        } finally {
            setIcalLoading(false);
        }
    }, []);

    const handleCopyIcal = () => {
        if (!icalUrl) return;
        navigator.clipboard.writeText(icalUrl).then(() => {
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
                setIcalUrl(res.data.subscriptionUrl);
                setIcalCopied(false);
            }
        } finally {
            setIcalRotating(false);
        }
    };

    // ── Google ─────────────────────────────────────────────────────────────────
    const [googleSyncing, setGoogleSyncing] = useState(false);
    const [googleSyncMsg, setGoogleSyncMsg] = useState("");
    const [disconnecting, setDisconnecting] = useState(false);

    const { result: googleStatus, performRequest: refetchGoogleStatus } =
        useAutoHttpRequest(calendarApi.getGoogleStatus);

    const googleConnected = googleStatus?.connected;
    const googleEmail = googleStatus?.email;

    const handleConnectGoogle = async () => {
        try {
            const res = await calendarApi.getGoogleAuthUrl();
            if (res?.data?.authUrl) window.location.href = res.data.authUrl;
        } catch {
            // silently ignore
        }
    };

    const handleDisconnectGoogle = async () => {
        setDisconnecting(true);
        try {
            await calendarApi.disconnectGoogle();
            refetchGoogleStatus();
        } finally {
            setDisconnecting(false);
        }
    };

    const handleSyncGoogle = async () => {
        setGoogleSyncing(true);
        setGoogleSyncMsg("");
        try {
            const res = await calendarApi.syncGoogleEvents();
            if (res?.data?.synced !== undefined) {
                setGoogleSyncMsg(t("calendar.googleSyncSuccess", { count: res.data.synced }));
            }
        } catch (err) {
            const msg = err?.response?.data?.message;
            setGoogleSyncMsg(msg || "שגיאה בסנכרון");
            if (err?.response?.data?.reconnect) refetchGoogleStatus();
        } finally {
            setGoogleSyncing(false);
        }
    };

    return (
        <SimpleCard className="lw-syncPanel">
            {/* ── iCal Section ── */}
            <SimpleContainer className="lw-syncPanel__section">
                <TextBold14 color={colors.primary}>{t("calendar.icalSubscribe")}</TextBold14>
                <Text12 color={colors.winter}>
                    הדבק את הכתובת בלוח השנה של האייפון / גוגל כמנוי (Subscribe)
                </Text12>

                {!icalToken ? (
                    <PrimaryButton onPress={loadIcal} isPerforming={icalLoading}>
                        {t("calendar.icalSubscribe")}
                    </PrimaryButton>
                ) : (
                    <SimpleContainer className="lw-syncPanel__icalRow">
                        <SimpleContainer className="lw-syncPanel__icalUrl">
                            <Text12 color={colors.winter} style={{ wordBreak: "break-all" }}>{icalUrl}</Text12>
                        </SimpleContainer>
                        <SimpleContainer className="lw-syncPanel__icalBtns">
                            <PrimaryButton onPress={handleCopyIcal}>
                                {icalCopied ? t("calendar.icalCopied") : "העתק"}
                            </PrimaryButton>
                            <SecondaryButton onPress={handleRotateIcal} isPerforming={icalRotating}>
                                {t("calendar.icalRotate")}
                            </SecondaryButton>
                        </SimpleContainer>
                    </SimpleContainer>
                )}
            </SimpleContainer>

            {/* ── Google Section ── */}
            <SimpleContainer className="lw-syncPanel__section lw-syncPanel__section--border">
                <TextBold14 color={colors.primary}>Google Calendar</TextBold14>

                {googleConnected ? (
                    <>
                        <Text14 color={colors.positive}>
                            {t("calendar.googleConnected", { email: googleEmail || "" })}
                        </Text14>
                        <SimpleContainer className="lw-syncPanel__googleBtns">
                            <PrimaryButton onPress={handleSyncGoogle} isPerforming={googleSyncing}>
                                {googleSyncing ? t("calendar.googleSyncing") : t("calendar.syncGoogle")}
                            </PrimaryButton>
                            <SecondaryButton onPress={handleDisconnectGoogle} isPerforming={disconnecting}>
                                {t("calendar.disconnectGoogle")}
                            </SecondaryButton>
                        </SimpleContainer>
                        {googleSyncMsg && (
                            <Text14 color={colors.positive}>{googleSyncMsg}</Text14>
                        )}
                    </>
                ) : (
                    <PrimaryButton onPress={handleConnectGoogle}>
                        {t("calendar.connectGoogle")}
                    </PrimaryButton>
                )}
            </SimpleContainer>
        </SimpleCard>
    );
}
