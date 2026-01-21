// src/screens/signingScreen/SigningManagerScreen.js
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import signingFilesApi from "../../api/signingFilesApi";

import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";

import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";

import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import ProgressBar from "../../components/specializedComponents/containers/ProgressBar";

import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import { images } from "../../assets/images/images";
import ApiUtils from "../../api/apiUtils";
import { isDemoModeEnabled } from "../../utils/demoMode";
import { demoGetEvidencePackage, demoGetOrCreateUploadObjectUrl, demoGetSigningFile } from "../../demo/demoStore";
import { usePopup } from "../../providers/PopUpProvider";
import ErrorPopup from "../../components/styledComponents/popups/ErrorPopup";
import { useTranslation } from "react-i18next";
import { SIGNING_OTP_ENABLED } from "../../featureFlags";

import { AdminStackName } from "../../navigation/AdminStack";
import { uploadFileForSigningScreenName } from "./UploadFileForSigningScreen";
import "./SigningManagerScreen.scss";
import { MainScreenName } from "../mainScreen/MainScreen";
import SimpleCard from "../../components/simpleComponents/SimpleCard";

export const SigningManagerScreenName = "/SigningManagerScreen";

export default function SigningManagerScreen() {
    const { isSmallScreen } = useScreenSize();
    const navigate = useNavigate();
    const { openPopup, closePopup } = usePopup();
    const { t } = useTranslation();

    const [activeTab, setActiveTab] = useState("pending");
    const [searchQuery, setSearchQuery] = useState("");

    const { result: lawyerFilesData, isPerforming } = useAutoHttpRequest(
        signingFilesApi.getLawyerSigningFiles
    );

    const files = useMemo(() => lawyerFilesData?.files || [], [lawyerFilesData]);

    const filteredFiles = useMemo(() => {
        const query = (searchQuery || "").toLowerCase();
        let list = files.filter((f) =>
            activeTab === "pending"
                ? f.Status === "pending" || f.Status === "rejected"
                : f.Status === "signed"
        );
        if (!query) return list;

        return list.filter((f) => {
            const text = [f.FileName, f.CaseName, f.ClientName, f.RejectionReason]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return text.includes(query);
        });
    }, [files, activeTab, searchQuery]);

    const pendingCount = files.filter(
        (f) => f.Status === "pending" || f.Status === "rejected"
    ).length;
    const signedCount = files.filter((f) => f.Status === "signed").length;

    const formatDotDate = (dateLike) => {
        if (!dateLike) return "-";
        const d = new Date(dateLike);
        if (Number.isNaN(d.getTime())) return "-";
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = String(d.getFullYear());
        return `${dd}.${mm}.${yyyy}`;
    };

    const openPdfInNewTab = async (signingFileId) => {
        try {
            if (isDemoModeEnabled()) {
                const file = demoGetSigningFile(signingFileId);
                const url = file?.FileKey
                    ? demoGetOrCreateUploadObjectUrl(file.FileKey)
                    : (await signingFilesApi.downloadSignedFile(signingFileId))?.data?.downloadUrl;
                if (!url) throw new Error("missing demo pdf url");
                window.open(url, "_blank", "noopener,noreferrer");
                return;
            }

            const baseUrl = ApiUtils?.defaults?.baseURL || "";
            const token = localStorage.getItem("token");
            const url = `${baseUrl}/SigningFiles/${encodeURIComponent(signingFileId)}/pdf`;

            const res = await fetch(url, {
                method: "GET",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });

            if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            window.open(objectUrl, "_blank", "noopener,noreferrer");

            // Cleanup later (give the browser time to open the tab)
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        } catch (err) {
            console.error("Open PDF error:", err);
            openPopup(
                <ErrorPopup
                    closePopup={closePopup}
                    messageKey="signingManager.errors.openPdf"
                />
            );
        }
    };

    const getStatusChip = (status) => {
        const map = {
            pending: { text: t('signing.status.pending'), className: "lw-signingManagerScreen__chip lw-signingManagerScreen__chip--pending" },
            signed: { text: t('signing.status.signed'), className: "lw-signingManagerScreen__chip lw-signingManagerScreen__chip--signed" },
            rejected: { text: t('signing.status.rejected'), className: "lw-signingManagerScreen__chip lw-signingManagerScreen__chip--rejected" },
        };
        return map[status] || map.pending;
    };

    const showError = ({ messageKey, messageValues, message }) => {
        openPopup(
            <ErrorPopup
                closePopup={closePopup}
                messageKey={messageKey}
                messageValues={messageValues}
                errorText={message}
            />
        );
    };

    const parseFilenameFromContentDisposition = (headerValue) => {
        const v = String(headerValue || "");
        const m = v.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
        const raw = decodeURIComponent((m?.[1] || m?.[2] || "").trim());
        return raw ? raw.replace(/[\\/\r\n\t]/g, "_") : null;
    };

    const downloadBlobAsFile = (blob, filename) => {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename || "evidence.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    };

    const handleDownloadEvidenceZip = async (file) => {
        try {
            const signingFileId = file?.SigningFileId;
            if (!signingFileId) {
                showError({ messageKey: 'signingManager.errors.missingDocumentId' });
                return;
            }

            const isSigned = String(file?.Status || '').toLowerCase() === 'signed';
            if (!isSigned) {
                showError({ messageKey: 'signingManager.errors.evidencePackageSignedOnly' });
                return;
            }

            if (isDemoModeEnabled()) {
                const pkg = demoGetEvidencePackage(signingFileId);
                const blob = pkg?.evidenceZipBlob;
                if (!blob) {
                    showError({ messageKey: 'signingManager.errors.evidencePackageDownloadError' });
                    return;
                }
                const filename = `evidence_${file?.CaseId || "noCase"}_${signingFileId}.zip`;
                downloadBlobAsFile(blob, filename);
                return;
            }

            const baseUrl = ApiUtils?.defaults?.baseURL || "";
            const token = localStorage.getItem("token");
            const url = `${baseUrl}/SigningFiles/${encodeURIComponent(signingFileId)}/evidence-package`;

            const res = await fetch(url, {
                method: "GET",
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });

            if (!res.ok) {
                let payload = null;
                try {
                    payload = await res.json();
                } catch {
                    payload = null;
                }
                showError({ message: payload?.message, messageKey: payload?.message ? undefined : 'signingManager.errors.evidencePackageDownloadError' });
                return;
            }

            const disposition = res.headers.get("content-disposition");
            const filename = parseFilenameFromContentDisposition(disposition) || `evidence_${file?.CaseId || "noCase"}_${signingFileId}.zip`;
            const blob = await res.blob();
            downloadBlobAsFile(blob, filename);
        } catch (err) {
            console.error("Evidence ZIP download error:", err);
            showError({ messageKey: 'signingManager.errors.evidencePackageDownloadError' });
        }
    };

    const handleDownload = async (signingFileId, fileName) => {
        try {
            const response = await signingFilesApi.downloadSignedFile(signingFileId);
            const url = response?.data?.downloadUrl;
            if (!url) {
                showError({ messageKey: 'signingManager.errors.downloadSignedMissingUrl' });
                return;
            }
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName || "signed_file.pdf";
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            console.error("Download error:", err);
            // If backend sends a localized string, keep it as-is.
            showError({
                message: err?.data?.message,
                messageKey: err?.data?.message ? undefined : 'signingManager.errors.downloadSignedError'
            });
        }
    };

    const handleDownloadEvidencePdf = async (file) => {
        try {
            const signingFileId = file?.SigningFileId;
            if (!signingFileId) {
                showError({ messageKey: 'signingManager.errors.missingDocumentId' });
                return;
            }

            const isSigned = String(file?.Status || '').toLowerCase() === 'signed';
            if (!isSigned) {
                showError({ messageKey: 'signingManager.errors.evidencePackageSignedOnly' });
                return;
            }

            if (isDemoModeEnabled()) {
                const pkg = demoGetEvidencePackage(signingFileId);
                const blob = pkg?.evidencePdfBlob;
                if (!blob) {
                    showError({ messageKey: 'signingManager.errors.evidencePackageDownloadError' });
                    return;
                }
                const filename = `evidence_${file?.CaseId || "noCase"}_${signingFileId}.pdf`;
                downloadBlobAsFile(blob, filename);
                return;
            }

            const baseUrl = ApiUtils?.defaults?.baseURL || "";
            const token = localStorage.getItem("token");
            const url = `${baseUrl}/SigningFiles/${encodeURIComponent(signingFileId)}/evidence-certificate`;

            const res = await fetch(url, {
                method: "GET",
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });

            if (!res.ok) {
                let payload = null;
                try {
                    payload = await res.json();
                } catch {
                    payload = null;
                }
                showError({ message: payload?.message, messageKey: payload?.message ? undefined : 'signingManager.errors.evidencePackageDownloadError' });
                return;
            }

            const disposition = res.headers.get("content-disposition");
            const filename = parseFilenameFromContentDisposition(disposition) || `evidence_${file?.CaseId || "noCase"}_${signingFileId}.pdf`;
            const blob = await res.blob();
            downloadBlobAsFile(blob, filename);
        } catch (err) {
            console.error("Evidence PDF download error:", err);
            showError({ messageKey: 'signingManager.errors.evidencePackageDownloadError' });
        }
    };

    const handleSearch = (qOrEvent) => {
        const next =
            typeof qOrEvent === "string"
                ? qOrEvent
                : qOrEvent?.target?.value;
        setSearchQuery((next ?? "").toString());
    };
    const handleGoToUpload = () =>
        navigate(AdminStackName + uploadFileForSigningScreenName);

    const handleOpenDetails = (file) => {
        if (!file) return;
        openPopup(
            <SigningManagerFileDetails
                file={file}
                onClose={closePopup}
                onOpenPdf={() => openPdfInNewTab(file.SigningFileId)}
                onDownloadSigned={() => handleDownload(file.SigningFileId, file.FileName)}
                onDownloadEvidencePdf={() => handleDownloadEvidencePdf(file)}
                onDownloadEvidenceZip={() => handleDownloadEvidenceZip(file)}
                formatDotDate={formatDotDate}
            />
        );
    };

    if (isPerforming) return <SimpleLoader />;


    return (
        <SimpleScreen
            imageBackgroundSource={images.Backgrounds.AppBackground}
        >
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={AdminStackName + MainScreenName}
                    GetNavBarData={getNavBarData}
                    chosenIndex={1}
                />
            )}

            <SimpleScrollView className="lw-signingManagerScreen__scroll">

                <SimpleContainer className="lw-signingManagerScreen__topRow">
                    <SimpleContainer className="lw-signingManagerScreen__searchContainer">
                        <SearchInput
                            onSearch={handleSearch}
                            value={searchQuery}
                            title={t('signingManager.searchTitle')}
                            titleFontSize={18}
                        />
                    </SimpleContainer>
                </SimpleContainer>

                {/* Tabs */}
                <SimpleContainer className="lw-signingManagerScreen__tabsRow">
                    <TabButton
                        active={activeTab === "pending"}
                        label={t('signingManager.tabs.pending', { count: pendingCount })}
                        onPress={() => setActiveTab("pending")}
                    />
                    <TabButton
                        active={activeTab === "signed"}
                        label={t('signingManager.tabs.signed', { count: signedCount })}
                        onPress={() => setActiveTab("signed")}
                    />
                </SimpleContainer>

                {/* List */}
                {filteredFiles.length === 0 ? (
                    <SimpleContainer className="lw-signingManagerScreen__emptyState">
                        <Text14>
                            {activeTab === "pending"
                                ? t('signingManager.empty.pending')
                                : t('signingManager.empty.signed')}
                        </Text14>
                    </SimpleContainer>
                ) : (
                    filteredFiles.map((file) => {
                        const chip = getStatusChip(file.Status);
                        const isFullySigned = file.TotalSpots > 0 && file.SignedSpots === file.TotalSpots;
                        const totalSpots = Number(file.TotalSpots || 0);
                        const signedSpots = Number(file.SignedSpots || 0);
                        const cardClassName = `lw-signingManagerScreen__fileCard${isFullySigned ? " is-fullySigned" : ""}`;

                        return (
                            <SimpleCard
                                key={file.SigningFileId}
                                className={cardClassName}
                            >
                                <SimpleContainer className="lw-signingManagerScreen__fileHeaderRow">
                                    <h3 className="lw-signingManagerScreen__fileName">
                                        {file.FileName}
                                    </h3>
                                    <SimpleContainer className={chip.className}>{chip.text}</SimpleContainer>
                                </SimpleContainer>

                                <SimpleContainer className="lw-signingManagerScreen__detailRow">
                                    <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.case')}</div>
                                    <div className="lw-signingManagerScreen__detailValue">{file.CaseName || "-"}</div>
                                </SimpleContainer>
                                <SimpleContainer className="lw-signingManagerScreen__detailRow">
                                    <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.client')}</div>
                                    <div className="lw-signingManagerScreen__detailValue">{file.ClientName || "-"}</div>
                                </SimpleContainer>
                                <SimpleContainer className="lw-signingManagerScreen__detailRow">
                                    <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.uploadedAt')}</div>
                                    <div className="lw-signingManagerScreen__detailValue">{formatDotDate(file.CreatedAt)}</div>
                                </SimpleContainer>

                                {(file.Status === "pending" ||
                                    file.Status === "rejected") && (
                                        <>
                                            <SimpleContainer className="lw-signingManagerScreen__detailRow">
                                                <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.signatures')}</div>
                                                <div className="lw-signingManagerScreen__detailValue">{signedSpots}/{totalSpots}</div>
                                            </SimpleContainer>

                                            <ProgressBar
                                                IsClosed
                                                currentStage={signedSpots}
                                                totalStages={totalSpots}
                                                labelKey="signing.progress.label"
                                            />

                                            {file.Status === "rejected" &&
                                                file.RejectionReason && (
                                                    <SimpleContainer className="lw-signingManagerScreen__detailRow">
                                                        <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.rejectionReason')}</div>
                                                        <div className="lw-signingManagerScreen__detailValue">{file.RejectionReason}</div>
                                                    </SimpleContainer>
                                                )}
                                        </>
                                    )}

                                {file.Status === "signed" && (
                                    <SimpleContainer className="lw-signingManagerScreen__detailRow">
                                        <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.signedAt')}</div>
                                        <div className="lw-signingManagerScreen__detailValue">{formatDotDate(file.SignedAt)}</div>
                                    </SimpleContainer>
                                )}

                                <SimpleContainer className="lw-signingManagerScreen__actionsRow">
                                    {file.Status === "signed" && (
                                        <PrimaryButton
                                            onPress={() =>
                                                handleDownload(file.SigningFileId, file.FileName)
                                            }
                                        >
                                            {t('signingManager.actions.downloadSigned')}
                                        </PrimaryButton>
                                    )}
                                    <SecondaryButton
                                        onPress={() => handleOpenDetails(file)}
                                    >
                                        {t('signingManager.actions.details')}
                                    </SecondaryButton>
                                </SimpleContainer>
                            </SimpleCard>
                        );
                    })
                )}
            </SimpleScrollView>

            <SimpleContainer className="lw-signingManagerScreen__footer">
                <PrimaryButton
                    className="lw-signingManagerScreen__addButton"
                    onPress={handleGoToUpload}
                >
                    {t('signingManager.actions.uploadNew')}
                </PrimaryButton>
            </SimpleContainer>
        </SimpleScreen>
    );
}

function SigningManagerFileDetails({ file, onClose, onOpenPdf, onDownloadSigned, onDownloadEvidencePdf, onDownloadEvidenceZip, formatDotDate }) {
    const { t } = useTranslation();
    const totalSpots = Number(file?.TotalSpots || 0);
    const signedSpots = Number(file?.SignedSpots || 0);
    const isSigned = String(file?.Status || '').toLowerCase() === 'signed';

    const showOtpUi = SIGNING_OTP_ENABLED;
    const requireOtp = showOtpUi && Boolean(file?.RequireOtp);
    const isOtpWaived = showOtpUi && file?.RequireOtp === false;
    const otpChipText = requireOtp ? t('signing.otpRequiredBadge') : t('signing.otpWaivedBadge');
    const otpChipClassName = requireOtp
        ? "lw-signingManagerScreen__chip lw-signingManagerScreen__chip--signed"
        : "lw-signingManagerScreen__chip lw-signingManagerScreen__chip--pending";

    const formatUtcDateTime = (dateLike) => {
        if (!dateLike) return "-";
        const d = new Date(dateLike);
        if (Number.isNaN(d.getTime())) return "-";
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = String(d.getFullYear());
        const hh = String(d.getHours()).padStart(2, "0");
        const min = String(d.getMinutes()).padStart(2, "0");
        return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
    };

    const statusText =
        file?.Status === "signed"
            ? t('signing.status.signed')
            : file?.Status === "rejected"
                ? t('signing.status.rejected')
                : t('signing.status.pending');

    return (
        <SimpleContainer className="lw-signingManagerScreen__detailsPopup">
            <TextBold24>{file?.FileName || t('signingManager.details.titleFallback')}</TextBold24>

            {showOtpUi && (
                <SimpleContainer className={otpChipClassName}>{otpChipText}</SimpleContainer>
            )}

            <>
                <SimpleContainer className="lw-signingManagerScreen__detailRow">
                    <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.case')}</div>
                    <div className="lw-signingManagerScreen__detailValue">{file?.CaseName || "-"}</div>
                </SimpleContainer>

                <SimpleContainer className="lw-signingManagerScreen__detailRow">
                    <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.client')}</div>
                    <div className="lw-signingManagerScreen__detailValue">{file?.ClientName || "-"}</div>
                </SimpleContainer>

                <SimpleContainer className="lw-signingManagerScreen__detailRow">
                    <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.uploadedAt')}</div>
                    <div className="lw-signingManagerScreen__detailValue">{formatDotDate?.(file?.CreatedAt)}</div>
                </SimpleContainer>

                <SimpleContainer className="lw-signingManagerScreen__detailRow">
                    <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.status')}</div>
                    <div className="lw-signingManagerScreen__detailValue">{statusText}</div>
                </SimpleContainer>

                <SimpleContainer className="lw-signingManagerScreen__detailRow">
                    <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.signatures')}</div>
                    <div className="lw-signingManagerScreen__detailValue">{signedSpots}/{totalSpots}</div>
                </SimpleContainer>

                {file?.Status === "rejected" && file?.RejectionReason && (
                    <SimpleContainer className="lw-signingManagerScreen__detailRow">
                        <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.rejectionReason')}</div>
                        <div className="lw-signingManagerScreen__detailValue">{file.RejectionReason}</div>
                    </SimpleContainer>
                )}

                {file?.Status === "signed" && (
                    <SimpleContainer className="lw-signingManagerScreen__detailRow">
                        <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.signedAt')}</div>
                        <div className="lw-signingManagerScreen__detailValue">{formatDotDate?.(file?.SignedAt)}</div>
                    </SimpleContainer>
                )}
                {showOtpUi && isOtpWaived && (
                    <>
                        <SimpleContainer className="lw-signingManagerScreen__detailRow">
                            <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.otpWaiverBy')}</div>
                            <div className="lw-signingManagerScreen__detailValue">{file?.PolicySelectedByUserId ?? "-"}</div>
                        </SimpleContainer>
                        <SimpleContainer className="lw-signingManagerScreen__detailRow">
                            <div className="lw-signingManagerScreen__detailLabel">{t('signingManager.labels.otpWaiverAt')}</div>
                            <div className="lw-signingManagerScreen__detailValue">{formatUtcDateTime(file?.PolicySelectedAtUtc)}</div>
                        </SimpleContainer>
                    </>
                )}

                <SimpleContainer className="lw-signingManagerScreen__actionsRow">
                    <SecondaryButton onPress={onOpenPdf}>{t('signingManager.actions.openPdf')}</SecondaryButton>
                    {file?.Status === "signed" && (
                        <PrimaryButton onPress={onDownloadSigned}>{t('signingManager.actions.downloadSigned')}</PrimaryButton>
                    )}
                    <PrimaryButton onPress={onDownloadEvidencePdf} disabled={!isSigned}>
                        {t('signingManager.actions.downloadEvidencePdf')}
                    </PrimaryButton>
                    <SecondaryButton onPress={onDownloadEvidenceZip} disabled={!isSigned}>
                        {t('signingManager.actions.downloadEvidenceZip')}
                    </SecondaryButton>
                    <SecondaryButton onPress={onClose}>{t('common.close')}</SecondaryButton>
                </SimpleContainer>
            </>
        </SimpleContainer>
    );
}

const TabButton = ({ active, label, onPress }) => {
    return active ? (
        <PrimaryButton onPress={onPress}>{label}</PrimaryButton>
    ) : (
        <SecondaryButton onPress={onPress}>{label}</SecondaryButton>
    );
};
