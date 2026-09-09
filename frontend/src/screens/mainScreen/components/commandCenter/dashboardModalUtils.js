import DashboardDrillDownModal from "./DashboardDrillDownModal";
import { openCaseMenuModal } from "./openCaseMenuModal";
import { openSigningFileModal } from "./openSigningFileModal";
import { resolveSigningQueueState } from "./commandCenterUtils";

function openDrillDownModal({
    openPopup,
    title,
    subtitle,
    emptyText,
    variant,
    items,
    onItemPress,
    resolveSigningState,
}) {
    if (!openPopup) return false;

    openPopup(
        <DashboardDrillDownModal
            title={title}
            subtitle={subtitle}
            emptyText={emptyText}
            variant={variant}
            items={items}
            onItemPress={onItemPress}
            resolveSigningState={resolveSigningState}
        />,
    );
    return true;
}

export function createDashboardModalHandlers({ openPopup, pushPopup, closePopup, onDataChanged, t }) {
    const openCaseItem = (item) => {
        if (!item?.caseId && !item?.caseName) return;
        openCaseMenuModal({
            caseId: item.caseId,
            caseName: item.caseName,
            pushPopup,
            onSaved: onDataChanged,
        });
    };

    const openSigningItem = async (item) => {
        if (!item?.signingFileId) return;
        await openSigningFileModal({
            signingFileId: item.signingFileId,
            pushPopup,
            closePopup,
            onChanged: onDataChanged,
        });
    };

    const openCaseList = ({ title, subtitle, emptyText, items = [] }) => openDrillDownModal({
        openPopup,
        title,
        subtitle,
        emptyText,
        variant: "case",
        items,
        onItemPress: openCaseItem,
    });

    const openActivityList = ({ title, subtitle, emptyText, items = [] }) => openDrillDownModal({
        openPopup,
        title,
        subtitle,
        emptyText,
        variant: "activity",
        items,
        onItemPress: (item) => {
            if (item?.caseId || item?.caseName) {
                openCaseItem(item);
            }
        },
    });

    const openSigningList = ({ title, subtitle, emptyText, items = [] }) => openDrillDownModal({
        openPopup,
        title,
        subtitle,
        emptyText,
        variant: "signing",
        items,
        onItemPress: openSigningItem,
        resolveSigningState: resolveSigningQueueState,
    });

    const openCasesOpenedToday = (drillDown) => openCaseList({
        title: t("managerHome.stats.casesOpenedToday"),
        subtitle: t("managerHome.drillDown.count", { count: drillDown?.casesOpenedToday?.length ?? 0 }),
        emptyText: t("managerHome.drillDown.casesOpenedTodayEmpty"),
        items: drillDown?.casesOpenedToday || [],
    });

    const openCasesClosedToday = (drillDown) => openCaseList({
        title: t("managerHome.stats.casesClosedToday"),
        subtitle: t("managerHome.drillDown.count", { count: drillDown?.casesClosedToday?.length ?? 0 }),
        emptyText: t("managerHome.drillDown.casesClosedTodayEmpty"),
        items: drillDown?.casesClosedToday || [],
    });

    const openOpenCases = (drillDown) => openCaseList({
        title: t("managerHome.stats.openCases"),
        subtitle: t("managerHome.drillDown.count", { count: drillDown?.openCases?.length ?? 0 }),
        emptyText: t("managerHome.drillDown.openCasesEmpty"),
        items: drillDown?.openCases || [],
    });

    const openUnassignedCases = (drillDown) => openCaseList({
        title: t("managerHome.stats.unassigned"),
        subtitle: t("managerHome.drillDown.count", { count: drillDown?.unassignedCases?.length ?? 0 }),
        emptyText: t("managerHome.drillDown.unassignedEmpty"),
        items: drillDown?.unassignedCases || [],
    });

    const openMostActiveManagerLog = (drillDown, manager) => {
        const managerId = manager?.managerId;
        const items = (drillDown?.todayActivityLog || []).filter((entry) => {
            if (!managerId) return true;
            return String(entry.managerId) === String(managerId);
        });

        return openActivityList({
            title: t("managerHome.drillDown.managerActivityTitle", {
                name: manager?.managerName || "—",
            }),
            subtitle: t("managerHome.drillDown.managerActivitySubtitle", {
                count: items.length,
            }),
            emptyText: t("managerHome.drillDown.managerActivityEmpty"),
            items,
        });
    };

    const openSigningQueue = (signing, filterState) => {
        const queue = signing?.queue || [];
        let items;
        if (filterState === "pending") {
            items = queue.filter((row) => resolveSigningQueueState(row) !== "rejected");
        } else if (filterState) {
            items = queue.filter((row) => resolveSigningQueueState(row) === filterState);
        } else {
            items = queue;
        }

        const titleByState = {
            pending: t("managerHome.signing.pending"),
            expiring: t("managerHome.signing.expiring"),
            expired: t("managerHome.signing.expired"),
            rejected: t("managerHome.signing.rejected"),
        };

        return openSigningList({
            title: filterState ? titleByState[filterState] : t("managerHome.stats.signingPending"),
            subtitle: t("managerHome.drillDown.count", { count: items.length }),
            emptyText: t("managerHome.signing.empty"),
            items,
        });
    };

    return {
        openCasesOpenedToday,
        openCasesClosedToday,
        openOpenCases,
        openUnassignedCases,
        openMostActiveManagerLog,
        openSigningQueue,
    };
}
