import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold14, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { formatDisplayTime } from "../../../../functions/date/formatDateForInput";
import { usePopup } from "../../../../providers/PopUpProvider";
import { navigateCalendar, navigateCaseRow } from "./commandCenterUtils";
import { openCalendarEventModal } from "./openCalendarEventModal";

export default function TodaySection({ events = [], isPerforming, onEventChanged }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { openPopup, closePopup } = usePopup();

    const handleEventPress = async (ev) => {
        if (ev.caseId) {
            navigateCaseRow(navigate, ev.caseId);
            return;
        }
        if (ev.id) {
            const opened = await openCalendarEventModal({
                eventId: ev.id,
                openPopup,
                closePopup,
                onSaved: onEventChanged,
                onDeleted: onEventChanged,
            });
            if (opened) return;
        }
        navigateCalendar(navigate);
    };

    return (
        <SimpleCard className="lw-commandCenter__section lw-commandCenter__dashboardTile" id="manager-home-today">
            <SimpleContainer className="lw-commandCenter__sectionHeader">
                <TextBold18 color={colors.primary}>{t("managerHome.today.title")}</TextBold18>
                <SimpleContainer
                    className="lw-commandCenter__link"
                    onPress={() => navigateCalendar(navigate)}
                >
                    <Text12 color={colors.primary}>{t("managerHome.actions.openCalendar")}</Text12>
                </SimpleContainer>
            </SimpleContainer>

            {isPerforming ? (
                <SimpleContainer className="lw-commandCenter__skeletonList">
                    {[0, 1].map((i) => <Skeleton key={i} width="100%" height={48} borderRadius={6} />)}
                </SimpleContainer>
            ) : events.length === 0 ? (
                <SimpleContainer className="lw-commandCenter__emptyState lw-commandCenter__emptyState--compact">
                    <Text14 color={colors.winter}>{t("managerHome.today.empty")}</Text14>
                </SimpleContainer>
            ) : (
                <SimpleContainer className="lw-commandCenter__todayList">
                    {events.map((ev) => (
                        <SimpleContainer
                            key={ev.id}
                            className="lw-commandCenter__todayItem"
                            onPress={() => handleEventPress(ev)}
                        >
                            <SimpleContainer className="lw-commandCenter__todayTime">
                                <TextBold14 color={colors.primary}>{formatDisplayTime(ev.startTime)}</TextBold14>
                            </SimpleContainer>
                            <SimpleContainer className="lw-commandCenter__todayBody">
                                <TextBold14 numberOfLines={1}>{ev.title}</TextBold14>
                                {(ev.caseName || ev.clientDisplayName) && (
                                    <Text12 color={colors.winter} numberOfLines={1}>
                                        {[ev.caseName, ev.clientDisplayName].filter(Boolean).join(" · ")}
                                    </Text12>
                                )}
                                {ev.isPotentialClient && (
                                    <Text12 color="#B7791F">{t("managerHome.today.potentialClient")}</Text12>
                                )}
                                {ev.inviteStatus === "pending" && (
                                    <Text12 color={colors.negative}>{t("managerHome.today.rsvpPending")}</Text12>
                                )}
                            </SimpleContainer>
                        </SimpleContainer>
                    ))}
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
