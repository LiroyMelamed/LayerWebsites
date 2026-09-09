import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, TextBold14, TextBold20 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { usePopup } from "../../../../providers/PopUpProvider";
import { createDashboardModalHandlers } from "./dashboardModalUtils";
import { openAttentionModal } from "./openAttentionModal";
import { openTodayEventsModal } from "./openTodayEventsModal";

function StatTile({ label, value, sublabel, accent, onClick, valueFirst = true }) {
    const valueNode = (
        <TextBold20 color={accent || colors.primary} numberOfLines={2}>{value}</TextBold20>
    );
    const labelNode = (
        <TextBold14 numberOfLines={2}>{label}</TextBold14>
    );

    return (
        <SimpleCard className="lw-commandCenter__statTile" onPress={onClick}>
            {valueFirst ? (
                <>
                    {valueNode}
                    {labelNode}
                </>
            ) : (
                <>
                    {labelNode}
                    {valueNode}
                </>
            )}
            {sublabel && (
                <Text12 color={colors.winter} numberOfLines={2}>{sublabel}</Text12>
            )}
        </SimpleCard>
    );
}

export default function FirmStatsPanel({
    firmStats,
    drillDown,
    signing,
    attentionItems = [],
    todayEvents = [],
    onTodayEventPress,
    isPerforming,
    onDataChanged,
}) {
    const { t } = useTranslation();
    const { openPopup, pushPopup, popPopup, closePopup } = usePopup();

    const dashboardModals = useMemo(
        () => createDashboardModalHandlers({ openPopup, pushPopup, closePopup, onDataChanged, t }),
        [openPopup, pushPopup, closePopup, onDataChanged, t],
    );

    const handleAttentionPress = () => {
        openAttentionModal({
            attentionItems,
            openPopup,
            pushPopup,
            popPopup,
            closePopup,
            onDataChanged,
        });
    };

    const mostActive = firmStats?.mostActiveManager;

    const tiles = [
        {
            key: "openedToday",
            label: t("managerHome.stats.casesOpenedToday"),
            value: firmStats?.casesOpenedToday ?? 0,
            onClick: () => dashboardModals.openCasesOpenedToday(drillDown),
        },
        {
            key: "mostActive",
            label: t("managerHome.stats.mostActiveManager"),
            value: mostActive?.managerName || "—",
            sublabel: mostActive
                ? t("managerHome.stats.activityCount", { count: mostActive.activityCount })
                : t("managerHome.stats.noActivityToday"),
            accent: colors.SideBarSelected,
            valueFirst: false,
            onClick: mostActive
                ? () => dashboardModals.openMostActiveManagerLog(drillDown, mostActive)
                : undefined,
        },
        {
            key: "openCases",
            label: t("managerHome.stats.openCases"),
            value: firmStats?.openCases ?? 0,
            onClick: () => dashboardModals.openOpenCases(drillDown),
        },
        {
            key: "attention",
            label: t("managerHome.stats.needsAttention"),
            value: firmStats?.attentionQueueCount ?? firmStats?.needsAttentionCount ?? 0,
            accent: firmStats?.urgentCount > 0 ? colors.negative : colors.primary,
            sublabel: firmStats?.urgentCount > 0
                ? t("managerHome.stats.urgentCount", { count: firmStats.urgentCount })
                : firmStats?.noActivityCases > 0
                    ? t("managerHome.stats.noActivityInQueue", { count: firmStats.noActivityCases })
                    : null,
            onClick: handleAttentionPress,
        },
        {
            key: "signing",
            label: t("managerHome.stats.signingPending"),
            value: firmStats?.signingPending ?? 0,
            accent: firmStats?.signingExpired > 0 ? colors.negative : "#B7791F",
            sublabel: firmStats?.signingExpired > 0
                ? t("managerHome.summary.signingExpired", { count: firmStats.signingExpired })
                : firmStats?.signedToday > 0
                    ? t("managerHome.stats.signedToday", { count: firmStats.signedToday })
                    : null,
            onClick: () => dashboardModals.openSigningQueue(signing),
        },
        {
            key: "todayEvents",
            label: t("managerHome.stats.todayEvents"),
            value: firmStats?.todayEventCount ?? 0,
            onClick: () => openTodayEventsModal({
                events: todayEvents,
                openPopup,
                onEventPress: onTodayEventPress,
            }),
        },
        {
            key: "unassigned",
            label: t("managerHome.stats.unassigned"),
            value: firmStats?.unassignedCases ?? 0,
            accent: firmStats?.unassignedCases > 0 ? colors.negative : colors.winter,
            onClick: () => dashboardModals.openUnassignedCases(drillDown),
        },
        {
            key: "closedToday",
            label: t("managerHome.stats.casesClosedToday"),
            value: firmStats?.casesClosedToday ?? 0,
            onClick: () => dashboardModals.openCasesClosedToday(drillDown),
        },
    ];

    if (isPerforming) {
        return (
            <SimpleContainer className="lw-commandCenter__statsGrid" id="manager-home-stats">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <Skeleton key={i} width="100%" height={72} borderRadius={8} />
                ))}
            </SimpleContainer>
        );
    }

    return (
        <SimpleContainer className="lw-commandCenter__statsGrid" id="manager-home-stats">
            {tiles.map((tile) => (
                <StatTile key={tile.key} {...tile} />
            ))}
        </SimpleContainer>
    );
}
