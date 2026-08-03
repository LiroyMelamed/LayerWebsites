import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import { Text14, Text24, TextBold14 } from "../../components/specializedComponents/text/AllTextKindFile";
import ApiUtils from "../../api/apiUtils";
import "./CalendarInviteScreen.scss";

export default function CalendarInviteScreen() {
    const { token } = useParams();
    const [invite, setInvite] = useState(null);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await ApiUtils.get(`calendar/invite/${encodeURIComponent(token)}`);
                const data = res?.data?.invite || res?.invite;
                if (!cancelled) {
                    if (!data) setError("הזמנה לא נמצאה");
                    else {
                        setInvite(data);
                        setStatus(data.status || "pending");
                    }
                }
            } catch (e) {
                if (!cancelled) setError(e?.response?.data?.message || "שגיאה בטעינת ההזמנה");
            }
        })();
        return () => { cancelled = true; };
    }, [token]);

    const respond = async (action) => {
        setBusy(true);
        setError("");
        try {
            const res = await ApiUtils.post(`calendar/invite/${encodeURIComponent(token)}`, { action });
            const next = res?.data?.status || res?.status;
            if (next) setStatus(next);
        } catch (e) {
            setError(e?.response?.data?.message || "שגיאה בשמירת התשובה");
        } finally {
            setBusy(false);
        }
    };

    const startLabel = invite?.startTime
        ? new Date(invite.startTime).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short", hour12: false })
        : "";

    return (
        <SimpleContainer className="lw-calendarInvite">
            <Text24>הזמנה לפגישה</Text24>
            {error && <Text14 color="#E53E3E">{error}</Text14>}
            {invite && (
                <>
                    <TextBold14>{invite.title}</TextBold14>
                    {invite.clientName && <Text14>לכבוד: {invite.clientName}</Text14>}
                    <Text14>{startLabel}</Text14>
                    {invite.location && (
                        <>
                            <Text14>מיקום: {invite.location}</Text14>
                            <SimpleContainer className="lw-calendarInvite__nav">
                                <a href={`https://waze.com/ul?q=${encodeURIComponent(invite.location)}`} target="_blank" rel="noreferrer">Waze</a>
                                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(invite.location)}`} target="_blank" rel="noreferrer">Google Maps</a>
                            </SimpleContainer>
                        </>
                    )}
                    <Text14>
                        סטטוס:{" "}
                        {status === "accepted" ? "אושר" : status === "declined" ? "נדחה" : "ממתין לתשובה"}
                    </Text14>
                    {status === "pending" && (
                        <SimpleContainer className="lw-calendarInvite__actions">
                            <PrimaryButton onPress={() => respond("accept")} isPerforming={busy}>אשר</PrimaryButton>
                            <SecondaryButton onPress={() => respond("decline")} disabled={busy}>דחה</SecondaryButton>
                        </SimpleContainer>
                    )}
                </>
            )}
        </SimpleContainer>
    );
}
