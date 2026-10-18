import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleButton from "../../../components/simpleComponents/SimpleButton";
import Skeleton from "../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold14, TextBold16 } from "../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../constant/colors";
import { AdminStackName, CalendarScreenName } from "../../../navigation/screenPaths";
import { useCalendarModuleEnabled } from "../../../services/firmSettings";
import { leaveColor } from "../../calendarScreen/utils/lawyerColors";
import { CalendarOwners } from "../../calendarScreen/components/CalendarOwners";
import { calendarAllDayRange, calendarEventsForDay, calendarEventStartTime, calendarOwners } from "../../calendarScreen/utils/calendarPresentation";
import { useMemo } from "react";
import "./CalendarWidget.scss";

const NAVY = "#2A4365";
const SLATE = "#4C6690";

function jerusalemDateKey(value) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
}

function addJerusalemDays(fromDate, days) {
    const baseKey = jerusalemDateKey(fromDate);
    if (!baseKey) return null;
    const [y, m, d] = baseKey.split("-").map(Number);
    const shifted = new Date(Date.UTC(y, m - 1, d + days));
    return jerusalemDateKey(shifted);
}

export function bucketEvents(events) {
    const todayKey = jerusalemDateKey(new Date());
    const tomorrowKey = addJerusalemDays(new Date(), 1);

    const inputs = (events || []).filter((ev) => ev.eventStatus !== 'cancelled').map((ev) => ({
        id: ev.id, title: ev.title, extendedProps: ev, allDay: Boolean(ev.allDay || ['leave', 'holiday'].includes(ev.eventType)),
        ...(ev.allDay || ['leave', 'holiday'].includes(ev.eventType) ? calendarAllDayRange(ev.startTime, ev.endTime) : { start: ev.startTime, end: ev.endTime }),
    }));
    return {
        today: calendarEventsForDay(inputs, todayKey).map((ev) => ev.extendedProps),
        tomorrow: calendarEventsForDay(inputs, tomorrowKey).map((ev) => ev.extendedProps),
    };
}

function EventRow({ ev, onPress, t, language }) {
    const isLeave = ev?.eventType === "leave";
    const dotColor = isLeave ? leaveColor() : (ev?.color || NAVY);
    return (
        <SimpleButton type="button"
            className={`lw-calendarWidget__item ${isLeave ? "lw-calendarWidget__item--leave" : ""}`}
            onPress={(e) => {
                e?.stopPropagation?.();
                onPress?.(ev);
            }}
            aria-label={t("calendar.openEventAria", { title: ev.title, time: calendarEventStartTime(ev, language, t) })}
        >
            <SimpleContainer className="lw-calendarWidget__itemTime">
                <TextBold14 color={NAVY}>{calendarEventStartTime(ev, language, t)}</TextBold14>
            </SimpleContainer>
            <SimpleContainer
                className={`lw-calendarWidget__itemDot ${isLeave ? "lw-calendarWidget__itemDot--striped" : ""}`}
                style={{ backgroundColor: dotColor }}
            />
            <CalendarOwners event={ev} small />
            <SimpleContainer className="lw-calendarWidget__itemBody">
                <TextBold14 numberOfLines={2} title={ev.title}>
                    {isLeave ? `[${t("calendar.leaveLabel")}] ${ev.ownerName || ev.title || ""}` : ev.title}
                </TextBold14>
                {calendarOwners(ev).length > 0 && <Text12 color={SLATE} numberOfLines={1}>{calendarOwners(ev).map((owner) => owner.name).join(' · ')}</Text12>}
                {ev.location && !isLeave && (
                    <Text12 color={SLATE} numberOfLines={1}>{ev.location}</Text12>
                )}
                {!isLeave && (ev.caseName || ev.clientDisplayName || ev.clientName) && (
                    <Text12 color={SLATE} numberOfLines={1}>
                        {ev.caseName || ev.clientDisplayName || ev.clientName}
                    </Text12>
                )}
            </SimpleContainer>
        </SimpleButton>
    );
}

function BucketSection({ heading, events, t, language, onEventPress }) {
    return (
        <SimpleContainer className="lw-calendarWidget__bucket">
            <SimpleContainer className="lw-calendarWidget__bucketHeader">
                <TextBold14 color={NAVY}>{heading}</TextBold14>
                <Text12 color={SLATE}>{events.length}</Text12>
            </SimpleContainer>
            {events.length === 0 ? (
                <SimpleContainer className="lw-calendarWidget__bucketEmpty">
                    <Text12 color={SLATE}>{t("calendar.noEvents")}</Text12>
                </SimpleContainer>
            ) : (
                <SimpleContainer className="lw-calendarWidget__list">
                    {events.map((ev) => (
                        <EventRow key={ev.id} ev={ev} onPress={onEventPress} t={t} language={language} />
                    ))}
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
}

export default function CalendarWidget({ events = [], isPerforming, onEventPress }) {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const calendarEnabled = useCalendarModuleEnabled();

    const buckets = useMemo(() => bucketEvents(events), [events]);
    const totalCount = buckets.today.length + buckets.tomorrow.length;

    if (!calendarEnabled) return null;

    const handleOpenCalendar = () => navigate(AdminStackName + CalendarScreenName);

    return (
        <SimpleCard className="lw-calendarWidget lw-calendarWidget--home">
            <SimpleContainer className="lw-calendarWidget__header">
                <TextBold16 color={colors.primary}>{t("calendar.widgetTitle")}</TextBold16>
                <SimpleButton type="button" className="lw-commandCenter__link" onPress={handleOpenCalendar}>
                    <Text12 color={colors.primary}>{t("managerHome.actions.openCalendar")}</Text12>
                </SimpleButton>
            </SimpleContainer>

            {isPerforming ? (
                <SimpleContainer className="lw-calendarWidget__skeletons">
                    {[0, 1, 2].map((i) => (
                        <SimpleContainer key={i} className="lw-calendarWidget__skeletonRow">
                            <Skeleton width={48} height={12} borderRadius={4} />
                            <Skeleton width={160} height={12} borderRadius={4} />
                        </SimpleContainer>
                    ))}
                </SimpleContainer>
            ) : totalCount === 0 ? (
                <SimpleContainer className="lw-calendarWidget__empty">
                    <Text14 color={SLATE}>{t("calendar.widgetEmpty")}</Text14>
                </SimpleContainer>
            ) : (
                <SimpleContainer className="lw-calendarWidget__split">
                    <BucketSection
                        heading={t("calendar.widgetTodayHeading")}
                        events={buckets.today}
                        t={t}
                        language={i18n.language}
                        onEventPress={onEventPress}
                    />
                    <SimpleContainer className="lw-calendarWidget__divider" />
                    <BucketSection
                        heading={t("calendar.widgetTomorrowHeading")}
                        events={buckets.tomorrow}
                        t={t}
                        language={i18n.language}
                        onEventPress={onEventPress}
                    />
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
