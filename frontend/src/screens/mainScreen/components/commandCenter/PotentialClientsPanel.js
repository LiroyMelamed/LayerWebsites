import { useTranslation } from "react-i18next";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, TextBold14, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { formatDisplayTime } from "../../../../functions/date/formatDateForInput";
import { openTodayEventsModal } from "./openTodayEventsModal";

export default function PotentialClientsPanel({
    items = [],
    isPerforming,
    openPopup,
    onEventPress,
}) {
    const { t } = useTranslation();

    if (!isPerforming && items.length === 0) {
        return null;
    }

    const handleOpenAll = () => {
        openTodayEventsModal({
            events: items.map((item) => ({
                id: item.eventId,
                title: item.title,
                startTime: item.startTime,
                caseName: item.leadCaseName,
                clientDisplayName: item.leadName,
                isPotentialClient: true,
            })),
            openPopup,
            onEventPress,
        });
    };

    return (
        <SimpleCard className="lw-commandCenter__section">
            <SimpleContainer className="lw-commandCenter__sectionHeader">
                <TextBold18 color={colors.primary}>{t("managerHome.potentialClients.title")}</TextBold18>
                <SimpleContainer
                    className="lw-commandCenter__link"
                    onPress={handleOpenAll}
                >
                    <Text12 color={colors.primary}>{t("managerHome.actions.openCalendar")}</Text12>
                </SimpleContainer>
            </SimpleContainer>

            {isPerforming ? (
                <Skeleton width="100%" height={80} borderRadius={8} />
            ) : (
                <SimpleContainer className="lw-commandCenter__potentialList">
                    {items.map((item) => (
                        <SimpleContainer
                            key={item.eventId}
                            className="lw-commandCenter__potentialItem"
                            onPress={() => onEventPress?.({
                                id: item.eventId,
                                title: item.title,
                                startTime: item.startTime,
                                caseName: item.leadCaseName,
                                clientDisplayName: item.leadName,
                            })}
                        >
                            <TextBold14 numberOfLines={1}>
                                {item.leadName || item.title}
                            </TextBold14>
                            <Text12 color={colors.winter} numberOfLines={1}>
                                {formatDisplayTime(item.startTime)}
                                {item.leadCaseName ? ` · ${item.leadCaseName}` : ""}
                            </Text12>
                            {item.leadPhone && (
                                <Text12 color={colors.winter}>{item.leadPhone}</Text12>
                            )}
                        </SimpleContainer>
                    ))}
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
