import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold14, TextBold16 } from "../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../constant/colors";
import { AdminStackName } from "../../../navigation/AdminStack";
import { CalendarScreenName } from "../../calendarScreen/CalendarScreen";
import { formatDisplayTime } from "../../../functions/date/formatDateForInput";
import { ENABLE_CALENDAR_MODULE } from "../../../featureFlags";
import { leaveColor } from "../../calendarScreen/utils/lawyerColors";
import "./CalendarWidget.scss";

const NAVY = "#2A4365";
const SLATE = "#4C6690";

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function bucketEvents(events) {
    const today = startOfDay(new Date());
    const tomorrow = startOfDay(new Date());
    tomorrow.setDate(today.getDate() + 1);
    const dayAfter = startOfDay(new Date());
    dayAfter.setDate(today.getDate() + 2);

    const inTodayBucket = [];
    const inTomorrowBucket = [];

    for (const ev of events || []) {
        if (!ev?.startTime) continue;
        const start = new Date(ev.startTime);
        if (start >= today && start < tomorrow) inTodayBucket.push(ev);
        else if (start >= tomorrow && start < dayAfter) inTomorrowBucket.push(ev);
    }

    inTodayBucket.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    inTomorrowBucket.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    return { today: inTodayBucket, tomorrow: inTomorrowBucket };
}

function EventRow({ ev }) {
    const isLeave = ev?.eventType === "leave";
    const dotColor = isLeave ? leaveColor() : (ev?.color || NAVY);
    return (
        <SimpleContainer className={`lw-calendarWidget__item ${isLeave ? "lw-calendarWidget__item--leave" : ""}`}>
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

function BucketSection({ heading, events, t }) {
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
                    {events.map((ev) => <EventRow key={ev.id} ev={ev} />)}
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
}

export default function CalendarWidget({ events = [], isPerforming }) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const buckets = useMemo(() => bucketEvents(events), [events]);
    const totalCount = buckets.today.length + buckets.tomorrow.length;

    if (!ENABLE_CALENDAR_MODULE) return null;

    const handleNavigate = () => navigate(AdminStackName + CalendarScreenName);

    return (
        <SimpleCard className="lw-calendarWidget" onPress={handleNavigate}>
            <SimpleContainer className="lw-calendarWidget__header">
                <TextBold16 color={colors.primary}>{t("calendar.widgetTitle")}</TextBold16>
                {!isPerforming && totalCount > 0 && (
                    <Text12 color={SLATE}>{totalCount}</Text12>
                )}
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
                    <BucketSection heading={t("calendar.widgetTodayHeading")} events={buckets.today} t={t} />
                    <SimpleContainer className="lw-calendarWidget__divider" />
                    <BucketSection heading={t("calendar.widgetTomorrowHeading")} events={buckets.tomorrow} t={t} />
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
