import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import signingFilesApi from "../../../../api/signingFilesApi";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import SecondaryButton from "../../../../components/styledComponents/buttons/SecondaryButton";
import { buttonSizes } from "../../../../styles/buttons/buttonSizes";
import { Text12, Text14, TextBold14, TextBold18 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import { toastError, toastSuccess } from "../../../../components/ui/toast";
import { colors } from "../../../../constant/colors";
import { usePopup } from "../../../../providers/PopUpProvider";
import { navigateSigningRow, resolveSigningQueueState, signalTypeClassName } from "./commandCenterUtils";
import { createDashboardModalHandlers } from "./dashboardModalUtils";
import { openCaseModal } from "./openCaseModal";
import { openSigningFileModal } from "./openSigningFileModal";

async function resendPendingSignersForFile(signingFileId) {
    const signersRes = await signingFilesApi.getSigningFileSigners(signingFileId);
    const signers = signersRes?.data?.signers || [];
    const pendingIds = signers
        .filter((s) => !s.AllSigned && s.SignerUserId)
        .map((s) => Number(s.SignerUserId))
        .filter((id) => Number.isFinite(id) && id > 0);

    if (pendingIds.length === 0) return 0;

    await signingFilesApi.resendSigningInvite(signingFileId, pendingIds);
    return pendingIds.length;
}

export default function SigningOperationsPanel({ signing, isPerforming, onDataChanged }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { openPopup, closePopup, pushPopup } = usePopup();
    const [isRemindingAll, setIsRemindingAll] = useState(false);
    const summary = signing?.summary || {};
    const queue = signing?.queue || [];

    const dashboardModals = useMemo(
        () => createDashboardModalHandlers({ openPopup, pushPopup, closePopup, onDataChanged, t }),
        [openPopup, pushPopup, closePopup, onDataChanged, t],
    );

    const pendingQueue = queue.filter((row) => {
        const state = resolveSigningQueueState(row);
        return state === "pending" || state === "expiring";
    });

    const stats = [
        { key: "pending", label: t("managerHome.signing.pending"), value: summary.pending ?? 0 },
        { key: "expiring", label: t("managerHome.signing.expiring"), value: summary.expiring ?? 0, warn: true },
        { key: "expired", label: t("managerHome.signing.expired"), value: summary.expired ?? 0, critical: true },
        { key: "rejected", label: t("managerHome.signing.rejected"), value: summary.rejected ?? 0 },
    ];

    const handleRowPress = useCallback(async (row) => {
        if (row?.signingFileId) {
            const opened = await openSigningFileModal({
                signingFileId: row.signingFileId,
                openPopup,
                closePopup,
                onChanged: onDataChanged,
            });
            if (opened) return;
        }
        if (row?.caseId) {
            const opened = await openCaseModal({
                caseId: row.caseId,
                openPopup,
                closePopup,
                onSaved: onDataChanged,
            });
            if (opened) return;
        }
        navigateSigningRow(navigate);
    }, [openPopup, closePopup, onDataChanged, navigate]);

    const handleRemindAll = useCallback(async () => {
        if (isRemindingAll || pendingQueue.length === 0) return;

        setIsRemindingAll(true);
        let remindedSigners = 0;
        let remindedFiles = 0;

        try {
            for (const row of pendingQueue) {
                if (!row?.signingFileId) continue;
                try {
                    const count = await resendPendingSignersForFile(row.signingFileId);
                    if (count > 0) {
                        remindedSigners += count;
                        remindedFiles += 1;
                    }
                } catch (err) {
                    console.warn("[signing] remind all failed for file", row.signingFileId, err);
                }
            }

            if (remindedSigners === 0) {
                toastError(t("managerHome.signing.remindAllEmpty"));
                return;
            }

            toastSuccess(t("managerHome.signing.remindAllSuccess", {
                files: remindedFiles,
                signers: remindedSigners,
            }));
            onDataChanged?.();
        } catch (err) {
            console.error("[signing] remind all failed", err);
            toastError(t("managerHome.signing.remindAllError"));
        } finally {
            setIsRemindingAll(false);
        }
    }, [isRemindingAll, pendingQueue, onDataChanged, t]);

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
                                onPress={() => dashboardModals.openSigningQueue(signing, s.key === "pending" ? "pending" : s.key)}
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
                                        onPress={() => handleRowPress(row)}
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

                    {pendingQueue.length > 0 && (
                        <SimpleContainer className="lw-commandCenter__signingRemindAll">
                            <SecondaryButton
                                size={buttonSizes.SMALL}
                                onPress={handleRemindAll}
                                disabled={isRemindingAll}
                            >
                                {isRemindingAll
                                    ? t("managerHome.signing.remindAllLoading")
                                    : t("managerHome.signing.remindAll")}
                            </SecondaryButton>
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            )}
        </SimpleCard>
    );
}
