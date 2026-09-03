// src/screens/signingScreen/SigningManagerScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";
import signingFilesApi from "../../api/signingFilesApi";
import { customersApi } from "../../api/customersApi";

import Skeleton from "../../components/simpleComponents/Skeleton";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";

import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";

import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import { buttonSizes } from "../../styles/buttons/buttonSizes";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import SimpleInput from "../../components/simpleComponents/SimpleInput";
import SegmentedSwitch from "../../components/styledComponents/SegmentedSwitch";

import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import { images } from "../../assets/images/images";
import ApiUtils from "../../api/apiUtils";
import { usePopup } from "../../providers/PopUpProvider";
import { toastError, toastSuccess } from "../../components/ui/toast";
import { useTranslation } from "react-i18next";
import { useFromApp } from "../../providers/FromAppProvider";
import { useSigningOtpEnabled } from "../../services/firmSettings";

import { AdminStackName } from "../../navigation/AdminStack";
import { uploadFileForSigningScreenName } from "./UploadFileForSigningScreen";
import "./SigningManagerScreen.scss";
import { MainScreenName } from "../mainScreen/MainScreen";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import { parseDateInput } from "../../functions/date/formatDateForInput";
import { InviteIconButton, ResendIcon } from "../calendarScreen/components/CalendarInviteActionIcons";
import {
    clampSignerDeliveryMethod,
    getAllowedSignerDeliveryMethods,
} from "./signerDeliveryUtils";
import "../calendarScreen/CalendarInviteScreen.scss";


export const SigningManagerScreenName = "/SigningManagerScreen";

export default function SigningManagerScreen() {
    const { isSmallScreen } = useScreenSize();
    const navigate = useNavigate();
    const { openPopup, closePopup } = usePopup();
    const { t } = useTranslation();

    const { isFromApp } = useFromApp();
    const [activeTab, setActiveTab] = useState("pending");
    const [scope, setScope] = useState("mine");
    const [searchQuery, setSearchQuery] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const [isDownloadingSigned, setIsDownloadingSigned] = useState(false);

    const { result: lawyerFilesData, isPerforming, performRequest: reloadFilesRaw } = useAutoHttpRequest(
        signingFilesApi.getLawyerSigningFiles
    );

    const reloadFiles = React.useCallback(() => reloadFilesRaw(scope), [reloadFilesRaw, scope]);

    useEffect(() => {
        reloadFilesRaw(scope);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope]);

    const files = useMemo(() => lawyerFilesData?.files || [], [lawyerFilesData]);

    const filteredFiles = useMemo(() => {
        const query = (searchQuery || "").toLowerCase();
        let list = files.filter((f) =>
            activeTab === "pending"
                ? f.Status === "pending" || f.Status === "rejected"
                : f.Status === "signed"
        );

        if (query) {
            list = list.filter((f) => {
                const text = [f.FileName, f.CaseName, f.ClientName, f.RejectionReason]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                return text.includes(query);
            });
        }

        if (dateFrom) {
            const parsed = parseDateInput(dateFrom) || dateFrom;
            const from = new Date(parsed);
            from.setHours(0, 0, 0, 0);
            list = list.filter((f) => {
                const d = new Date(f.CreatedAt);
                return !Number.isNaN(d.getTime()) && d >= from;
            });
        }

        if (dateTo) {
            const parsed = parseDateInput(dateTo) || dateTo;
            const to = new Date(parsed);
            to.setHours(23, 59, 59, 999);
            list = list.filter((f) => {
                const d = new Date(f.CreatedAt);
                return !Number.isNaN(d.getTime()) && d <= to;
            });
        }

        return list;
    }, [files, activeTab, searchQuery, dateFrom, dateTo]);

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
            toastError(t("signingManager.errors.openPdf"));
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
        const text = message
            || (messageKey ? t(messageKey, messageValues || {}) : null)
            || t('errors.unexpected');
        toastError(String(text));
    };

    const parseFilenameFromContentDisposition = (headerValue) => {
        const v = String(headerValue || "");
        const m = v.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
        const raw = decodeURIComponent((m?.[1] || m?.[2] || "").trim());
        return raw ? raw.replace(/[\\/\r\n\t]/g, "_") : null;
    };

    const downloadBlobAsFile = (blob, filename) => {
        const safeName = filename || "evidence.zip";

        // Inside mobile app WebView: convert blob to base64 and send via
        // native bridge so expo-file-system can write it to disk.
        if (isFromApp && window.ReactNativeWebView) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result?.split(',')[1];
                if (base64) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: "DOWNLOAD_BASE64",
                        payload: { base64, fileName: safeName, mimeType: blob.type || 'application/octet-stream' }
                    }));
                }
            };
            reader.readAsDataURL(blob);
            return;
        }

        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = safeName;
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
        setIsDownloadingSigned(true);
        try {
            const response = await signingFilesApi.downloadSignedFile(signingFileId);
            const url = response?.data?.downloadUrl;
            if (!url) {
                showError({ messageKey: 'signingManager.errors.downloadSignedMissingUrl' });
                return;
            }

            const safeName = fileName || "signed_file.pdf";

            if (isFromApp && window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: "DOWNLOAD_FILE",
                    payload: { url, fileName: safeName }
                }));
            } else {
                const a = document.createElement("a");
                a.href = url;
                a.download = safeName;
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
        } catch (err) {
            console.error("Download error:", err);
            // If backend sends a localized string, keep it as-is.
            showError({
                message: err?.data?.message,
                messageKey: err?.data?.message ? undefined : 'signingManager.errors.downloadSignedError'
            });
        } finally {
            setIsDownloadingSigned(false);
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

    const { isPerforming: isDeletingFile, performRequest: deleteSigningFile } = useHttpRequest(
        signingFilesApi.deleteSigningFile,
        () => { closePopup(); reloadFiles(); },
        () => { showError({ messageKey: 'signingManager.errors.deleteError' }); }
    );

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
                onDelete={(id) => deleteSigningFile(id)}
                isDeleting={isDeletingFile}
                formatDotDate={formatDotDate}
                onRenamed={() => { closePopup(); reloadFiles?.(); }}
            />
        );
    };

    return (
        <SimpleScreen
            imageBackgroundSource={images.Backgrounds.AppBackground}
        >
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={AdminStackName + MainScreenName}
                    GetNavBarData={getNavBarData}
                    chosenNavKey="signingFiles"
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
                    <SimpleContainer className="lw-signingManagerScreen__dateFilters">
                        <SimpleInput
                            type="date"
                            title={t('signingManager.dateFrom')}
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="lw-signingManagerScreen__dateInput"
                        />
                        <SimpleInput
                            type="date"
                            title={t('signingManager.dateTo')}
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="lw-signingManagerScreen__dateInput"
                        />
                    </SimpleContainer>
                    <SegmentedSwitch
                        className="lw-signingManagerScreen__scopeSwitch"
                        ariaLabel={t('signingManager.scope.title', 'תצוגה')}
                        value={scope}
                        onChange={setScope}
                        options={[
                            { value: "mine", label: t('signingManager.scope.mine', 'המסמכים שלי') },
                            { value: "office", label: t('signingManager.scope.office', 'מסמכי המשרד') },
                        ]}
                    />
                </SimpleContainer>

                {/* Status tabs */}
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
                {isPerforming ? (
                    <SimpleCard>
                        {[1, 2, 3].map(i => (
                            <SimpleContainer key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0' }}>
                                <Skeleton width="40%" height={14} />
                                <Skeleton width="20%" height={14} />
                            </SimpleContainer>
                        ))}
                    </SimpleCard>
                ) : filteredFiles.length === 0 ? (
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
                        const rowClassName = `lw-signingManagerScreen__fileRow${isFullySigned ? " is-fullySigned" : ""}`;

                        return (
                            <button
                                type="button"
                                key={file.SigningFileId}
                                className={rowClassName}
                                onClick={() => handleOpenDetails(file)}
                            >
                                <span className="lw-signingManagerScreen__fileRowName">{file.FileName}</span>
                                <span className="lw-signingManagerScreen__fileRowMeta">
                                    {file.ClientName || file.CaseName || ""}
                                </span>
                                <span className={chip.className}>{chip.text}</span>
                                <span className="lw-signingManagerScreen__fileRowDate">
                                    {formatDotDate(file.Status === "signed" ? file.SignedAt : file.CreatedAt)}
                                </span>
                            </button>
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

function SigningManagerFileDetails({ file, onClose, onOpenPdf, onDownloadSigned, onDownloadEvidencePdf, onDownloadEvidenceZip, onDelete, isDeleting, formatDotDate, onRenamed }) {
    const { t } = useTranslation();
    const totalSpots = Number(file?.TotalSpots || 0);
    const signedSpots = Number(file?.SignedSpots || 0);
    const isSigned = String(file?.Status || '').toLowerCase() === 'signed';
    const isPending = String(file?.Status || '').toLowerCase() === 'pending';
    const hasPartialSignatures = signedSpots > 0 && !isSigned;

    const [isEditingName, setIsEditingName] = useState(false);
    const [editName, setEditName] = useState(file?.FileName || '');
    const [isSavingName, setIsSavingName] = useState(false);

    // Local loading states so the popup re-renders on its own
    const [isDownloadingSigned, setIsDownloadingSigned] = useState(false);
    const [isDownloadingEvidencePdf, setIsDownloadingEvidencePdf] = useState(false);
    const [isDownloadingEvidenceZip, setIsDownloadingEvidenceZip] = useState(false);
    const [isOpeningPdf, setIsOpeningPdf] = useState(false);
    const [isOpeningSpotsPreview, setIsOpeningSpotsPreview] = useState(false);
    const [spotsPreviewError, setSpotsPreviewError] = useState(null);

    const wrappedDownloadSigned = async () => {
        setIsDownloadingSigned(true);
        try { await onDownloadSigned(); } finally { setIsDownloadingSigned(false); }
    };
    const wrappedDownloadEvidencePdf = async () => {
        setIsDownloadingEvidencePdf(true);
        try { await onDownloadEvidencePdf(); } finally { setIsDownloadingEvidencePdf(false); }
    };
    const wrappedDownloadEvidenceZip = async () => {
        setIsDownloadingEvidenceZip(true);
        try { await onDownloadEvidenceZip(); } finally { setIsDownloadingEvidenceZip(false); }
    };
    const wrappedOpenPdf = async () => {
        setIsOpeningPdf(true);
        try { await onOpenPdf(); } finally { setIsOpeningPdf(false); }
    };

    const openSpotsPreview = () => {
        const signingFileId = file?.SigningFileId;
        if (!signingFileId) return;
        setSpotsPreviewError(null);
        setIsOpeningSpotsPreview(true);
        try {
            const path = `${AdminStackName}/SigningSpotsPreview/${encodeURIComponent(signingFileId)}`;
            const url = `${window.location.origin}${path}`;
            const opened = window.open(url, "_blank", "noopener,noreferrer");
            if (!opened) {
                // Popup blocked — navigate in the same tab.
                window.location.assign(path);
            }
        } catch (err) {
            console.error("Spots preview open failed", err);
            setSpotsPreviewError(t('signingManager.spotsPreview.error'));
        } finally {
            setIsOpeningSpotsPreview(false);
        }
    };

    // Resend state
    const [signers, setSigners] = useState([]);
    const [loadingSigners, setLoadingSigners] = useState(false);
    const { result: customersByName, isPerforming: isPerformingCustomersByName, performRequest: searchCustomersByName } = useHttpRequest(
        (userName) => customersApi.getCustomersByName(userName, { includeStaff: true }),
        null,
        () => { }
    );

    const [editingSigner, setEditingSigner] = useState(null);
    const [editSignerUserId, setEditSignerUserId] = useState(null);
    const [editSignerSearchQuery, setEditSignerSearchQuery] = useState("");
    const [editSignerEmail, setEditSignerEmail] = useState("");
    const [editSignerPhone, setEditSignerPhone] = useState("");
    const [editSignerDelivery, setEditSignerDelivery] = useState("phone");
    const [isSavingSigner, setIsSavingSigner] = useState(false);

    const loadSigners = async () => {
        setLoadingSigners(true);
        try {
            const res = await signingFilesApi.getSigningFileSigners(file.SigningFileId);
            const list = res?.data?.signers || [];
            setSigners(list);
        } catch (e) {
            console.error('Failed to load signers', e);
        } finally {
            setLoadingSigners(false);
        }
    };

    const openEditSigner = (signer) => {
        if (!signer || signer.AllSigned) return;
        const email = String(signer.Email || "").trim();
        const phone = String(signer.Phone || "").trim();
        setEditingSigner(signer);
        setEditSignerUserId(Number(signer.SignerUserId) || null);
        setEditSignerSearchQuery(String(signer.Name || "").trim());
        setEditSignerEmail(email);
        setEditSignerPhone(phone);
        setEditSignerDelivery(
            clampSignerDeliveryMethod(
                { email, phone },
                String(signer.DeliveryMethod || "phone").toLowerCase()
            )
        );
    };

    const handleSearchReplaceSignerClient = (query) => {
        setEditSignerSearchQuery(query);
        searchCustomersByName(query);
    };

    const handleSelectReplaceSignerClient = (_text, customer) => {
        if (!customer) return;
        const userId = Number(customer?.UserId ?? customer?.userid);
        if (!Number.isFinite(userId) || userId <= 0) return;
        const email = String(customer?.Email || customer?.email || "").trim();
        const phone = String(customer?.PhoneNumber || customer?.Phone || customer?.phonenumber || "").trim();
        setEditSignerUserId(userId);
        setEditSignerSearchQuery(String(customer?.Name || "").trim());
        setEditSignerEmail(email);
        setEditSignerPhone(phone);
        setEditSignerDelivery((prev) => clampSignerDeliveryMethod({ email, phone }, prev));
    };

    const allowedEditSignerDelivery = useMemo(
        () => getAllowedSignerDeliveryMethods({ email: editSignerEmail, phone: editSignerPhone }),
        [editSignerEmail, editSignerPhone]
    );

    const deliveryLockedHint = t('signing.upload.deliveryLockedHint', {
        defaultValue: 'ערוץ השליחה נקבע לפי פרטי הקשר הזמינים',
    });

    const editSignerDeliveryOptions = useMemo(() => {
        const labelFor = (value) => {
            if (value === 'email') return t('signingManager.replaceSigner.deliveryEmail');
            if (value === 'both') return t('signingManager.replaceSigner.deliveryBoth');
            return t('signingManager.replaceSigner.deliveryPhone');
        };
        const allowed = new Set(allowedEditSignerDelivery);
        return ['phone', 'email', 'both'].map((value) => ({
            value,
            label: labelFor(value),
            disabled: !allowed.has(value),
            disabledTitle: !allowed.has(value) ? deliveryLockedHint : undefined,
        }));
    }, [allowedEditSignerDelivery, deliveryLockedHint, t]);

    useEffect(() => {
        if (!editingSigner) return;
        setEditSignerDelivery((prev) =>
            clampSignerDeliveryMethod({ email: editSignerEmail, phone: editSignerPhone }, prev)
        );
    }, [editSignerEmail, editSignerPhone, editingSigner]);

    const handleSaveSignerContact = async ({ resendAfterSave = false } = {}) => {
        if (!editingSigner?.SignerUserId || !editSignerUserId) return;
        setIsSavingSigner(true);
        try {
            const payload = {
                email: editSignerEmail.trim() || null,
                phone: editSignerPhone.trim() || null,
                deliveryMethod: editSignerDelivery,
            };
            if (Number(editSignerUserId) !== Number(editingSigner.SignerUserId)) {
                payload.replaceWithUserId = editSignerUserId;
            }
            const res = await signingFilesApi.updateSigningSignerContact(
                file.SigningFileId,
                editingSigner.SignerUserId,
                payload
            );
            const savedSignerUserId = Number(
                res?.data?.signerUserId
                || res?.data?.signer?.UserId
                || editSignerUserId
            );
            if (resendAfterSave) {
                await signingFilesApi.resendSigningInvite(file.SigningFileId, [savedSignerUserId]);
                toastSuccess(t('signingManager.replaceSigner.resendSuccess'));
            } else {
                toastSuccess(t('signingManager.replaceSigner.saveSuccess'));
            }
            setEditingSigner(null);
            loadSigners();
        } catch (e) {
            console.error('Update signer failed', e);
            toastError(e?.data?.message || t('signingManager.replaceSigner.error'));
        } finally {
            setIsSavingSigner(false);
        }
    };

    useEffect(() => {
        loadSigners();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file?.SigningFileId]);

    const handleSaveName = async () => {
        const trimmed = editName.trim();
        if (!trimmed || trimmed === file?.FileName) {
            setIsEditingName(false);
            return;
        }
        setIsSavingName(true);
        try {
            await signingFilesApi.renameSigningFile(file.SigningFileId, trimmed);
            onRenamed?.(trimmed);
            setIsEditingName(false);
        } catch (e) {
            console.error('Failed to rename signing file', e);
        } finally {
            setIsSavingName(false);
        }
    };

    const showOtpUi = useSigningOtpEnabled();
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
            {isEditingName ? (
                <SimpleContainer className="lw-signingManagerScreen__renameRow">
                    <input
                        className="lw-signingManagerScreen__renameInput"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setIsEditingName(false); }}
                        autoFocus
                        disabled={isSavingName}
                    />
                    <SecondaryButton size={buttonSizes.SMALL} onPress={handleSaveName} disabled={isSavingName} isPerforming={isSavingName}>
                        {isSavingName ? '...' : t('common.save')}
                    </SecondaryButton>
                    <SecondaryButton size={buttonSizes.SMALL} onPress={() => { setIsEditingName(false); setEditName(file?.FileName || ''); }}>
                        {t('common.cancel')}
                    </SecondaryButton>
                    {showOtpUi && (
                        <SimpleContainer className={`${otpChipClassName} lw-signingManagerScreen__chip--titleEnd`}>
                            {otpChipText}
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            ) : (
                <SimpleContainer className="lw-signingManagerScreen__titleRow">
                    <TextBold24>{file?.FileName || t('signingManager.details.titleFallback')}</TextBold24>
                    <SecondaryButton size={buttonSizes.SMALL} onPress={() => { setEditName(file?.FileName || ''); setIsEditingName(true); }}>
                        {t('signingManager.actions.rename')}
                    </SecondaryButton>
                    {showOtpUi && (
                        <SimpleContainer className={`${otpChipClassName} lw-signingManagerScreen__chip--titleEnd`}>
                            {otpChipText}
                        </SimpleContainer>
                    )}
                </SimpleContainer>
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

                <SimpleContainer className="lw-signingManagerScreen__signerStatusSection">
                    <div className="lw-signingManagerScreen__signerStatusTitle">
                        {t('signingManager.signerStatus.title')}
                    </div>
                    {loadingSigners ? '...' : (
                        <div className="lw-signingManagerScreen__signerStatusWrap">
                            <div className={`lw-signingManagerScreen__signerStatusTable${isPending ? " is-withActions" : ""}`}>
                                <div className="lw-signingManagerScreen__signerStatusHead">
                                    <span>{t('signingManager.signerStatus.name')}</span>
                                    <span>{t('signingManager.signerStatus.contact')}</span>
                                    <span>{t('signingManager.signerStatus.sent')}</span>
                                    <span>{t('signingManager.signerStatus.viewed')}</span>
                                    <span>{t('signingManager.signerStatus.signed')}</span>
                                    {isPending && <span>{t('signingManager.replaceSigner.actions')}</span>}
                                </div>
                                {(signers.length ? signers : []).map((s) => (
                                    <div key={s.SignerUserId} className="lw-signingManagerScreen__signerStatusRow">
                                        <span className="lw-signingManagerScreen__signerStatusCell">{s.Name || `#${s.SignerUserId}`}</span>
                                        <span className="lw-signingManagerScreen__signerStatusCell">{[s.Email, s.Phone].filter(Boolean).join(' · ') || '-'}</span>
                                        <span className="lw-signingManagerScreen__signerStatusCell">{formatUtcDateTime(s.SentAt)}</span>
                                        <span className="lw-signingManagerScreen__signerStatusCell">{formatUtcDateTime(s.ViewedAt)}</span>
                                        <span className="lw-signingManagerScreen__signerStatusCell">{formatUtcDateTime(s.SignedAt)}</span>
                                        {isPending && (
                                            <span className="lw-signingManagerScreen__signerStatusActions">
                                                {!s.AllSigned ? (
                                                    <InviteIconButton
                                                        label={t('signingManager.replaceSigner.buttonShort')}
                                                        onPress={() => openEditSigner(s)}
                                                        className="lw-signingManagerScreen__replaceSignerBtn"
                                                    >
                                                        <ResendIcon size={18} />
                                                    </InviteIconButton>
                                                ) : null}
                                            </span>
                                        )}
                                    </div>
                                ))}
                                {!signers.length && !loadingSigners && (
                                    <div className="lw-signingManagerScreen__signerStatusRow">
                                        <span>-</span><span>-</span><span>-</span><span>-</span><span>-</span>
                                        {isPending && <span>-</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
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
                    {(isSigned || hasPartialSignatures) && (
                        <>
                            {isSigned && (
                                <>
                                    <PrimaryButton onPress={wrappedDownloadEvidencePdf} disabled={isDownloadingEvidencePdf} isPerforming={isDownloadingEvidencePdf}>
                                        {t('signingManager.actions.downloadEvidencePdf')}
                                    </PrimaryButton>
                                    <SecondaryButton onPress={wrappedDownloadEvidenceZip} disabled={isDownloadingEvidenceZip} isPerforming={isDownloadingEvidenceZip}>
                                        {t('signingManager.actions.downloadEvidenceZip')}
                                    </SecondaryButton>
                                </>
                            )}
                            <PrimaryButton onPress={wrappedDownloadSigned} disabled={isDownloadingSigned} isPerforming={isDownloadingSigned}>
                                {hasPartialSignatures && !isSigned
                                    ? t('signingManager.actions.downloadPartialSigned')
                                    : t('signingManager.actions.downloadSigned')}
                            </PrimaryButton>
                            <SecondaryButton onPress={wrappedOpenPdf} disabled={isOpeningPdf} isPerforming={isOpeningPdf}>
                                {t('signingManager.actions.openPdf')}
                            </SecondaryButton>
                        </>
                    )}
                    {!isSigned && !hasPartialSignatures && (
                        <SecondaryButton
                            onPress={openSpotsPreview}
                            disabled={isOpeningSpotsPreview}
                            isPerforming={isOpeningSpotsPreview}
                        >
                            {t('signingManager.actions.viewSignatureSpots')}
                        </SecondaryButton>
                    )}
                    {["pending", "signed", "rejected"].includes(String(file?.Status || "").toLowerCase()) && onDelete && (
                        <SecondaryButton
                            onPress={() => {
                                const ok = window.confirm(
                                    t('signingManager.actions.deleteConfirm', {
                                        defaultValue: 'למחוק את המסמך מהמעקב? פעולה זו בלתי הפיכה (למשל מספר טלפון שגוי / מסמך שגוי).',
                                    })
                                );
                                if (ok) onDelete(file.SigningFileId);
                            }}
                            isPerforming={isDeleting}
                            className="lw-signingManagerScreen__deleteBtn"
                        >
                            {isDeleting ? t('common.deleting') : t('signingManager.actions.deleteFile')}
                        </SecondaryButton>
                    )}
                    <SecondaryButton onPress={onClose}>{t('common.close')}</SecondaryButton>
                </SimpleContainer>

                {spotsPreviewError && (
                    <div className="lw-signingManagerScreen__spotsPreviewError">{spotsPreviewError}</div>
                )}

                {editingSigner && (
                    <SimpleContainer className="lw-signingManagerScreen__replaceSignerSection">
                        <div className="lw-signingManagerScreen__replaceSignerTitle">
                            <span className="lw-signingManagerScreen__replaceSignerTitleLabel">
                                {t('signingManager.replaceSigner.titleLabel')}
                            </span>
                        </div>
                        <SimpleContainer className="lw-signingManagerScreen__replaceSignerFields">
                            <SearchInput
                                onSearch={handleSearchReplaceSignerClient}
                                title={t('signingManager.replaceSigner.client')}
                                titleFontSize={16}
                                isPerforming={isPerformingCustomersByName}
                                queryResult={customersByName}
                                getButtonTextFunction={(item) => {
                                    const name = String(item?.Name || '').trim();
                                    const phone = String(item?.PhoneNumber || item?.Phone || '').trim();
                                    return phone ? `${name} | ${phone}` : name;
                                }}
                                buttonPressFunction={handleSelectReplaceSignerClient}
                                className="lw-signingManagerScreen__replaceSignerClientSearch"
                                value={editSignerSearchQuery}
                                clearOnSelect={false}
                                timeToWaitInMilli={0}
                            />
                            <SimpleInput
                                title={t('signingManager.replaceSigner.email')}
                                value={editSignerEmail}
                                onChange={(e) => setEditSignerEmail(e.target.value)}
                                className="lw-signingManagerScreen__replaceSignerField"
                                timeToWaitInMilli={0}
                            />
                            <SimpleInput
                                title={t('signingManager.replaceSigner.phone')}
                                value={editSignerPhone}
                                onChange={(e) => setEditSignerPhone(e.target.value)}
                                className="lw-signingManagerScreen__replaceSignerField"
                                timeToWaitInMilli={0}
                                type="tel"
                            />
                            <SegmentedSwitch
                                className="lw-signingManagerScreen__replaceSignerDelivery"
                                title={t('signingManager.replaceSigner.delivery')}
                                ariaLabel={t('signingManager.replaceSigner.delivery')}
                                value={editSignerDelivery}
                                onChange={setEditSignerDelivery}
                                options={editSignerDeliveryOptions}
                            />
                        </SimpleContainer>
                        <SimpleContainer className="lw-signingManagerScreen__resendActions">
                            <PrimaryButton
                                onPress={() => handleSaveSignerContact({ resendAfterSave: true })}
                                disabled={isSavingSigner || allowedEditSignerDelivery.length === 0}
                                isPerforming={isSavingSigner}
                            >
                                {t('signingManager.replaceSigner.saveAndResend')}
                            </PrimaryButton>
                            <SecondaryButton
                                onPress={() => handleSaveSignerContact({ resendAfterSave: false })}
                                disabled={isSavingSigner || allowedEditSignerDelivery.length === 0}
                            >
                                {t('signingManager.replaceSigner.saveOnly')}
                            </SecondaryButton>
                            <SecondaryButton onPress={() => setEditingSigner(null)} disabled={isSavingSigner}>
                                {t('common.cancel')}
                            </SecondaryButton>
                        </SimpleContainer>
                    </SimpleContainer>
                )}

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
