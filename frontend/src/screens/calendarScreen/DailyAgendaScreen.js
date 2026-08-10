import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import { Text14, Text24, TextBold14, Text12 } from "../../components/specializedComponents/text/AllTextKindFile";
import calendarApi from "../../api/calendarApi";
import { AdminStackName } from "../../navigation/AdminStack";
import { CalendarScreenName } from "../../navigation/screenPaths";
import { toastError } from "../../components/ui/toast";

function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export default function DailyAgendaScreen() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { date: dateParam } = useParams();
    const date = dateParam || todayIso();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await calendarApi.getDayAgenda(date);
                const list = res?.data?.events || res?.events || [];
                if (!cancelled) setEvents(Array.isArray(list) ? list : []);
            } catch (e) {
                if (!cancelled) {
                    setEvents([]);
                    toastError(e?.response?.data?.message || "שגיאה בטעינת היומן");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [date]);

    const title = useMemo(() => {
        try {
            return new Date(`${date}T12:00:00`).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
        } catch {
            return date;
        }
    }, [date]);

    return (
        <SimpleScreen>
            <SimpleContainer style={{ maxWidth: "44rem", margin: "0 auto", padding: "1rem", gap: "1rem", display: "flex", flexDirection: "column" }}>
                <Text24>{t("calendar.dailyAgendaTitle")} — {title}</Text24>
                <PrimaryButton onPress={() => navigate(AdminStackName + CalendarScreenName)}>
                    {t("calendar.title")}
                </PrimaryButton>
                {loading && <Text12>טוען...</Text12>}
                {!loading && !events.length && <Text14>{t("calendar.noEvents")}</Text14>}
                {events.map((ev) => {
                    const start = ev.startTime ? new Date(ev.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
                    const end = ev.endTime ? new Date(ev.endTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
                    const invite =
                        ev.inviteStatus === "accepted" ? t("calendar.inviteStatusAccepted")
                            : ev.inviteStatus === "declined" ? t("calendar.inviteStatusDeclined")
                                : ev.inviteStatus === "pending" ? t("calendar.inviteStatusPending")
                                    : "";
                    return (
                        <SimpleCard key={ev.id} style={{ padding: "0.9rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                            <TextBold14>{ev.title}</TextBold14>
                            <Text14>{start}{end ? `–${end}` : ""}</Text14>
                            {ev.location && <Text12>מיקום: {ev.location}</Text12>}
                            {invite && <Text12>{invite}</Text12>}
                        </SimpleCard>
                    );
                })}
            </SimpleContainer>
        </SimpleScreen>
    );
}
