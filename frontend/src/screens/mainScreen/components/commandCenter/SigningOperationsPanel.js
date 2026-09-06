import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { Text12, Text14, TextBold14, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { colors } from "../../../../constant/colors";
import { navigateCaseRow, navigateOpenCases, navigateSigningRow, resolveSigningQueueState, signalTypeClassName } from "./commandCenterUtils";

export default function SigningOperationsPanel({ signing, isPerforming }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const summary = signing?.summary || {};
    const queue = signing?.queue || [];

    const stats = [
        { key: "pending", label: t("managerHome.signing.pending"), value: summary.pending ?? 0 },
        { key: "expiring", label: t("managerHome.signing.expiring"), value: summary.expiring ?? 0, warn: true },
        { key: "expired", label: t("managerHome.signing.expired"), value: summary.expired ?? 0, critical: true },
        { key: "rejected", label: t("managerHome.signing.rejected"), value: summary.rejected ?? 0 },
    ];

    return (
        <SimpleCard className="lw-commandCenter__section" id="manager-home-signing">
            <SimpleContainer className="lw-commandCenter__sectionHeader">
                <TextBold18 color={colors.primary}>{t("managerHome.signing.title")}</TextBold18>
                <SimpleContainer
                    className="lw-commandCenter__link"
                    onPress={() => navigateSigningRow(navigate)}
                >
                    <Text12 color={colors.primary}>{t("managerHome.actions.viewAll")}</Text12>
                </SimpleContainer>
            </SimpleContainer>

            {isPerforming ? (
                <Skeleton width="100%" height={120} borderRadius={8} />
            ) : (
                <SimpleContainer className="lw-commandCenter__panelBody">
                    <SimpleContainer className="lw-commandCenter__signingStats">
                        {stats.map((s) => (
                            <SimpleContainer
                                key={s.key}
                                className={`lw-commandCenter__signingStat ${signalTypeClassName(`signing_${s.key}`)}`}
                                onPress={() => navigateSigningRow(navigate)}
                            >
                                <TextBold14 color={
                                    s.critical && s.value > 0
                                        ? colors.negative
                                        : s.warn && s.value > 0
                                            ? "#B7791F"
                                            : colors.primary
                                }>
                                    {s.value}
                                </TextBold14>
                                <Text12 color={colors.winter}>{s.label}</Text12>
                            </SimpleContainer>
                        ))}
                    </SimpleContainer>

                    {queue.length === 0 ? (
                        <Text14 color={colors.winter}>{t("managerHome.signing.empty")}</Text14>
                    ) : (
                        <SimpleContainer className="lw-commandCenter__signingQueue">
                            {queue.slice(0, 5).map((row) => {
                                const queueState = resolveSigningQueueState(row);
                                return (
                                    <SimpleContainer
                                        key={row.signingFileId}
                                        className={`lw-commandCenter__signingRow ${signalTypeClassName(`signing_${queueState}`)}`}
                                        onPress={() => {
                                            if (row.caseId) {
                                                navigateCaseRow(navigate, row.caseId);
                                            } else {
                                                navigateSigningRow(navigate);
                                            }
                                        }}
                                    >
                                        <SimpleContainer className="lw-commandCenter__signingRowTop">
                                            <SimpleContainer className={`lw-commandCenter__statusPill ${signalTypeClassName(`signing_${queueState}`)}`}>
                                                <Text12>
                                                    {t(`managerHome.signing.queueStatus.${queueState}`)}
                                                </Text12>
                                            </SimpleContainer>
                                            <TextBold14 numberOfLines={1} className="lw-commandCenter__signingFilename">
                                                {row.filename}
                                            </TextBold14>
                                        </SimpleContainer>
                                        <Text12 color={colors.winter} numberOfLines={1}>
                                            {[row.caseName, row.clientName].filter(Boolean).join(" · ")}
                                        </Text12>
                                    </SimpleContainer>
                                );
                            })}
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
