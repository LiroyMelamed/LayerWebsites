import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold14, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { formatDisplayTime } from "../../../../functions/date/formatDateForInput";
import { AdminStackName, CalendarScreenName } from "../../../../navigation/screenPaths";

export default function PotentialClientsPanel({ items = [], isPerforming }) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <SimpleCard className="lw-commandCenter__section">
            <SimpleContainer className="lw-commandCenter__sectionHeader">
                <TextBold18 color={colors.primary}>{t("managerHome.potentialClients.title")}</TextBold18>
                {!isPerforming && (
                    <Text12 color={colors.winter}>{t("managerHome.potentialClients.subtitle")}</Text12>
                )}
            </SimpleContainer>

            {isPerforming ? (
                <Skeleton width="100%" height={100} borderRadius={8} />
            ) : items.length === 0 ? (
                <Text14 color={colors.winter}>{t("managerHome.potentialClients.empty")}</Text14>
            ) : (
                <SimpleContainer className="lw-commandCenter__potentialList">
                    {items.map((item) => (
                        <SimpleContainer
                            key={item.eventId}
                            className="lw-commandCenter__potentialItem"
                            onClick={() => navigate(`${AdminStackName}${CalendarScreenName}`)}
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
                            {item.managerName && (
                                <Text12 color={colors.winter}>
                                    {t("managerHome.labels.manager")}: {item.managerName}
                                </Text12>
                            )}
                        </SimpleContainer>
                    ))}
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
