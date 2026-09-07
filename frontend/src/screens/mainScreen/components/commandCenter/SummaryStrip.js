import { useTranslation } from "react-i18next";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, TextBold14, TextBold28 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";

export default function SummaryStrip({ summary, isPerforming, onNavigate }) {
    const { t } = useTranslation();

    const chips = [
        {
            key: "urgent",
            label: t("managerHome.summary.urgent"),
            value: summary?.urgentCount ?? 0,
            accent: colors.negative,
            onClick: () => onNavigate?.("urgent"),
        },
        {
            key: "attention",
            label: t("managerHome.summary.needsAttention"),
            value: summary?.needsAttentionCount ?? 0,
            accent: colors.primary,
            onClick: () => onNavigate?.("attention"),
        },
        {
            key: "today",
            label: t("managerHome.summary.today"),
            value: summary?.todayEventCount ?? 0,
            accent: colors.SideBarSelected,
            onClick: () => onNavigate?.("today"),
        },
        {
            key: "signing",
            label: t("managerHome.summary.signing"),
            value: summary?.signingPending ?? 0,
            accent: "#B7791F",
            onClick: () => onNavigate?.("signing"),
        },
        {
            key: "unassigned",
            label: t("managerHome.summary.unassigned"),
            value: summary?.unassignedCases ?? 0,
            accent: colors.winter,
            onClick: () => onNavigate?.("unassigned"),
        },
    ];

    return (
        <SimpleContainer className="lw-commandCenter__summaryStrip">
            {chips.map((chip) => (
                <SimpleCard
                    key={chip.key}
                    className="lw-commandCenter__summaryChip"
                    onPress={chip.onClick}
                >
                    {isPerforming ? (
                        <Skeleton width="100%" height={52} borderRadius={8} />
                    ) : (
                        <>
                            <TextBold28 color={chip.accent}>{chip.value}</TextBold28>
                            <TextBold14>{chip.label}</TextBold14>
                            {chip.key === "signing" && (summary?.signingExpired > 0) && (
                                <Text12 color={colors.negative}>
                                    {t("managerHome.summary.signingExpired", { count: summary.signingExpired })}
                                </Text12>
                            )}
                        </>
                    )}
                </SimpleCard>
            ))}
        </SimpleContainer>
    );
}
