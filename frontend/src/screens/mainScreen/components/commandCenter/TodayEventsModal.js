import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Separator from "../../../../components/styledComponents/separators/Separator";
import { Text12, Text14, TextBold14, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { formatDisplayTime } from "../../../../functions/date/formatDateForInput";
import { leaveColor } from "../../../calendarScreen/utils/lawyerColors";

const NAVY = "#2A4365";
const SLATE = "#4C6690";

function jerusalemDateKey(value) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
}

function filterTodayEvents(events = []) {
    const todayKey = jerusalemDateKey(new Date());
    return (events || [])
        .filter((ev) => ev?.startTime && jerusalemDateKey(ev.startTime) === todayKey)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

function EventRow({ ev, onPress }) {
    const isLeave = ev?.eventType === "leave";
    const dotColor = isLeave ? leaveColor() : (ev?.color || NAVY);

    return (
        <SimpleContainer
            className={`lw-commandCenter__todayEventRow ${isLeave ? "lw-commandCenter__todayEventRow--leave" : ""}`}
            onPress={() => onPress?.(ev)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPress?.(ev);
                }
            }}
        >
            <SimpleContainer className="lw-commandCenter__todayEventTime">
                <TextBold14 color={NAVY}>{formatDisplayTime(ev.startTime)}</TextBold14>
            </SimpleContainer>
            <SimpleContainer
                className={`lw-commandCenter__todayEventDot ${isLeave ? "lw-commandCenter__todayEventDot--striped" : ""}`}
                style={{ backgroundColor: dotColor }}
            />
            <SimpleContainer className="lw-commandCenter__todayEventBody">
                <TextBold14 numberOfLines={2}>
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

export default function TodayEventsModal({ events = [], onEventPress }) {
    const { t } = useTranslation();
    const todayEvents = useMemo(() => filterTodayEvents(events), [events]);

    return (
        <SimpleContainer className="lw-commandCenter__todayEventsModal">
            <SimpleContainer className="lw-commandCenter__todayEventsModalHeader">
                <TextBold18 color={colors.primary}>{t("managerHome.stats.todayEvents")}</TextBold18>
                <Text12 color={colors.winter}>
                    {t("managerHome.todayEventsModal.count", { count: todayEvents.length })}
                </Text12>
            </SimpleContainer>
            <SimpleContainer className="lw-commandCenter__todayEventsModalBody">
                {todayEvents.length === 0 ? (
                    <SimpleContainer className="lw-commandCenter__emptyState lw-commandCenter__emptyState--compact">
                        <Text14 color={colors.winter}>{t("managerHome.today.empty")}</Text14>
                    </SimpleContainer>
                ) : (
                    todayEvents.map((ev, idx) => (
                        <SimpleContainer key={ev.id ?? `${ev.startTime}-${idx}`}>
                            {idx > 0 && (
                                <Separator className="lw-commandCenter__attentionSeparator" />
                            )}
                            <EventRow ev={ev} onPress={onEventPress} />
                        </SimpleContainer>
                    ))
                )}
            </SimpleContainer>
        </SimpleContainer>
    );
}
