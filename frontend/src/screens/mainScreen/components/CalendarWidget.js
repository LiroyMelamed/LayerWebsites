import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold14, TextBold16 } from "../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../constant/colors";
import { AdminStackName, CalendarScreenName } from "../../../navigation/screenPaths";
import { formatDisplayTime } from "../../../functions/date/formatDateForInput";
import { useCalendarModuleEnabled } from "../../../services/firmSettings";
import { leaveColor } from "../../calendarScreen/utils/lawyerColors";
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

function bucketEvents(events) {
    const todayKey = jerusalemDateKey(new Date());
    const tomorrowKey = addJerusalemDays(new Date(), 1);

    const inTodayBucket = [];
    const inTomorrowBucket = [];

    for (const ev of events || []) {
        if (!ev?.startTime) continue;
        const key = jerusalemDateKey(ev.startTime);
        if (!key) continue;
        if (key === todayKey) inTodayBucket.push(ev);
        else if (key === tomorrowKey) inTomorrowBucket.push(ev);
    }

    inTodayBucket.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    inTomorrowBucket.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    return { today: inTodayBucket, tomorrow: inTomorrowBucket };
}

function EventRow({ ev, onPress }) {
    const isLeave = ev?.eventType === "leave";
    const dotColor = isLeave ? leaveColor() : (ev?.color || NAVY);
    return (
        <SimpleContainer
            className={`lw-calendarWidget__item ${isLeave ? "lw-calendarWidget__item--leave" : ""}`}
            onPress={(e) => {
                e?.stopPropagation?.();
                onPress?.(ev);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPress?.(ev);
                }
            }}
        >
            <SimpleContainer className="lw-calendarWidget__itemTime">
                <TextBold14 color={NAVY}>{formatDisplayTime(ev.startTime)}</TextBold14>
            </SimpleContainer>
            <SimpleContainer
                className={`lw-calendarWidget__itemDot ${isLeave ? "lw-calendarWidget__itemDot--striped" : ""}`}
                style={{ backgroundColor: dotColor }}
            />
            <SimpleContainer className="lw-calendarWidget__itemBody">
                <TextBold14 numberOfLines={1}>
                    {isLeave ? `[חופשה] ${ev.ownerName || ev.title || ""}` : ev.title}
                </TextBold14>
                {ev.location && !isLeave && (
                    <Text12 color={SLATE} numberOfLines={1}>{ev.location}</Text12>
                )}
                {!isLeave && (ev.caseName || ev.clientDisplayName || ev.clientName) && (
                    <Text12 color={SLATE} numberOfLines={1}>
                        {ev.caseName || ev.clientDisplayName || ev.clientName}
                    </Text12>
                )}
            </SimpleContainer>
        </SimpleContainer>
    );
}

function BucketSection({ heading, events, t, onEventPress }) {
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
                        <EventRow key={ev.id} ev={ev} onPress={onEventPress} />
                    ))}
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
}

export default function CalendarWidget({ events = [], isPerforming, onEventPress }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const calendarEnabled = useCalendarModuleEnabled();

    const buckets = useMemo(() => bucketEvents(events), [events]);
    const totalCount = buckets.today.length + buckets.tomorrow.length;

    if (!calendarEnabled) return null;

    if (!isPerforming && totalCount === 0) return null;

    const handleOpenCalendar = () => navigate(AdminStackName + CalendarScreenName);

    return (
        <SimpleCard className="lw-calendarWidget lw-calendarWidget--home">
            <SimpleContainer className="lw-calendarWidget__header">
                <TextBold16 color={colors.primary}>{t("calendar.widgetTitle")}</TextBold16>
                <SimpleContainer className="lw-commandCenter__link" onPress={handleOpenCalendar}>
                    <Text12 color={colors.primary}>{t("managerHome.actions.openCalendar")}</Text12>
                </SimpleContainer>
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
                        onEventPress={onEventPress}
                    />
                    <SimpleContainer className="lw-calendarWidget__divider" />
                    <BucketSection
                        heading={t("calendar.widgetTomorrowHeading")}
                        events={buckets.tomorrow}
                        t={t}
                        onEventPress={onEventPress}
                    />
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
