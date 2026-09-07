import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold14, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { AdminStackName, AllCasesScreenName } from "../../../../navigation/screenPaths";

function formatWhen(iso) {
    if (!iso) return "";
    try {
        return new Intl.DateTimeFormat("he-IL", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Jerusalem",
        }).format(new Date(iso));
    } catch {
        return "";
    }
}

export default function RecentActivityFeed({ items = [], isPerforming }) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <SimpleCard className="lw-commandCenter__section">
            <SimpleContainer className="lw-commandCenter__sectionHeader">
                <TextBold18 color={colors.primary}>{t("managerHome.activity.title")}</TextBold18>
            </SimpleContainer>

            {isPerforming ? (
                <SimpleContainer className="lw-commandCenter__skeletonList">
                    {[0, 1, 2].map((i) => <Skeleton key={i} width="100%" height={48} borderRadius={6} />)}
                </SimpleContainer>
            ) : items.length === 0 ? (
                <Text14 color={colors.winter}>{t("managerHome.activity.empty")}</Text14>
            ) : (
                <SimpleContainer className="lw-commandCenter__activityList">
                    {items.map((item, idx) => (
                        <SimpleContainer
                            key={`${item.activityType}-${item.caseId}-${idx}`}
                            className="lw-commandCenter__activityItem"
                            onClick={() => {
                                if (item.caseId) {
                                    navigate(`${AdminStackName}${AllCasesScreenName}?caseId=${item.caseId}`);
                                }
                            }}
                        >
                            <Text12 color={colors.winter}>{formatWhen(item.occurredAt)}</Text12>
                            <TextBold14 numberOfLines={1}>
                                {t(`managerHome.activity.types.${item.activityType}`, item.activityType)}
                            </TextBold14>
                            {item.caseName && (
                                <Text12 color={colors.winter} numberOfLines={1}>{item.caseName}</Text12>
                            )}
                        </SimpleContainer>
                    ))}
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
