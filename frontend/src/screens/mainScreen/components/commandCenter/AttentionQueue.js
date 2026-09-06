import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold16, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import AttentionItem from "./AttentionItem";
import { navigateAttentionItem } from "./commandCenterUtils";

export default function AttentionQueue({ items = [], isPerforming }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [expandedGroups, setExpandedGroups] = useState({});

    const toggleGroup = (signalType) => {
        setExpandedGroups((prev) => ({
            ...prev,
            [signalType]: !prev[signalType],
        }));
    };

    return (
        <SimpleCard className="lw-commandCenter__attention lw-commandCenter__section">
            <SimpleContainer className="lw-commandCenter__sectionHeader">
                <TextBold18 color={colors.primary}>{t("managerHome.attention.title")}</TextBold18>
                {!isPerforming && (
                    <Text12 color={colors.winter}>
                        {items.length
                            ? t("managerHome.attention.count", { count: items.length })
                            : t("managerHome.attention.emptyBadge")}
                    </Text12>
                )}
            </SimpleContainer>

            {isPerforming ? (
                <SimpleContainer className="lw-commandCenter__skeletonList">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} width="100%" height={88} borderRadius={10} />
                    ))}
                </SimpleContainer>
            ) : items.length === 0 ? (
                <SimpleContainer className="lw-commandCenter__emptyState">
                    <TextBold16 color={colors.positive}>{t("managerHome.attention.allClearTitle")}</TextBold16>
                    <Text14 color={colors.winter}>{t("managerHome.attention.allClearBody")}</Text14>
                </SimpleContainer>
            ) : (
                <SimpleContainer className="lw-commandCenter__attentionList">
                    {items.map((item, idx) => (
                        <AttentionItem
                            key={`${item.kind}-${item.signalType}-${item.entityId ?? idx}`}
                            item={item}
                            expanded={Boolean(expandedGroups[item.signalType])}
                            onToggleExpand={() => toggleGroup(item.signalType)}
                            onPress={() => navigateAttentionItem(navigate, item)}
                            onSamplePress={(sample) => navigateAttentionItem(navigate, sample)}
                        />
                    ))}
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
