import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import DoughnutChart from "../../../../components/specializedComponents/charts/DoughnutChart";
import { Text12, TextBold14 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";

const PALETTE = colors.doughnutChartColorScale;

function managerLabel(manager, t) {
    if (manager?.unassigned) return t("managerHome.operations.unassignedLabel");
    return manager?.managerName || "—";
}

function managerSublabel(manager, t) {
    if (manager?.urgentCases > 0) {
        return t("managerHome.operations.urgentShort", { count: manager.urgentCases });
    }
    if (manager?.needsAttention > 0) {
        return t("managerHome.operations.needsAttentionShort", { count: manager.needsAttention });
    }
    return null;
}

export default function ManagerWorkloadChart({ managers = [], onManagerPress }) {
    const { t } = useTranslation();

    const chartItems = useMemo(
        () => managers.map((manager, index) => ({
            manager,
            label: managerLabel(manager, t),
            sublabel: managerSublabel(manager, t),
            value: manager.activeCases || 0,
            color: PALETTE[index % PALETTE.length],
        })),
        [managers, t]
    );

    const total = chartItems.reduce((sum, item) => sum + item.value, 0);

    if (total === 0) {
        return null;
    }

    return (
        <SimpleContainer className="lw-commandCenter__managerChart">
            <SimpleContainer className="lw-commandCenter__managerChartDonut">
                <DoughnutChart
                    data={chartItems.map((item) => item.value)}
                    colors={chartItems.map((item) => item.color)}
                    labels={chartItems.map((item) => item.label)}
                    centerText={String(total)}
                    subText={t("managerHome.operations.totalActive")}
                />
            </SimpleContainer>

            <SimpleContainer className="lw-commandCenter__managerChartLegend" role="list">
                {chartItems.map((item) => {
                    const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                    return (
                        <SimpleContainer
                            key={item.manager.managerId ?? item.label}
                            className="lw-commandCenter__managerChartLegendItem"
                            role="listitem"
                            onPress={() => onManagerPress?.(item.manager)}
                        >
                            <SimpleContainer
                                className="lw-commandCenter__managerChartSwatch"
                                style={{ backgroundColor: item.color }}
                                aria-hidden
                            />
                            <SimpleContainer className="lw-commandCenter__managerChartLegendBody">
                                <TextBold14 numberOfLines={1}>{item.label}</TextBold14>
                                {item.sublabel && (
                                    <Text12 color={colors.winter} numberOfLines={1}>
                                        {item.sublabel}
                                    </Text12>
                                )}
                            </SimpleContainer>
                            <SimpleContainer className="lw-commandCenter__managerChartLegendMeta">
                                <TextBold14>{item.value}</TextBold14>
                                <Text12 color={colors.winter}>{`${pct}% מהתיקים`}</Text12>
                            </SimpleContainer>
                        </SimpleContainer>
                    );
                })}
            </SimpleContainer>
        </SimpleContainer>
    );
}
