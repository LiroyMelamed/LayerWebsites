import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileSignature, FileText, CircleCheck, Clock3, Hourglass, CircleX, Ban } from "lucide-react";
import signingFilesApi from "../../../../api/signingFilesApi";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import SecondaryButton from "../../../../components/styledComponents/buttons/SecondaryButton";
import { buttonSizes } from "../../../../styles/buttons/buttonSizes";
import { Text12, TextBold14 } from "../../../../components/specializedComponents/text/AllTextKindFile";
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
        { key: "pending", label: t("managerHome.signing.pending"), value: summary.pending ?? 0, icon: Clock3 },
        { key: "expiring", label: t("managerHome.signing.expiring"), value: summary.expiring ?? 0, warn: true, icon: Hourglass },
        { key: "expired", label: t("managerHome.signing.expired"), value: summary.expired ?? 0, critical: true, icon: CircleX },
        { key: "rejected", label: t("managerHome.signing.rejected"), value: summary.rejected ?? 0, icon: Ban },
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
        <SimpleCard className="lw-commandCenter__section lw-businessHome__operations" id="manager-home-signing">
            <SimpleContainer className="lw-commandCenter__sectionHeader">
                <div className="lw-businessHome__sectionTitle">
                    <span className="lw-businessHome__icon"><FileSignature size={20} aria-hidden="true" /></span>
                    <div><h2>{t("managerHome.signing.title")}</h2><p>{t("managerHome.business.signingSubtitle")}</p></div>
                </div>
                <button
                    type="button"
                    className="lw-businessHome__sectionLink"
                    onClick={() => navigateSigningRow(navigate)}
                >
                    {t("managerHome.actions.viewAll")}<ArrowLeft size={15} aria-hidden="true" />
                </button>
            </SimpleContainer>

            {isPerforming ? (
                <Skeleton width="100%" height={120} borderRadius={8} />
            ) : (
                <SimpleContainer className="lw-commandCenter__panelBody">
                    <SimpleContainer className="lw-commandCenter__signingStats">
                        {stats.map((s) => (
                            <button
                                type="button"
                                key={s.key}
                                className={`lw-commandCenter__signingStat ${signalTypeClassName(`signing_${s.key}`)}`}
                                onClick={() => dashboardModals.openSigningQueue(signing, s.key === "pending" ? "pending" : s.key)}
                            >
                                <s.icon size={17} aria-hidden="true" />
                                <strong className="lw-businessHome__signingCount" style={{ color:
                                    s.critical && s.value > 0
                                        ? colors.negative
                                        : s.warn && s.value > 0
                                            ? "#B7791F"
                                            : colors.primary
                                }}>
                                    {s.value}
                                </strong>
                                <Text12 color={colors.winter}>{s.label}</Text12>
                            </button>
                        ))}
                    </SimpleContainer>

                    {queue.length === 0 ? (
                        <div className="lw-businessHome__signingEmpty"><CircleCheck size={28} aria-hidden="true" /><p>{t("managerHome.signing.empty")}</p></div>
                    ) : (
                        <SimpleContainer className="lw-commandCenter__signingQueue">
                            {queue.slice(0, 5).map((row) => {
                                const queueState = resolveSigningQueueState(row);
                                return (
                                    <button
                                        type="button"
                                        key={row.signingFileId}
                                        className={`lw-commandCenter__signingRow ${signalTypeClassName(`signing_${queueState}`)}`}
                                        onClick={() => handleRowPress(row)}
                                    >
                                        <span className="lw-businessHome__fileIcon"><FileText size={21} aria-hidden="true" /></span>
                                        <div className="lw-businessHome__signingDetails">
                                        <SimpleContainer className="lw-commandCenter__signingRowTop">
                                            <TextBold14 numberOfLines={1} className="lw-commandCenter__signingFilename">
                                                {row.filename}
                                            </TextBold14>
                                        </SimpleContainer>
                                        <Text12 color={colors.winter} numberOfLines={1}>
                                            {[row.caseName, row.clientName].filter(Boolean).join(" · ")}
                                        </Text12>
                                        <span className={`lw-commandCenter__statusPill ${signalTypeClassName(`signing_${queueState}`)}`}>
                                            {t(`managerHome.signing.queueStatus.${queueState}`)}
                                        </span>
                                        </div>
                                        <ArrowLeft size={16} className="lw-businessHome__rowArrow" aria-hidden="true" />
                                    </button>
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
