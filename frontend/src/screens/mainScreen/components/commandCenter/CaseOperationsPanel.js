import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BriefcaseBusiness, UserRoundSearch } from "lucide-react";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { TextBold14 } from "../../../../components/specializedComponents/text/AllTextKindFile";
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
        <SimpleCard className="lw-commandCenter__section lw-businessHome__operations" id="manager-home-operations">
            <SimpleContainer className="lw-commandCenter__sectionHeader">
                <div className="lw-businessHome__sectionTitle">
                    <span className="lw-businessHome__icon"><BriefcaseBusiness size={20} aria-hidden="true" /></span>
                    <div><h2>{t("managerHome.operations.byManager")}</h2><p>{t("managerHome.business.workloadSubtitle")}</p></div>
                </div>
                <button
                    type="button"
                    className="lw-businessHome__sectionLink"
                    onClick={() => dashboardModals.openOpenCases(drillDown)}
                >
                    {t("managerHome.actions.viewAllCases")}<ArrowLeft size={15} aria-hidden="true" />
                </button>
            </SimpleContainer>

            {isPerforming ? (
                <Skeleton width="100%" height={180} borderRadius={8} />
            ) : (
                <SimpleContainer className="lw-commandCenter__panelBody">
                    {managerWorkload.length === 0 ? (
                        <p className="lw-businessHome__empty">{t("managerHome.operations.noManagers")}</p>
                    ) : (
                        <ManagerWorkloadChart
                            managers={managerWorkload}
                            onManagerPress={(manager, viewMode) => navigateOpenCasesByManager(navigate, manager, viewMode)}
                        />
                    )}

                    {unassignedCases?.count > 0 && (
                        <button
                            type="button"
                            className="lw-commandCenter__unassignedBanner"
                            onClick={() => dashboardModals.openUnassignedCases(drillDown)}
                        >
                            <UserRoundSearch size={18} aria-hidden="true" />
                            <TextBold14 color={colors.negative}>
                                {t("managerHome.operations.unassignedBanner", { count: unassignedCases.count })}
                            </TextBold14>
                            <ArrowLeft size={16} className="lw-businessHome__rowArrow" aria-hidden="true" />
                        </button>
                    )}
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
