import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold14, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { usePopup } from "../../../../providers/PopUpProvider";
import { navigateOpenCasesByManager } from "./commandCenterUtils";
import { createDashboardModalHandlers } from "./dashboardModalUtils";
import ManagerWorkloadChart from "./ManagerWorkloadChart";

export default function CaseOperationsPanel({
    managerWorkload = [],
    unassignedCases,
    drillDown,
    isPerforming,
    onDataChanged,
}) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { openPopup, closePopup, pushPopup } = usePopup();

    const dashboardModals = useMemo(
        () => createDashboardModalHandlers({ openPopup, pushPopup, closePopup, onDataChanged, t }),
        [openPopup, pushPopup, closePopup, onDataChanged, t],
    );

    return (
        <SimpleCard className="lw-commandCenter__section" id="manager-home-operations">
            <SimpleContainer className="lw-commandCenter__sectionHeader">
                <TextBold18 color={colors.primary}>{t("managerHome.operations.byManager")}</TextBold18>
                <SimpleContainer
                    className="lw-commandCenter__link"
                    onPress={() => dashboardModals.openOpenCases(drillDown)}
                >
                    <Text12 color={colors.primary}>{t("managerHome.actions.viewAllCases")}</Text12>
                </SimpleContainer>
            </SimpleContainer>

            {isPerforming ? (
                <Skeleton width="100%" height={180} borderRadius={8} />
            ) : (
                <SimpleContainer className="lw-commandCenter__panelBody">
                    {managerWorkload.length === 0 ? (
                        <Text14 color={colors.winter}>{t("managerHome.operations.noManagers")}</Text14>
                    ) : (
                        <ManagerWorkloadChart
                            managers={managerWorkload}
                            onManagerPress={(manager, viewMode) => navigateOpenCasesByManager(navigate, manager, viewMode)}
                        />
                    )}

                    {unassignedCases?.count > 0 && (
                        <SimpleContainer
                            className="lw-commandCenter__unassignedBanner"
                            onPress={() => dashboardModals.openUnassignedCases(drillDown)}
                        >
                            <TextBold14 color={colors.negative}>
                                {t("managerHome.operations.unassignedBanner", { count: unassignedCases.count })}
                            </TextBold14>
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
