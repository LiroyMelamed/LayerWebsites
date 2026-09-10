import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import DoughnutChart from "../../../../components/specializedComponents/charts/DoughnutChart";
import { Text12, TextBold14 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";

const PALETTE = colors.doughnutChartColorScale;

const VIEW_MODES = ["open", "closed", "all"];

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

function managerCountForMode(manager, viewMode) {
    const open = manager.activeCases || 0;
    const closed = manager.closedCases || 0;
    if (viewMode === "closed") return closed;
    if (viewMode === "all") return open + closed;
    return open;
}

export default function ManagerWorkloadChart({ managers = [], onManagerPress }) {
    const { t } = useTranslation();
    const [viewMode, setViewMode] = useState("open");

    const cycleViewMode = () => {
        setViewMode((prev) => {
            const idx = VIEW_MODES.indexOf(prev);
            return VIEW_MODES[(idx + 1) % VIEW_MODES.length];
        });
    };

    const centerSubText = useMemo(() => {
        if (viewMode === "closed") return t("managerHome.operations.totalClosed");
        if (viewMode === "all") return t("managerHome.operations.totalAll");
        return t("managerHome.operations.totalActive");
    }, [viewMode, t]);

    const chartItems = useMemo(
        () => managers
            .map((manager, index) => ({
                manager,
                label: managerLabel(manager, t),
                sublabel: managerSublabel(manager, t),
                value: managerCountForMode(manager, viewMode),
                color: PALETTE[index % PALETTE.length],
            }))
            .filter((item) => item.value > 0),
        [managers, t, viewMode]
    );

    const total = chartItems.reduce((sum, item) => sum + item.value, 0);
    const showShare = chartItems.length > 1;

    if (total === 0 && managers.length === 0) {
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
                    subText={centerSubText}
                    onCenterPress={cycleViewMode}
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
                            onPress={() => onManagerPress?.(item.manager, viewMode)}
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
                                {showShare && (
                                    <Text12 color={colors.winter}>
                                        {t("managerHome.operations.casesShare", { pct })}
                                    </Text12>
                                )}
                            </SimpleContainer>
                        </SimpleContainer>
                    );
                })}
            </SimpleContainer>
        </SimpleContainer>
    );
}
