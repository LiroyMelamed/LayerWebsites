import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold16, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import AttentionItem from "./AttentionItem";
import { navigateAttentionItem, navigateOpenCases } from "./commandCenterUtils";

export default function AttentionQueue({ items = [], isPerforming }) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <SimpleCard className="lw-commandCenter__attention lw-commandCenter__section lw-commandCenter__dashboardTile">
            <SimpleContainer className="lw-commandCenter__sectionHeader">
                <TextBold18 color={colors.primary}>{t("managerHome.attention.title")}</TextBold18>
                {!isPerforming && items.length > 0 && (
                    <SimpleContainer
                        className="lw-commandCenter__link"
                        onPress={() => navigateOpenCases(navigate)}
                    >
                        <Text12 color={colors.primary}>{t("managerHome.actions.viewAllCases")}</Text12>
                    </SimpleContainer>
                )}
            </SimpleContainer>

            {isPerforming ? (
                <SimpleContainer className="lw-commandCenter__skeletonList">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} width="100%" height={56} borderRadius={8} />
                    ))}
                </SimpleContainer>
            ) : items.length === 0 ? (
                <SimpleContainer className="lw-commandCenter__emptyState lw-commandCenter__emptyState--compact">
                    <TextBold16 color={colors.positive}>{t("managerHome.attention.allClearTitle")}</TextBold16>
                    <Text14 color={colors.winter}>{t("managerHome.attention.allClearBody")}</Text14>
                </SimpleContainer>
            ) : (
                <SimpleContainer className="lw-commandCenter__attentionList">
                    {items.map((item, idx) => (
                        <AttentionItem
                            key={`${item.kind}-${item.signalType}-${item.entityId ?? idx}`}
                            item={item}
                            onPress={() => navigateAttentionItem(navigate, item)}
                        />
                    ))}
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
