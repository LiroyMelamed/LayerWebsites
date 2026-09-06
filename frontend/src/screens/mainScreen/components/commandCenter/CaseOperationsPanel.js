import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold14, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { navigateCaseRow, navigateOpenCases, navigateSigningRow } from "./commandCenterUtils";

function WorkloadBar({ label, value, max, sublabel, onClick }) {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    return (
        <SimpleContainer className="lw-commandCenter__workloadRow" onPress={onClick}>
            <SimpleContainer className="lw-commandCenter__workloadMeta">
                <TextBold14 numberOfLines={1}>{label}</TextBold14>
                {sublabel && <Text12 color={colors.winter}>{sublabel}</Text12>}
            </SimpleContainer>
            <SimpleContainer className="lw-commandCenter__workloadBarTrack">
                <SimpleContainer
                    className="lw-commandCenter__workloadBarFill"
                    style={{ transform: `scaleX(${pct / 100})` }}
                />
            </SimpleContainer>
            <TextBold14>{value}</TextBold14>
        </SimpleContainer>
    );
}

export default function CaseOperationsPanel({
    managerWorkload = [],
    casesByStage = [],
    unassignedCases,
    isPerforming,
}) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const maxCases = Math.max(1, ...managerWorkload.map((m) => m.activeCases));

    const topStages = [...casesByStage]
        .sort((a, b) => b.case_count - a.case_count)
        .slice(0, 4);

    return (
        <SimpleCard className="lw-commandCenter__section" id="manager-home-operations">
            <SimpleContainer className="lw-commandCenter__sectionHeader">
                <TextBold18 color={colors.primary}>{t("managerHome.operations.title")}</TextBold18>
                <SimpleContainer
                    className="lw-commandCenter__link"
                    onPress={() => navigateOpenCases(navigate)}
                >
                    <Text12 color={colors.primary}>{t("managerHome.actions.viewAllCases")}</Text12>
                </SimpleContainer>
            </SimpleContainer>

            {isPerforming ? (
                <Skeleton width="100%" height={120} borderRadius={8} />
            ) : (
                <SimpleContainer className="lw-commandCenter__panelBody">
                    <TextBold14 color={colors.primary}>{t("managerHome.operations.byManager")}</TextBold14>
                    <SimpleContainer className="lw-commandCenter__workloadList">
                        {managerWorkload.length === 0 ? (
                            <Text14 color={colors.winter}>{t("managerHome.operations.noManagers")}</Text14>
                        ) : (
                            managerWorkload.map((m) => (
                                <WorkloadBar
                                    key={m.managerId ?? "unassigned"}
                                    label={m.unassigned ? t("managerHome.operations.unassignedLabel") : (m.managerName || "—")}
                                    value={m.activeCases}
                                    max={maxCases}
                                    sublabel={
                                        m.urgentCases > 0
                                            ? t("managerHome.operations.urgentShort", { count: m.urgentCases })
                                            : m.needsAttention > 0
                                                ? t("managerHome.operations.needsAttentionShort", { count: m.needsAttention })
                                                : null
                                    }
                                    onPress={() => navigateOpenCases(navigate)}
                                />
                            ))
                        )}
                    </SimpleContainer>

                    {unassignedCases?.count > 0 && (
                        <SimpleContainer
                            className="lw-commandCenter__unassignedBanner"
                            onPress={() => navigateOpenCases(navigate)}
                        >
                            <TextBold14 color={colors.negative}>
                                {t("managerHome.operations.unassignedBanner", { count: unassignedCases.count })}
                            </TextBold14>
                        </SimpleContainer>
                    )}

                    {topStages.length > 0 && (
                        <>
                            <TextBold14 color={colors.primary}>{t("managerHome.operations.byStage")}</TextBold14>
                            <SimpleContainer className="lw-commandCenter__stageGrid">
                                {topStages.map((s) => (
                                    <SimpleContainer
                                        key={`${s.case_type}-${s.stage}`}
                                        className="lw-commandCenter__stageChip"
                                        onPress={() => navigateOpenCases(navigate)}
                                    >
                                        <Text12 color={colors.winter} numberOfLines={1}>{s.case_type}</Text12>
                                        <TextBold14>
                                            {t("managerHome.operations.stageLabel", { stage: s.stage, count: s.case_count })}
                                        </TextBold14>
                                    </SimpleContainer>
                                ))}
                            </SimpleContainer>
                        </>
                    )}
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
