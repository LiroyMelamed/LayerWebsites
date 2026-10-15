// src/screens/signingScreen/UploadFileForSigningScreen.js
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useScreenSize } from "../../providers/ScreenSizeProvider";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../components/simpleComponents/Skeleton";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import SimpleInput from "../../components/simpleComponents/SimpleInput";

import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";

import { images } from "../../assets/images/images";
import signingFilesApi from "../../api/signingFilesApi";
import billingApi from "../../api/billingApi";

import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";
import { AdminStackName } from "../../navigation/AdminStack";
import { SigningManagerScreenName } from "./SigningManagerScreen";

import { uploadFileToR2 } from "../../utils/fileUploadUtils";
import PdfViewer from "../../components/specializedComponents/signFiles/pdfViewer/PdfViewer";
import FloatingAddField from "../../components/specializedComponents/signFiles/fieldToolbar/FloatingAddField";
import AddFieldPanel from "../../components/specializedComponents/signFiles/fieldToolbar/AddFieldPanel";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import FileUploadBox from "../../components/styledComponents/fileUpload/FileUploadBox";
import casesApi from "../../api/casesApi";
import useHttpRequest from "../../hooks/useHttpRequest";
import { customersApi } from "../../api/customersApi";
import { usePopup } from "../../providers/PopUpProvider";
import ClientPopup from "../mainScreen/components/ClientPopUp";
import LawyerStampPopup from "../../components/specializedComponents/signFiles/LawyerStampPopup";

import "./UploadFileForSigningScreen.scss";
import "../../components/specializedComponents/signFiles/fieldToolbar/fieldContextMenu.scss";
import { MainScreenName } from "../mainScreen/MainScreen";
import { useTranslation } from "react-i18next";
import IsraeliPhoneNumberValidation from "../../functions/validation/IsraeliPhoneNumberValidation";
import { showAppToast } from "../../components/ui/showAppToast";
import ApiUtils from "../../api/apiUtils";
import {
    clampSpotSize,
    isFillableFieldType,
    spotCollidesWithOthers,
} from "../../utils/signingSpotGeometry";

export const uploadFileForSigningScreenName = "/UploadFileForSigningScreen";

const buildFieldTypeOptions = (t) => ([
    { id: 'signature', label: t('signing.fields.signature'), shortLabel: t('signing.fields.signatureShort') },
    { id: 'email', label: t('signing.fields.email'), shortLabel: t('signing.fields.emailShort') },
    { id: 'phone', label: t('signing.fields.phone'), shortLabel: t('signing.fields.phoneShort') },
    { id: 'initials', label: t('signing.fields.initials'), shortLabel: t('signing.fields.initialsShort') },
    { id: 'text', label: t('signing.fields.text'), shortLabel: t('signing.fields.textShort') },
    { id: 'date', label: t('signing.fields.date'), shortLabel: t('signing.fields.dateShort') },
    { id: 'checkbox', label: t('signing.fields.checkbox'), shortLabel: t('signing.fields.checkboxShort') },
    { id: 'idnumber', label: t('signing.fields.idNumber'), shortLabel: t('signing.fields.idNumberShort') },
    { id: 'lawyerStamp', label: t('signing.fields.lawyerStamp'), shortLabel: t('signing.fields.lawyerStampShort') },
]);

function FieldSettingsPopup({
    spot,
    index,
    fieldTypeOptions,
    signers = [],
    onSave,
    onCancel,
    onDuplicate,
    onDelete,
    onReplaceStamp,
    onChangeSigner,
}) {
    const { t } = useTranslation();
    const storedRequired = spot?.isRequired ?? spot?.IsRequired;
    const [isRequired, setIsRequired] = useState(
        typeof storedRequired === 'boolean' ? storedRequired : true
    );
    const [rangeFrom, setRangeFrom] = useState("");
    const [rangeTo, setRangeTo] = useState("");
    const [rangeError, setRangeError] = useState("");
    const [signerIndex, setSignerIndex] = useState(() => Number(spot?.signerIndex ?? 0) || 0);

    const typeMeta = fieldTypeOptions.find((opt) => opt.id === (spot?.type || 'signature'));

    const handleDuplicate = (mode, range) => {
        onDuplicate?.(index, mode, range);
    };

    const handleApplyRange = () => {
        const from = Number(rangeFrom);
        const to = Number(rangeTo);
        if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < 1 || from > to) {
            setRangeError(t('signing.fieldSettings.rangeInvalid'));
            return;
        }
        setRangeError("");
        handleDuplicate('range', [from, to]);
    };

    const handleSave = () => {
        const signer = signers[signerIndex] || null;
        onSave?.(index, {
            isRequired,
            signerIndex,
            signerUserId: signer?.UserId ?? spot?.signerUserId,
            signerName: signer?.Name || spot?.signerName,
        });
    };

    return (
        <SimpleContainer className="lw-fieldSettingsPopup">
            <SimpleContainer className="lw-fieldSettingsPopup__header">
                <TextBold24>{t('signing.fieldSettings.title')}</TextBold24>
            </SimpleContainer>

            <SimpleContainer className="lw-fieldSettingsPopup__body">
                <SimpleContainer className="lw-fieldSettingsPopup__row">
                    <Text14 className="lw-fieldSettingsPopup__label">{t('signing.fieldSettings.type')}</Text14>
                    <Text14 className="lw-fieldSettingsPopup__value">{typeMeta?.label || t('signing.fields.signature')}</Text14>
                </SimpleContainer>

                <SimpleContainer className="lw-fieldSettingsPopup__row">
                    <Text14 className="lw-fieldSettingsPopup__label">{t('signing.fieldSettings.requiredLabel')}</Text14>
                    <label className="lw-fieldSettingsPopup__toggle">
                        <input
                            type="checkbox"
                            checked={isRequired}
                            onChange={(e) => setIsRequired(Boolean(e.target.checked))}
                        />
                        <span className="lw-fieldSettingsPopup__toggleText">
                            {isRequired ? t('signing.fieldSettings.required') : t('signing.fieldSettings.optional')}
                        </span>
                    </label>
                </SimpleContainer>

                {signers.length > 1 && (
                    <SimpleContainer className="lw-fieldSettingsPopup__row">
                        <Text14 className="lw-fieldSettingsPopup__label">{t('signing.fieldSettings.signerLabel')}</Text14>
                        <select
                            className="lw-fieldSettingsPopup__select"
                            value={signerIndex}
                            onChange={(e) => setSignerIndex(Number(e.target.value))}
                        >
                            {signers.map((s, idx) => (
                                <option key={s?.UserId ?? idx} value={idx}>
                                    {s?.Name || t('signing.signerFallback', { index: idx + 1 })}
                                </option>
                            ))}
                        </select>
                    </SimpleContainer>
                )}

                <SimpleContainer className="lw-fieldSettingsPopup__section">
                    <Text14 className="lw-fieldSettingsPopup__sectionTitle">{t('signing.fieldSettings.duplicateTitle')}</Text14>
                    <SimpleContainer className="lw-fieldSettingsPopup__actions">
                        <SecondaryButton onPress={() => handleDuplicate('all')}>
                            {t('signing.fieldSettings.duplicateAll')}
                        </SecondaryButton>
                        <SecondaryButton onPress={() => handleDuplicate('even')}>
                            {t('signing.fieldSettings.duplicateEven')}
                        </SecondaryButton>
                        <SecondaryButton onPress={() => handleDuplicate('odd')}>
                            {t('signing.fieldSettings.duplicateOdd')}
                        </SecondaryButton>
                    </SimpleContainer>

                    <SimpleContainer className="lw-fieldSettingsPopup__rangeRow">
                        <SimpleInput
                            title={t('signing.fieldSettings.rangeFrom')}
                            type="number"
                            value={rangeFrom}
                            onChange={(e) => setRangeFrom(e.target.value)}
                            className="lw-fieldSettingsPopup__rangeInput"
                        />
                        <SimpleInput
                            title={t('signing.fieldSettings.rangeTo')}
                            type="number"
                            value={rangeTo}
                            onChange={(e) => setRangeTo(e.target.value)}
                            className="lw-fieldSettingsPopup__rangeInput"
                        />
                        <SecondaryButton onPress={handleApplyRange} className="lw-fieldSettingsPopup__rangeButton">
                            {t('signing.fieldSettings.duplicateRange')}
                        </SecondaryButton>
                    </SimpleContainer>
                    {rangeError && <Text14 className="lw-fieldSettingsPopup__error">{rangeError}</Text14>}
                </SimpleContainer>

                {spot?.type === 'lawyerStamp' && typeof onReplaceStamp === 'function' && (
                    <SimpleContainer className="lw-fieldSettingsPopup__section">
                        <Text14 className="lw-fieldSettingsPopup__sectionTitle">{t('signing.fields.lawyerStamp')}</Text14>
                        <SecondaryButton onPress={() => onReplaceStamp(index)}>
                            החלפת חותם
                        </SecondaryButton>
                    </SimpleContainer>
                )}
            </SimpleContainer>

            <SimpleContainer className="lw-fieldSettingsPopup__footer">
                <SecondaryButton onPress={onDelete} className="lw-fieldSettingsPopup__delete">
                    {t('common.remove')}
                </SecondaryButton>
                <SimpleContainer className="lw-fieldSettingsPopup__footerActions">
                    <SecondaryButton onPress={onCancel}>{t('common.cancel')}</SecondaryButton>
                    <PrimaryButton onPress={handleSave}>{t('common.save')}</PrimaryButton>
                </SimpleContainer>
            </SimpleContainer>
        </SimpleContainer>
    );
}

export default function UploadFileForSigningScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();
    const navigate = useNavigate();
    const { openPopup, closePopup } = usePopup();
    const [otpFeatureEnabled, setOtpFeatureEnabled] = useState(false);
    const [otpDefaultRequire, setOtpDefaultRequire] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await ApiUtils.get("platform-settings/public");
                const data = res?.data || {};
                const rawEnabled = data.SIGNING_OTP_ENABLED;
                const rawDefault = data.SIGNING_REQUIRE_OTP_DEFAULT;
                const enabled = rawEnabled === true || rawEnabled === "true" || rawEnabled === "1" || rawEnabled === 1;
                const defaultRequire = !(
                    rawDefault === false || rawDefault === "false" || rawDefault === "0" || rawDefault === 0
                );
                if (cancelled) return;
                setOtpFeatureEnabled(enabled);
                setOtpDefaultRequire(defaultRequire);
                setOtpPolicy(enabled && defaultRequire ? "require" : "waive");
                setOtpWaiverAck(!(enabled && defaultRequire));
            } catch {
                // Keep OTP UI off until settings load successfully.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const RETENTION_NOTICE_ACK_KEY = "lw_retention_notice_ack_v1";

    const { result: billingPlanData, performRequest: loadBillingPlan } = useHttpRequest(
        billingApi.getPlan,
        null,
        () => {
            // Non-blocking UI; ignore billing failures.
        }
    );

    useEffect(() => {
        loadBillingPlan();
    }, [loadBillingPlan]);

    const openFieldEditor = (index) => {
        const spot = signatureSpots[index];
        if (!spot) return;
        setSelectedSpotIndex(index);
        openPopup(
            <FieldSettingsPopup
                spot={spot}
                index={index}
                fieldTypeOptions={fieldTypeOptions}
                signers={selectedSigners}
                onSave={(i, updates) => {
                    handleUpdateSpot(i, updates);
                    setSelectedSpotIndex(null);
                    closePopup();
                }}
                onCancel={() => {
                    setSelectedSpotIndex(null);
                    closePopup();
                }}
                onDuplicate={(i, mode, range) => {
                    confirmDuplicateSpotToPages(i, mode, range);
                }}
                onDelete={() => {
                    closePopup();
                    openConfirmRemove(index);
                }}
                onReplaceStamp={(i) => {
                    closePopup();
                    handleReplaceLawyerStamp(i);
                }}
            />
        );
    };

    const handleReplaceLawyerStamp = (index) => {
        const spot = signatureSpots[index];
        if (!spot) return;
        openPopup(
            <LawyerStampPopup
                onConfirm={(compositeDataUrl) => {
                    closePopup();
                    handleUpdateSpot(index, { stampImageDataUrl: compositeDataUrl });
                }}
                onCancel={closePopup}
            />
        );
    };

    // Helper: check for near-equal spots (type, signer, position/size) to avoid duplicates
    const spotsEqual = (a, b) => {
        if (!a || !b) return false;
        if ((a.type || 'signature') !== (b.type || 'signature')) return false;
        if ((a.signerUserId || a.signerIndex) !== (b.signerUserId || b.signerIndex)) return false;
        const tol = 2; // pixels tolerance
        const keys = ['x', 'y', 'width', 'height'];
        for (const k of keys) {
            const va = Number(a[k] || 0);
            const vb = Number(b[k] || 0);
            if (Math.abs(va - vb) > tol) return false;
        }
        return true;
    };

    const getPageCount = () => {
        const container = document.querySelector('.lw-signing-pdfViewer');
        if (!container) return 1;
        return container.querySelectorAll('[data-page-number]').length || 1;
    };

    const duplicateSpotToPages = (index, mode, range) => {
        const pageCount = getPageCount();
        const spot = signatureSpots[index];
        if (!spot) return;

        // Build list of target pages
        let pages = [];
        for (let p = 1; p <= pageCount; p++) pages.push(p);

        const currentPage = Number(spot.pageNum) || 1;

        if (mode === 'all') {
            // keep all except current
        } else if (mode === 'even') {
            pages = pages.filter((p) => p % 2 === 0);
        } else if (mode === 'odd') {
            pages = pages.filter((p) => p % 2 === 1);
        } else if (mode === 'range') {
            if (!Array.isArray(range) || range.length < 2) return;
            const [from, to] = range;
            pages = pages.filter((p) => p >= from && p <= to);
        }

        pages = pages.filter((p) => p !== currentPage);

        // For each page, create a new spot with same relative coords
        const newSpots = [];
        pages.forEach((p) => {
            const candidate = { ...spot, pageNum: p };
            // Skip if identical exists on that page
            const exists = signatureSpots.some((s) => Number(s.pageNum) === Number(p) && spotsEqual(s, candidate));
            if (!exists) newSpots.push(candidate);
        });

        if (!newSpots.length) {
            openInfoPopup(t('signing.duplicate.noneAdded'));
            return;
        }

        setSignatureSpots((prev) => [...prev, ...newSpots]);
    };

    const confirmDuplicateSpotToPages = (index, mode, range) => {
        const pageCount = getPageCount();
        const extra = Math.max(0, pageCount - 1);
        const needsConfirm = mode === 'all' || mode === 'even' || mode === 'odd';
        if (!needsConfirm || extra <= 0) {
            duplicateSpotToPages(index, mode, range);
            return;
        }
        openPopup(
            <SimpleContainer className="lw-fieldConfirmPopup">
                <TextBold24>{t('signing.duplicate.confirmTitle')}</TextBold24>
                <Text14 className="lw-fieldConfirmPopup__text">
                    {t('signing.duplicate.confirmAllPages', { count: extra, pages: pageCount })}
                </Text14>
                <SimpleContainer className="lw-fieldConfirmPopup__actions">
                    <SecondaryButton onPress={closePopup}>{t('common.cancel')}</SecondaryButton>
                    <PrimaryButton
                        onPress={() => {
                            closePopup();
                            duplicateSpotToPages(index, mode, range);
                        }}
                    >
                        {t('signing.duplicate.confirmAction')}
                    </PrimaryButton>
                </SimpleContainer>
            </SimpleContainer>
        );
    };

    const handleSpotContext = (index, ev) => {
        // open popup menu using popup provider; reuse SimplePopUp as modal menu
        setSelectedSpotIndex(index);
        openPopup(
            <SimpleContainer className="lw-fieldContextMenu">
                <SecondaryButton
                    className="lw-fieldContextMenu__action"
                    onPress={() => openFieldEditor(index)}
                >
                    {t('signing.context.edit')}
                </SecondaryButton>
                <div className="lw-fieldContextMenu__divider" />
                <div className="lw-fieldContextMenu__groupTitle">{t('signing.context.duplicate')}</div>
                <SecondaryButton
                    className="lw-fieldContextMenu__action"
                    onPress={() => { closePopup(); confirmDuplicateSpotToPages(index, 'all'); }}
                >
                    {t('signing.context.allPages')}
                </SecondaryButton>
                <SecondaryButton
                    className="lw-fieldContextMenu__action"
                    onPress={() => { closePopup(); confirmDuplicateSpotToPages(index, 'even'); }}
                >
                    {t('signing.context.evenPages')}
                </SecondaryButton>
                <SecondaryButton
                    className="lw-fieldContextMenu__action"
                    onPress={() => { closePopup(); confirmDuplicateSpotToPages(index, 'odd'); }}
                >
                    {t('signing.context.oddPages')}
                </SecondaryButton>
                <SecondaryButton
                    className="lw-fieldContextMenu__action"
                    onPress={() => openFieldEditor(index)}
                >
                    {t('signing.context.pageRange')}
                </SecondaryButton>
                <div className="lw-fieldContextMenu__divider" />
                <SecondaryButton
                    className="lw-fieldContextMenu__action"
                    onPress={() => { closePopup(); openConfirmRemove(index); }}
                >
                    {t('common.remove')}
                </SecondaryButton>
            </SimpleContainer>
        );
    };

    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName, null, () => { });
    const { result: customersByName, isPerforming: isPerformingCustomersByName, performRequest: SearchCustomersByName } = useHttpRequest(
        (userName) => customersApi.getCustomersByName(userName, { includeStaff: true }),
        null,
        () => { }
    );

    const [caseId, setCaseId] = useState("");
    const [selectedCase, setSelectedCase] = useState(null);
    const [clientId, setClientId] = useState("");
    const [caseSearchQuery, setCaseSearchQuery] = useState("");
    const [signerSearchQuery, setSignerSearchQuery] = useState("");
    const [selectedSigners, setSelectedSigners] = useState([]);
    const [selectedSignerId, setSelectedSignerId] = useState(null);
    const [notes, setNotes] = useState("");

    // Manual signer entry state
    const [showManualSigner, setShowManualSigner] = useState(false);
    const [manualSignerName, setManualSignerName] = useState("");
    const [manualSignerEmail, setManualSignerEmail] = useState("");
    const [manualSignerPhone, setManualSignerPhone] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);
    const [documentName, setDocumentName] = useState("");
    const [completionEmail, setCompletionEmail] = useState("");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await customersApi.getCurrentCustomer();
                const email = String(res?.data?.Email || res?.data?.email || "").trim();
                if (!cancelled && email) setCompletionEmail((prev) => prev || email);
            } catch {
                // best-effort default only
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const [signatureSpots, setSignatureSpots] = useState([]);
    const [selectedFieldType, setSelectedFieldType] = useState('signature');
    const [selectedSpotIndex, setSelectedSpotIndex] = useState(null);

    // Court-ready policy: OTP is required by default; waiver must be explicit + acknowledged.
    const [otpPolicy, setOtpPolicy] = useState(otpFeatureEnabled ? "require" : "waive"); // 'waive' | 'require'
    const [otpWaiverAck, setOtpWaiverAck] = useState(!otpFeatureEnabled);

    // Signing order: 'parallel' (all sign at once) or 'sequential' (signer 1 first, then 2, ...)
    const [signingOrder, setSigningOrder] = useState('parallel');

    // Drag-and-drop state for sequential signer reorder
    const [seqDragIdx, setSeqDragIdx] = useState(null);
    const [seqOverIdx, setSeqOverIdx] = useState(null);
    const seqTouchDrag = useRef({ active: false });

    const [loading, setLoading] = useState(false);

    const [uploadedFileKey, setUploadedFileKey] = useState(null);
    const [detecting, setDetecting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [showAddFieldPopup, setShowAddFieldPopup] = useState(false);

    useEffect(() => {
        if (otpFeatureEnabled) return;
        setOtpPolicy("waive");
        setOtpWaiverAck(true);
    }, [otpFeatureEnabled]);

    useEffect(() => {
        if (!selectedSigners || selectedSigners.length === 0) {
            setSelectedSignerId(null);
            return;
        }
        if (selectedSigners.length === 1) {
            setSelectedSignerId(selectedSigners[0]?.UserId ?? null);
            return;
        }
        const exists = selectedSigners.some((s) => Number(s?.UserId) === Number(selectedSignerId));
        if (!exists) setSelectedSignerId(selectedSigners[0]?.UserId ?? null);
    }, [selectedSigners, selectedSignerId]);

    const didLogOtpFlagRef = useRef(false);
    useEffect(() => {
        if (didLogOtpFlagRef.current) return;
        didLogOtpFlagRef.current = true;
        if (process.env.NODE_ENV !== 'production') {
            console.info('otpFeatureEnabled', otpFeatureEnabled);
        }
    }, [otpFeatureEnabled]);

    const fieldTypeOptions = buildFieldTypeOptions(t);

    const openInfoPopup = (message) => {
        if (!message) return;
        openPopup(
            <SimpleContainer className="lw-fieldInfoPopup">
                <Text14 className="lw-fieldInfoPopup__text">{message}</Text14>
                <SimpleContainer className="lw-fieldInfoPopup__actions">
                    <PrimaryButton onPress={closePopup}>{t('common.ok')}</PrimaryButton>
                </SimpleContainer>
            </SimpleContainer>
        );
    };

    const ensureRetentionNoticeAcknowledged = async () => {
        try {
            if (localStorage.getItem(RETENTION_NOTICE_ACK_KEY) === "1") return true;

            const coercePositiveIntOrNull = (v) => {
                const n = Number(v);
                if (!Number.isFinite(n)) return null;
                const i = Math.floor(n);
                return i > 0 ? i : null;
            };

            const resolveRetentionDaysFromPlanLike = (planLike) => {
                const core =
                    planLike?.retention?.documentsCoreDays ??
                    planLike?.effectiveDocumentsRetentionDaysCore ??
                    null;
                const pii =
                    planLike?.retention?.documentsPiiDays ??
                    planLike?.effectiveDocumentsRetentionDaysPii ??
                    null;
                return {
                    coreDays: coercePositiveIntOrNull(core),
                    piiDays: coercePositiveIntOrNull(pii),
                };
            };

            // Prefer already-loaded billing plan, but if the user hits upload quickly,
            // fetch once to avoid showing placeholders.
            let { coreDays, piiDays } = resolveRetentionDaysFromPlanLike(billingPlanData);
            if (!coreDays || !piiDays) {
                try {
                    const res = await billingApi.getPlan();
                    const fromFetch = resolveRetentionDaysFromPlanLike(res?.data);
                    coreDays = coreDays || fromFetch.coreDays;
                    piiDays = piiDays || fromFetch.piiDays;
                } catch {
                    // keep nulls
                }
            }

            const noticeText =
                coreDays && piiDays
                    ? t('signing.upload.retentionNotice.text', { coreDays, piiDays })
                    : t('signing.upload.retentionNotice.textFallback');

            return await new Promise((resolve) => {
                openPopup(
                    <SimpleContainer className="lw-retentionNoticePopup">
                        <TextBold24>{t('signing.upload.retentionNotice.title')}</TextBold24>
                        <Text14 className="lw-retentionNoticePopup__text">
                            {noticeText}
                        </Text14>
                        <SimpleContainer className="lw-retentionNoticePopup__actions">
                            <SecondaryButton
                                onPress={() => {
                                    closePopup();
                                    resolve(false);
                                }}
                            >
                                {t('common.cancel')}
                            </SecondaryButton>
                            <PrimaryButton
                                onPress={() => {
                                    try {
                                        localStorage.setItem(RETENTION_NOTICE_ACK_KEY, "1");
                                    } catch {
                                        // ignore
                                    }
                                    closePopup();
                                    resolve(true);
                                }}
                            >
                                {t('signing.upload.retentionNotice.ackButton')}
                            </PrimaryButton>
                        </SimpleContainer>
                    </SimpleContainer>
                );
            });
        } catch {
            return true;
        }
    };

    const openConfirmRemove = (index) => {
        openPopup(
            <SimpleContainer className="lw-fieldConfirmPopup">
                <TextBold24>{t('signing.fieldSettings.confirmTitle')}</TextBold24>
                <Text14 className="lw-fieldConfirmPopup__text">{t('signing.fieldSettings.confirmDelete')}</Text14>
                <SimpleContainer className="lw-fieldConfirmPopup__actions">
                    <SecondaryButton
                        onPress={() => {
                            setSelectedSpotIndex(null);
                            closePopup();
                        }}
                    >
                        {t('common.cancel')}
                    </SecondaryButton>
                    <PrimaryButton
                        onPress={() => {
                            handleRemoveSpot(index);
                            setSelectedSpotIndex(null);
                            closePopup();
                        }}
                    >
                        {t('common.remove')}
                    </PrimaryButton>
                </SimpleContainer>
            </SimpleContainer>
        );
    };

    const getSelectedSignerIndex = () => {
        if (!selectedSigners || selectedSigners.length === 0) return 0;
        if (selectedSigners.length === 1) return 0;
        const idx = selectedSigners.findIndex((s) => Number(s?.UserId) === Number(selectedSignerId));
        return idx >= 0 ? idx : 0;
    };

    const handleAddSpotForPage = (pageNumber, signerIdx = 0, fieldType = 'signature', anchor = {}) => {
        const signer = selectedSigners?.[signerIdx] || null;
        const signerName = signer?.Name || t('signing.signerFallback', { index: Number(signerIdx) + 1 });
        const isRequired = isFillableFieldType(fieldType);

        let x = 120;
        let y = 160;
        const pageEl = document.querySelector(`.lw-signing-pageInner[data-page-number="${pageNumber}"]`);
        if (pageEl) {
            const pageWidth = pageEl.getBoundingClientRect().width || 800;
            const pageHeight = pageEl.getBoundingClientRect().height || 1000;
            const scale = pageWidth / 800;
            const ratio = Number(anchor?.yRatio);
            if (Number.isFinite(ratio)) {
                const yPx = Math.max(0, Math.min(pageHeight, ratio * pageHeight));
                const yBase = yPx / (scale || 1);
                y = Math.max(20, Math.min(yBase - 30, pageHeight / (scale || 1) - 60));
            }
        }

        setSignatureSpots((prev) => [
            ...prev,
            {
                pageNum: pageNumber,
                x,
                y,
                width: fieldType === 'clientStamp' || fieldType === 'lawyerStamp' ? 420 : 160,
                height: fieldType === 'clientStamp' || fieldType === 'lawyerStamp' ? 180 : 56,
                signerIndex: signerIdx,
                signerUserId: signer?.UserId,
                signerName,
                isRequired,
                type: fieldType,
            },
        ]);
    };

    const openAddFieldMenu = (pageNumber, anchor) => {
        if (isSmallScreen) {
            setShowAddFieldPopup(true);
        }
    };

    const handleFieldPanelSelect = (fieldType) => {
        const signerIdx = getSelectedSignerIndex();
        const pageNumber = currentPage || 1;
        setSelectedFieldType(fieldType);

        if (fieldType === 'lawyerStamp') {
            openPopup(
                <LawyerStampPopup
                    onConfirm={(compositeDataUrl) => {
                        closePopup();
                        handleAddLawyerStampSpot(pageNumber, signerIdx, compositeDataUrl);
                    }}
                    onCancel={closePopup}
                />
            );
            if (isSmallScreen) setShowAddFieldPopup(false);
            return;
        }

        const container = document.querySelector('.lw-signing-pdfViewer');
        const pageEl = container?.querySelector(`[data-page-number="${pageNumber}"]`);
        let anchor = {};
        if (container && pageEl) {
            const pageRect = pageEl.getBoundingClientRect();
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            const centerY = viewportHeight / 2;
            const relativeY = Math.max(0, Math.min(centerY - pageRect.top, pageRect.height));
            const yRatio = pageRect.height > 0 ? relativeY / pageRect.height : 0.2;
            anchor = { yRatio };
        }

        handleAddSpotForPage(pageNumber, signerIdx, fieldType, anchor);
        if (isSmallScreen) {
            setShowAddFieldPopup(false);
        }
    };

    const handleAddLawyerStampSpot = (pageNumber, signerIdx, compositeDataUrl) => {
        const signer = selectedSigners?.[signerIdx] || null;
        const signerName = signer?.Name || t('signing.signerFallback', { index: Number(signerIdx) + 1 });

        let x = 120;
        let y = 160;
        const pageEl = document.querySelector(`.lw-signing-pageInner[data-page-number="${pageNumber}"]`);
        if (pageEl) {
            const pageHeight = pageEl.getBoundingClientRect().height || 1000;
            const scale = (pageEl.getBoundingClientRect().width || 800) / 800;
            y = Math.max(20, Math.min((pageHeight / 2) / (scale || 1), pageHeight / (scale || 1) - 100));
        }

        setSignatureSpots((prev) => [
            ...prev,
            {
                pageNum: pageNumber,
                x,
                y,
                width: 420,
                height: 180,
                signerIndex: signerIdx,
                signerUserId: signer?.UserId,
                signerName,
                isRequired: false,
                type: 'lawyerStamp',
                stampImageDataUrl: compositeDataUrl,
            },
        ]);
    };

    const handleUpdateSpot = (index, updates) => {
        setSignatureSpots((prev) => {
            const current = prev[index];
            if (!current) return prev;
            let next = { ...current, ...updates };
            if (updates.width != null || updates.height != null) {
                const size = clampSpotSize(next.width, next.height);
                next = { ...next, ...size };
            }
            if (spotCollidesWithOthers(prev, index, next)) {
                return prev;
            }
            return prev.map((s, i) => (i === index ? next : s));
        });
    };

    const handleRemoveSpot = (index) => {
        setSignatureSpots((prev) => prev.filter((_, i) => i !== index));
        setSelectedSpotIndex(null);
    };

    const resetFileState = () => {
        setUploadedFileKey(null);
        setSignatureSpots([]);
    };

    const handleFileSelected = (file) => {
        resetFileState();
        setSelectedFile(file || null);
        if (file) setDocumentName(file.name.replace(/\.pdf$/i, ''));
    };

    const validateSignerContact = ({ email, phone, nameForError }) => {
        const emailNorm = String(email || "").trim();
        const phoneNorm = String(phone || "").trim();
        if (!emailNorm && !phoneNorm) {
            showAppToast({
                type: "error",
                text: t("signing.upload.validation.signerContactRequired"),
            });
            return false;
        }
        if (phoneNorm) {
            const err = IsraeliPhoneNumberValidation(phoneNorm);
            if (err) {
                showAppToast({
                    type: "error",
                    text: t("signing.upload.validation.invalidSignerPhone", { name: nameForError || "" }),
                });
                return false;
            }
        }
        if (emailNorm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
            showAppToast({
                type: "error",
                text: t("signing.upload.validation.invalidSignerEmail"),
            });
            return false;
        }
        return true;
    };

    const validateForm = () => {
        if (!selectedFile) {
            showAppToast({ type: "error", text: t('signing.upload.validation.selectFile') });
            return false;
        }
        if (!selectedSigners || selectedSigners.length === 0) {
            showAppToast({ type: "error", text: t('signing.upload.validation.selectAtLeastOneSigner') });
            return false;
        }
        for (const s of selectedSigners) {
            const method = clampDeliveryMethod(s, s.deliveryMethod);
            const needsEmail = method === "email" || method === "both";
            const needsPhone = method === "phone" || method === "both";
            const email = needsEmail ? s.Email : "";
            const phone = needsPhone ? (s.Phone || s.PhoneNumber) : "";
            if (!validateSignerContact({ email, phone, nameForError: s.Name })) return false;
        }
        if (signatureSpots.length === 0) {
            showAppToast({ type: "error", text: t('signing.upload.validation.atLeastOneSpot') });
            return false;
        }

        if (otpFeatureEnabled && otpPolicy !== "waive" && otpPolicy !== "require") {
            showAppToast({ type: "error", text: t('signing.upload.validation.selectOtpPolicy') });
            return false;
        }

        if (otpFeatureEnabled && otpPolicy === "waive" && !otpWaiverAck) {
            showAppToast({ type: "error", text: t('signing.upload.validation.waiverAckRequired') });
            return false;
        }
        return true;
    };

    const addSigner = (customer) => {
        if (!customer?.UserId) return;

        if (contactsCollideWithSelected({
            email: customer.Email,
            phone: customer.PhoneNumber || customer.Phone,
        })) {
            showAppToast({
                type: 'error',
                text: t('signing.upload.validation.duplicateSignerContact'),
            });
            return;
        }

        setSelectedSigners((prev) => {
            const exists = prev.some((s) => Number(s?.UserId) === Number(customer.UserId));
            if (exists) return prev;
            const next = {
                UserId: customer.UserId,
                Name: customer.Name || t('signing.signerFallback', { index: prev.length + 1 }),
                Email: customer.Email || null,
                Phone: customer.PhoneNumber || customer.Phone || null,
            };
            next.deliveryMethod = clampDeliveryMethod(next, 'phone');
            return [...prev, next];
        });
    };

    const normalizePhoneDigits = (phone) => String(phone || '').replace(/\D/g, '');
    const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
    const hasEmail = (value) => !!normalizeEmail(value);
    const hasPhone = (value) => normalizePhoneDigits(value).length >= 9;

    /** Allowed delivery methods based on which contacts the signer has. */
    const getAllowedDeliveryMethods = (signer) => {
        const emailOk = hasEmail(signer?.Email);
        const phoneOk = hasPhone(signer?.Phone || signer?.PhoneNumber);
        if (emailOk && phoneOk) return ['both', 'email', 'phone'];
        if (emailOk) return ['email'];
        if (phoneOk) return ['phone'];
        return [];
    };

    const clampDeliveryMethod = (signer, preferred) => {
        const allowed = getAllowedDeliveryMethods(signer);
        if (!allowed.length) return preferred || 'both';
        if (preferred && allowed.includes(preferred)) return preferred;
        return allowed[0];
    };

    const contactsCollideWithSelected = ({ email, phone, excludeUserId = null }) => {
        const emailNorm = normalizeEmail(email);
        const phoneDigits = normalizePhoneDigits(phone);
        return (selectedSigners || []).some((s) => {
            if (excludeUserId != null && Number(s?.UserId) === Number(excludeUserId)) return false;
            const sEmail = normalizeEmail(s?.Email);
            const sPhone = normalizePhoneDigits(s?.Phone || s?.PhoneNumber);
            if (emailNorm && sEmail && emailNorm === sEmail) return true;
            if (phoneDigits && sPhone && phoneDigits === sPhone) return true;
            // Treat +972... and 0... as the same Israeli mobile when both are present.
            if (phoneDigits && sPhone) {
                const a = phoneDigits.startsWith('972') ? `0${phoneDigits.slice(3)}` : phoneDigits;
                const b = sPhone.startsWith('972') ? `0${sPhone.slice(3)}` : sPhone;
                if (a && b && a === b) return true;
            }
            return false;
        });
    };

    const addManualSigner = async () => {
        const name = manualSignerName.trim();
        const email = manualSignerEmail.trim();
        const phone = manualSignerPhone.trim();
        if (!name) return;
        if (!validateSignerContact({ email, phone, nameForError: name })) return;

        if (contactsCollideWithSelected({ email, phone })) {
            showAppToast({
                type: 'error',
                text: t('signing.upload.validation.duplicateSignerContact'),
            });
            return;
        }

        const attachExistingSigner = (user, conflictCode = null) => {
            const userId = user?.UserId;
            if (!userId) return false;
            setSelectedSigners((prev) => {
                const exists = prev.some((s) => Number(s?.UserId) === Number(userId));
                if (exists) return prev;
                const resolvedEmail = user.Email || email || null;
                const resolvedPhone = user.PhoneNumber || user.Phone || phone || null;
                let deliveryMethod = 'phone';
                if (resolvedEmail && !resolvedPhone) deliveryMethod = 'email';
                else if (resolvedPhone && !resolvedEmail) deliveryMethod = 'phone';
                return [
                    ...prev,
                    {
                        UserId: userId,
                        Name: user.Name || name,
                        Email: resolvedEmail,
                        Phone: resolvedPhone,
                        deliveryMethod,
                    },
                ];
            });
            setManualSignerName("");
            setManualSignerEmail("");
            setManualSignerPhone("");
            setShowManualSigner(false);
            SearchCustomersByName(user.Name || name);
            const byEmail = conflictCode === 'EMAIL_ALREADY_EXISTS' || (!phone && !!email);
            showAppToast({
                type: 'success',
                text: byEmail
                    ? t('signing.upload.validation.manualSignerAttachedExistingEmail', {
                        defaultValue: 'הדוא״ל כבר קיים במערכת — שייכנו את הלקוח הקיים כחותם.',
                    })
                    : t('signing.upload.validation.manualSignerAttachedExisting', {
                        defaultValue: 'הטלפון כבר קיים במערכת — שייכנו את הלקוח הקיים כחותם.',
                    }),
            });
            return true;
        };

        try {
            
            const res = await customersApi.addCustomer({
                name,
                phoneNumber: phone,
                email: email || '',
                companyName: '',
                dateOfBirth: null,
            });

            if (res?.status === 409 && (res?.data?.code === 'PHONE_ALREADY_EXISTS' || res?.data?.code === 'EMAIL_ALREADY_EXISTS' || res?.data?.UserId)) {
                if (attachExistingSigner(res.data, res?.data?.code)) return;
                const byEmail = res?.data?.code === 'EMAIL_ALREADY_EXISTS';
                showAppToast({
                    type: 'error',
                    text: res?.data?.message || (byEmail
                        ? t('signing.upload.validation.manualSignerEmailExists', {
                            defaultValue: 'כתובת הדוא״ל כבר קיימת במערכת. חפשו את הלקוח והוסיפו אותו כחותם.',
                        })
                        : t('signing.upload.validation.manualSignerPhoneExists', {
                            defaultValue: 'מספר הטלפון כבר קיים במערכת. חפשו את הלקוח והוסיפו אותו כחותם.',
                        })),
                });
                return;
            }

            if (res?.status !== 200 && res?.status !== 201) {
                showAppToast({
                    type: 'error',
                    text: res?.data?.message || t('signing.upload.validation.manualSignerCreateFailed'),
                });
                return;
            }

            const created = res?.data || {};
            const userId = created.UserId;
            if (!userId) {
                showAppToast({
                    type: 'error',
                    text: t('signing.upload.validation.manualSignerCreateFailed'),
                });
                return;
            }

            setSelectedSigners((prev) => {
                const exists = prev.some((s) => Number(s?.UserId) === Number(userId));
                if (exists) return prev;
                let deliveryMethod = 'phone';
                if (email && !phone) deliveryMethod = 'email';
                else if (phone && !email) deliveryMethod = 'phone';
                // When both contacts exist, still default to SMS only.
                return [
                    ...prev,
                    {
                        UserId: userId,
                        Name: created.Name || name,
                        Email: created.Email || email || null,
                        Phone: created.PhoneNumber || phone || null,
                        deliveryMethod,
                    },
                ];
            });

            setManualSignerName("");
            setManualSignerEmail("");
            setManualSignerPhone("");
            setShowManualSigner(false);
            SearchCustomersByName(name);
        } catch (err) {
            const data = err?.data || err?.response?.data;
            const code = data?.code;
            if (err?.status === 409 || code === 'PHONE_ALREADY_EXISTS' || code === 'EMAIL_ALREADY_EXISTS') {
                if (attachExistingSigner(data || {}, code)) return;
                const byEmail = code === 'EMAIL_ALREADY_EXISTS';
                showAppToast({
                    type: 'error',
                    text: data?.message || (byEmail
                        ? t('signing.upload.validation.manualSignerEmailExists', {
                            defaultValue: 'כתובת הדוא״ל כבר קיימת במערכת. חפשו את הלקוח והוסיפו אותו כחותם.',
                        })
                        : t('signing.upload.validation.manualSignerPhoneExists', {
                            defaultValue: 'מספר הטלפון כבר קיים במערכת. חפשו את הלקוח והוסיפו אותו כחותם.',
                        })),
                });
                return;
            }
            showAppToast({
                type: 'error',
                text: data?.message || err?.message || t('signing.upload.validation.manualSignerCreateFailed'),
            });
        }
    };

    const removeSigner = (userId) => {
        setSelectedSigners((prev) => prev.filter((s) => Number(s?.UserId) !== Number(userId)));
        // Also clean up spots assigned to removed signer (simple behavior)
        setSignatureSpots((prev) => prev.filter((spot) => Number(spot?.signerUserId) !== Number(userId)));
    };

    // ── Sequential signer reorder (drag-and-drop) ────────────────
    const resolveSignerIndexInList = (signers, spot) => {
        const list = Array.isArray(signers) ? signers : [];
        const uid = spot?.signerUserId ?? spot?.SignerUserId;
        if (uid != null && uid !== '' && Number(uid) > 0) {
            const byId = list.findIndex((s) => Number(s?.UserId ?? s?.userId) === Number(uid));
            if (byId >= 0) return byId;
        }
        const name = String(spot?.signerName || spot?.SignerName || '').trim();
        if (name) {
            const byName = list.findIndex(
                (s) => String((s?.Name ?? s?.name) || '').trim() === name
            );
            if (byName >= 0) return byName;
        }
        const raw = spot?.signerIndex ?? spot?.SignerIndex;
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0 && n < list.length) return n;
        return null;
    };

    const moveSignerOrder = useCallback((fromIdx, toIdx) => {
        if (fromIdx === toIdx) return;
        setSelectedSigners((prev) => {
            const next = [...prev];
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            // Keep spot ownership on the same person when list order changes.
            setSignatureSpots((spots) =>
                (spots || []).map((spot) => {
                    const newIdx = (() => {
                        const uid = spot?.signerUserId ?? spot?.SignerUserId;
                        if (uid != null && uid !== '' && Number(uid) > 0) {
                            const byId = next.findIndex((s) => Number(s?.UserId) === Number(uid));
                            if (byId >= 0) return byId;
                        }
                        const name = String(spot?.signerName || '').trim();
                        if (name) {
                            const byName = next.findIndex((s) => String(s?.Name || '').trim() === name);
                            if (byName >= 0) return byName;
                        }
                        return spot?.signerIndex;
                    })();
                    return newIdx === spot?.signerIndex ? spot : { ...spot, signerIndex: newIdx };
                })
            );
            return next;
        });
    }, []);

    const handleSeqDragStart = useCallback((e, index) => {
        setSeqDragIdx(index);
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    const handleSeqDragOver = useCallback((e, index) => {
        e.preventDefault();
        setSeqOverIdx(index);
    }, []);

    const handleSeqDrop = useCallback((e, index) => {
        e.preventDefault();
        if (seqDragIdx !== null && seqDragIdx !== index) moveSignerOrder(seqDragIdx, index);
        setSeqDragIdx(null);
        setSeqOverIdx(null);
    }, [seqDragIdx, moveSignerOrder]);

    const handleSeqDragEnd = useCallback(() => {
        setSeqDragIdx(null);
        setSeqOverIdx(null);
    }, []);

    const handleSeqTouchStart = useCallback((index) => {
        seqTouchDrag.current.active = true;
        setSeqDragIdx(index);
    }, []);

    const handleSeqTouchMove = useCallback((e) => {
        if (!seqTouchDrag.current.active) return;
        e.preventDefault();
        const touch = e.touches[0];
        const els = document.elementsFromPoint(touch.clientX, touch.clientY);
        for (const el of els) {
            if (el.dataset?.signerOrderIndex != null) {
                setSeqOverIdx(Number(el.dataset.signerOrderIndex));
                break;
            }
        }
    }, []);

    const handleSeqTouchEnd = useCallback(() => {
        if (seqTouchDrag.current.active && seqDragIdx !== null && seqOverIdx !== null) {
            moveSignerOrder(seqDragIdx, seqOverIdx);
        }
        seqTouchDrag.current.active = false;
        setSeqDragIdx(null);
        setSeqOverIdx(null);
    }, [seqDragIdx, seqOverIdx, moveSignerOrder]);

    const ensureUploadedKey = async () => {
        if (uploadedFileKey) return uploadedFileKey;

        const uploadRes = await uploadFileToR2(selectedFile);
        const key = uploadRes?.key || uploadRes?.data?.key;
        if (!key) throw new Error("missing key from uploadFileToR2");

        setUploadedFileKey(key);
        return key;
    };

    const handleDetectSpots = async () => {
        if (!selectedFile) return;

        try {
            setDetecting(true);
            

            const key = await ensureUploadedKey();

            const signersPayload = (selectedSigners || []).map((s) => ({
                userId: s.isManual ? null : Number(s.UserId),
                name: s.Name,
            }));

            const detectRes = await signingFilesApi.detectSignatureSpots(
                key,
                signersPayload.length ? signersPayload : null
            );

            const spots = detectRes?.data?.spots || detectRes?.spots || [];


            setSignatureSpots(spots);

            if (!spots.length) {
                showAppToast({
                    type: "error",
                    text: t('signing.upload.detect.noneFound'),
                });
            }
        } catch (err) {
            console.error(err);
            showAppToast({ type: "error", text: t('signing.upload.detect.error') });
        } finally {
            setDetecting(false);
        }
    };

    const handleSubmit = async () => {
        

        if (!validateForm()) return;

        const retentionAck = await ensureRetentionNoticeAcknowledged();
        if (!retentionAck) return;

        try {
            setLoading(true);

            const key = await ensureUploadedKey();

            const signersPayload = (selectedSigners || []).map((s) => ({
                userId: s.isManual ? null : Number(s.UserId),
                name: s.Name,
                deliveryMethod: clampDeliveryMethod(s, s.deliveryMethod),
                ...(s.isManual && s.Email ? { email: s.Email } : {}),
                ...(s.isManual && s.Phone ? { phone: s.Phone } : {}),
            }));

            // Recompute signerIndex from current list identity so reorder cannot swap ownership.
            const signatureLocations = (signatureSpots || []).map((spot) => {
                const idx = resolveSignerIndexInList(signersPayload, spot);
                if (idx == null) return spot;
                return { ...spot, signerIndex: idx };
            });

            const primaryClientId = signersPayload?.[0]?.userId || Number(clientId) || null;

            const normalizedCaseId = caseId ? Number(caseId) : null;

            const requireOtp = otpFeatureEnabled ? otpPolicy === "require" : false;
            const otpWaiverAcknowledged = otpFeatureEnabled
                ? (otpPolicy === "waive" ? Boolean(otpWaiverAck) : false)
                : true;

            const uploadRes = await signingFilesApi.uploadFileForSigning({
                caseId: normalizedCaseId,
                clientId: primaryClientId,
                fileName: documentName.trim() ? `${documentName.trim()}.pdf` : selectedFile.name,
                fileKey: key,
                signatureLocations,
                notes: notes || null,
                signers: signersPayload,
                requireOtp,
                otpWaiverAcknowledged,
                signingOrder,
                completionEmail: completionEmail.trim() || null,
            });
            const sentCount = Number(uploadRes?.data?.sentCount || 0);
            const targetCount = Number(uploadRes?.data?.targetCount || selectedSigners.length || 0);
            const failedCount = Number(uploadRes?.data?.failedCount || Math.max(0, targetCount - sentCount));
            if (failedCount > 0) {
                showAppToast({
                    type: "error",
                    text: `נשלח ל-${sentCount} מתוך ${targetCount}. חלק מהנמענים לא קיבלו הזמנה.`,
                });
            } else {
                showAppToast({
                    type: "success",
                    text: `ההזמנה נשלחה בהצלחה ל-${sentCount || targetCount} נמענים.`,
                });
                // Navigate to pending documents after successful send.
                navigate(AdminStackName + SigningManagerScreenName);
                return;
            }

            setCaseId("");
            setSelectedCase(null);
            setClientId("");
            setSelectedSigners([]);
            setNotes("");
            setSelectedFile(null);
            setDocumentName("");
            setCompletionEmail("");
            setSignatureSpots([]);
            setUploadedFileKey(null);
            setOtpPolicy(otpFeatureEnabled && otpDefaultRequire ? "require" : "waive");
            setOtpWaiverAck(!(otpFeatureEnabled && otpDefaultRequire));
            setSigningOrder('parallel');
            setCaseSearchQuery("");
            setSelectedSpotIndex(null);
        } catch (err) {
            console.error(err);
            const backendMessage = err?.data?.message || err?.message;
            showAppToast({ type: "error", text: backendMessage || t('signing.upload.errorSending') });
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (query) => {
        setCaseSearchQuery(query);
        SearchCaseByName(query);
    };

    const handleButtonPress = (query, result) => {
        const foundItem = result || casesByName.find(caseItem => caseItem.CaseName === query);
        setCaseId(foundItem?.CaseId || "");
        setSelectedCase(foundItem || null);
        setClientId(foundItem?.UserId || "");
        setCaseSearchQuery("");

        // If no signers selected yet, default to the case's client
        if (foundItem?.UserId) {
            setSelectedSigners((prev) => {
                if (prev && prev.length) return prev;
                return [{
                    UserId: foundItem.UserId,
                    Name: foundItem.CustomerName || t('signing.signerFallback', { index: 1 }),
                }];
            });
        }
    };

    const handleRemoveSelectedCase = () => {
        setSelectedCase(null);
        setCaseId("");
        setClientId("");
        setCaseSearchQuery("");
    };

    const handleSearchSigner = (query) => {
        setSignerSearchQuery(query);
        SearchCustomersByName(query);
    };

    const handleAddSignerFromSearch = (text, customer) => {
        addSigner(customer);
        setSignerSearchQuery("");
    };

    const handleOpenAddCustomerPopup = (query) => {
        openPopup(
            <ClientPopup
                initialName={query}
                closePopUpFunction={closePopup}
                rePerformRequest={(savedClient) => {
                    if (savedClient?.UserId) {
                        addSigner({
                            UserId: savedClient.UserId,
                            Name: savedClient.Name,
                            Email: savedClient.Email,
                            PhoneNumber: savedClient.PhoneNumber || savedClient.Phone,
                            Phone: savedClient.PhoneNumber || savedClient.Phone,
                        });
                    }
                    SearchCustomersByName(query || savedClient?.Name || '');
                }}
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
                />
            )}

            <SimpleScrollView className="lw-uploadSigningScreen__scroll">
                <SimpleContainer className="lw-uploadSigningScreen">
                    <SimpleContainer className="lw-uploadSigningScreen__headerRow">
                        <TextBold24>{t('signing.upload.title')}</TextBold24>
                    </SimpleContainer>

                    <SimpleContainer className="lw-uploadSigningScreen__formCard">

                        <SimpleContainer className="lw-uploadSigningScreen__searchRow">
                            <SearchInput
                                onSearch={handleSearch}
                                title={t('cases.searchCaseTitle')}
                                titleFontSize={20}
                                isPerforming={isPerformingCasesById}
                                queryResult={casesByName}
                                getButtonTextFunction={(item) => item.CaseName}
                                className="lw-uploadSigningScreen__search"
                                buttonPressFunction={handleButtonPress}
                                value={caseSearchQuery}
                                clearOnSelect
                            />

                            <SearchInput
                                onSearch={handleSearchSigner}
                                title={t('signing.upload.searchSignerTitle')}
                                titleFontSize={20}
                                isPerforming={isPerformingCustomersByName}
                                queryResult={customersByName}
                                getButtonTextFunction={(item) => {
                                    const name = String(item?.Name || '').trim();
                                    const phone = String(item?.PhoneNumber || item?.Phone || '').trim();
                                    return phone ? `${name} | ${phone}` : name;
                                }}
                                className="lw-uploadSigningScreen__search"
                                buttonPressFunction={handleAddSignerFromSearch}
                                emptyActionText={t('customers.addCustomer')}
                                onEmptyAction={handleOpenAddCustomerPopup}
                                value={signerSearchQuery}
                                clearOnSelect
                                timeToWaitInMilli={0}
                            />

                            {!showManualSigner ? (
                                <SimpleContainer className="lw-uploadSigningScreen__manualSignerToggle">
                                    <SecondaryButton onPress={() => setShowManualSigner(true)}>
                                        {t('signing.upload.addManualSigner')}
                                    </SecondaryButton>
                                </SimpleContainer>
                            ) : (
                                <SimpleContainer className="lw-uploadSigningScreen__manualSignerForm">
                                    <label className="lw-uploadSigningScreen__label">{t('signing.upload.addManualSigner')}</label>
                                    <SimpleContainer className="lw-uploadSigningScreen__manualSignerFields">
                                        <SimpleInput
                                            title={t('signing.upload.manualSignerName')}
                                            value={manualSignerName}
                                            onChange={(e) => setManualSignerName(e.target.value)}
                                            className="lw-uploadSigningScreen__manualInput"
                                            timeToWaitInMilli={0}
                                        />
                                        <SimpleInput
                                            title={t('signing.upload.manualSignerEmail')}
                                            value={manualSignerEmail}
                                            onChange={(e) => setManualSignerEmail(e.target.value)}
                                            className="lw-uploadSigningScreen__manualInput"
                                            timeToWaitInMilli={0}
                                            type="email"
                                        />
                                        <SimpleInput
                                            title={t('signing.upload.manualSignerPhone')}
                                            value={manualSignerPhone}
                                            onChange={(e) => setManualSignerPhone(e.target.value)}
                                            className="lw-uploadSigningScreen__manualInput"
                                            timeToWaitInMilli={0}
                                            type="tel"
                                        />
                                    </SimpleContainer>
                                    <SimpleContainer className="lw-uploadSigningScreen__manualSignerActions">
                                        <PrimaryButton onPress={addManualSigner} disabled={!manualSignerName.trim() || (!manualSignerEmail.trim() && !manualSignerPhone.trim())}>
                                            {t('signing.upload.addSignerBtn')}
                                        </PrimaryButton>
                                        <SecondaryButton onPress={() => { setShowManualSigner(false); setManualSignerName(""); setManualSignerEmail(""); setManualSignerPhone(""); }}>
                                            {t('common.cancel')}
                                        </SecondaryButton>
                                    </SimpleContainer>
                                </SimpleContainer>
                            )}
                        </SimpleContainer>

                        {selectedCase && (
                            <SimpleContainer className="lw-uploadSigningScreen__formGroup">
                                <label className="lw-uploadSigningScreen__label">{t('signing.upload.selectedCaseLabel')}</label>
                                <SimpleContainer className="lw-uploadSigningScreen__selectedSignersRow">
                                    <SimpleContainer className="lw-uploadSigningScreen__signerChip">
                                        <span className="lw-uploadSigningScreen__signerChipName">{selectedCase.CaseName}</span>
                                        <button
                                            type="button"
                                            className="lw-uploadSigningScreen__signerChipRemove"
                                            onClick={handleRemoveSelectedCase}
                                            aria-label={t('signing.upload.removeCaseAria', { name: selectedCase.CaseName })}
                                            title={t('signing.upload.removeCaseAria', { name: selectedCase.CaseName })}
                                        >
                                            X
                                        </button>
                                    </SimpleContainer>
                                </SimpleContainer>
                            </SimpleContainer>
                        )}

                        {selectedSigners?.length > 0 && (
                            <SimpleContainer className="lw-uploadSigningScreen__formGroup">
                                <label className="lw-uploadSigningScreen__label">{t('signing.upload.selectedSignersLabel')}</label>
                                <SimpleContainer className="lw-uploadSigningScreen__selectedSignersRow">
                                    {selectedSigners.map((s) => (
                                        <SimpleContainer key={s.UserId} className={`lw-uploadSigningScreen__signerChip${s.isManual ? ' lw-uploadSigningScreen__signerChip--manual' : ''}`}>
                                            <span className="lw-uploadSigningScreen__signerChipName">
                                                {s.Name}
                                                {(s.Email || s.Phone) && (
                                                    <span className="lw-uploadSigningScreen__signerChipContact">
                                                        {[s.Email, s.Phone].filter(Boolean).join(' · ')}
                                                    </span>
                                                )}
                                            </span>
                                            {(() => {
                                                const allowed = getAllowedDeliveryMethods(s);
                                                const deliveryValue = clampDeliveryMethod(s, s.deliveryMethod);
                                                if (allowed.length <= 1) {
                                                    return (
                                                        <span className="lw-uploadSigningScreen__deliverySelect lw-uploadSigningScreen__deliverySelect--locked" title={t('signing.upload.deliveryLockedHint')}>
                                                            {deliveryValue === 'phone'
                                                                ? t('signing.upload.deliveryPhone')
                                                                : t('signing.upload.deliveryEmail')}
                                                        </span>
                                                    );
                                                }
                                                return (
                                                    <select
                                                        className="lw-uploadSigningScreen__deliverySelect"
                                                        value={deliveryValue}
                                                        onChange={(e) => {
                                                            const method = e.target.value;
                                                            if (!allowed.includes(method)) return;
                                                            setSelectedSigners((prev) =>
                                                                prev.map((sig) =>
                                                                    Number(sig.UserId) === Number(s.UserId)
                                                                        ? { ...sig, deliveryMethod: method }
                                                                        : sig
                                                                )
                                                            );
                                                        }}
                                                    >
                                                        {allowed.includes('both') && (
                                                            <option value="both">{t('signing.upload.deliveryBoth')}</option>
                                                        )}
                                                        {allowed.includes('email') && (
                                                            <option value="email">{t('signing.upload.deliveryEmail')}</option>
                                                        )}
                                                        {allowed.includes('phone') && (
                                                            <option value="phone">{t('signing.upload.deliveryPhone')}</option>
                                                        )}
                                                    </select>
                                                );
                                            })()}
                                            <button
                                                type="button"
                                                className="lw-uploadSigningScreen__signerChipEdit"
                                                onClick={() => {
                                                    const editedName = window.prompt(t('signing.upload.manualSignerName'), s.Name || '') || s.Name || '';
                                                    const editedEmail = window.prompt(t('signing.upload.manualSignerEmail'), s.Email || '') || '';
                                                    const editedPhone = window.prompt(t('signing.upload.manualSignerPhone'), s.Phone || '') || '';
                                                    const nextEmail = editedEmail.trim() || null;
                                                    const nextPhone = editedPhone.trim() || null;
                                                    if (contactsCollideWithSelected({
                                                        email: nextEmail,
                                                        phone: nextPhone,
                                                        excludeUserId: s.UserId,
                                                    })) {
                                                        showAppToast({
                                                            type: 'error',
                                                            text: t('signing.upload.validation.duplicateSignerContact'),
                                                        });
                                                        return;
                                                    }
                                                    const contactChanged =
                                                        normalizeEmail(nextEmail) !== normalizeEmail(s.Email) ||
                                                        normalizePhoneDigits(nextPhone) !== normalizePhoneDigits(s.Phone);
                                                    const nextSigner = {
                                                        ...s,
                                                        Name: editedName.trim() || s.Name,
                                                        Email: nextEmail,
                                                        Phone: nextPhone,
                                                        ...(contactChanged ? { isManual: true } : {}),
                                                    };
                                                    nextSigner.deliveryMethod = clampDeliveryMethod(nextSigner, s.deliveryMethod);
                                                    setSelectedSigners((prev) =>
                                                        prev.map((sig) =>
                                                            Number(sig.UserId) === Number(s.UserId)
                                                                ? nextSigner
                                                                : sig
                                                        )
                                                    );
                                                }}
                                                aria-label={t('signing.context.edit')}
                                                title={t('signing.context.edit')}
                                            >
                                                {t('signing.context.edit')}
                                            </button>
                                            <button
                                                type="button"
                                                className="lw-uploadSigningScreen__signerChipRemove"
                                                onClick={() => removeSigner(s.UserId)}
                                                aria-label={t('signing.upload.removeSignerAria', { name: s.Name })}
                                                title={t('signing.upload.removeSignerAria', { name: s.Name })}
                                            >
                                                X
                                            </button>
                                        </SimpleContainer>
                                    ))}
                                </SimpleContainer>
                            </SimpleContainer>
                        )}

                        <SimpleContainer className="lw-uploadSigningScreen__formGroup lw-uploadSigningScreen__fileGroup">
                            <FileUploadBox
                                accept=".pdf"
                                onFileSelected={handleFileSelected}
                                label={t('signing.upload.fileDropPrompt')}
                                hint={t('signing.upload.fileHintPdfOnly')}
                            />

                            {selectedFile && (
                                <>
                                    <div className="lw-uploadSigningScreen__fileName">
                                        {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                                    </div>
                                    <SearchInput
                                        title={t('signing.upload.documentNameTitle')}
                                        value={documentName}
                                        onSearch={setDocumentName}
                                        className="lw-uploadSigningScreen__documentNameInput"
                                        timeToWaitInMilli={0}
                                    />
                                </>
                            )}
                        </SimpleContainer>

                        <SimpleContainer className="lw-uploadSigningScreen__formGroup lw-uploadSigningScreen__notesGroup">
                            <div className="lw-uploadSigningScreen__notesTitle">{t('signing.upload.notesTitle')}</div>
                            <textarea
                                className="lw-uploadSigningScreen__textarea"
                                dir="rtl"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </SimpleContainer>

                        <SimpleContainer className="lw-uploadSigningScreen__formGroup">
                            <label className="lw-uploadSigningScreen__label">{t('signing.upload.completionEmailLabel')}</label>
                            <SearchInput
                                placeholder={t('signing.upload.completionEmailPlaceholder')}
                                value={completionEmail}
                                onSearch={setCompletionEmail}
                                className="lw-uploadSigningScreen__completionEmailInput"
                                timeToWaitInMilli={0}
                            />
                            <Text14 className="lw-uploadSigningScreen__completionEmailHint">
                                {t('signing.upload.completionEmailHint')}
                            </Text14>
                        </SimpleContainer>

                        {selectedFile && (
                            <>
                                <SimpleContainer className="lw-uploadSigningScreen__viewerHeaderRow">
                                    <h3 className="lw-uploadSigningScreen__viewerTitle">
                                        {t('signing.upload.viewerTitle')}
                                    </h3>

                                    <SecondaryButton onPress={handleDetectSpots} disabled={detecting} isPerforming={detecting}>
                                        {detecting ? t('signing.upload.detect.detecting') : t('signing.upload.detect.button')}
                                    </SecondaryButton>
                                </SimpleContainer>

                                <SimpleContainer className="lw-signing-pdfViewerWrapper">
                                    {Array.isArray(selectedSigners) && selectedSigners.length > 1 && (
                                        <SimpleContainer className="lw-uploadSigningScreen__signerSticky">
                                            <SimpleContainer className="lw-fieldTypeNavbar__signerRow">
                                                <SimpleContainer className="lw-fieldTypeNavbar__signerButtons">
                                                    {selectedSigners.map((s, signerIdx) => {
                                                        const isSelected = Number(s?.UserId) === Number(selectedSignerId);
                                                        const Button = isSelected ? PrimaryButton : SecondaryButton;
                                                        const paletteClass = `lw-signer-palette-${signerIdx % 4}`;
                                                        return (
                                                            <Button
                                                                key={s?.UserId}
                                                                onPress={() => setSelectedSignerId(s?.UserId)}
                                                                className={`lw-fieldTypeNavbar__signerButton ${paletteClass}${isSelected ? ' is-activeSigner' : ''}`}
                                                            >
                                                                {s?.Name || t('signing.signerFallback', { index: signerIdx + 1 })}
                                                            </Button>
                                                        );
                                                    })}
                                                </SimpleContainer>
                                            </SimpleContainer>
                                        </SimpleContainer>
                                    )}
                                    <SimpleContainer className="lw-signing-pdfViewerRow">
                                        {!isSmallScreen && (
                                            <AddFieldPanel
                                                fieldTypeOptions={fieldTypeOptions}
                                                onSelectField={handleFieldPanelSelect}
                                                isInline
                                            />
                                        )}
                                        <SimpleContainer className="lw-signing-pdfViewerMain">
                                            <PdfViewer
                                                pdfFile={selectedFile}
                                                spots={signatureSpots}
                                                onUpdateSpot={handleUpdateSpot}
                                                onRemoveSpot={handleRemoveSpot}
                                                onRequestRemove={(i) => openConfirmRemove(i)}
                                                onSelectSpot={(i) => setSelectedSpotIndex(i)}
                                                onEditSpot={openFieldEditor}
                                                onRequestContext={handleSpotContext}
                                                onAddSpotForPage={handleAddSpotForPage}
                                                signers={selectedSigners}
                                                onPageChange={setCurrentPage}
                                                selectedSpotIndex={selectedSpotIndex}
                                            />
                                        </SimpleContainer>
                                    </SimpleContainer>
                                    {isSmallScreen && (
                                        <>
                                            <FloatingAddField
                                                onAdd={openAddFieldMenu}
                                                containerSelector=".lw-signing-pdfViewer"
                                                currentPage={currentPage}
                                            />
                                            {showAddFieldPopup && (
                                                <AddFieldPanel
                                                    fieldTypeOptions={fieldTypeOptions}
                                                    onSelectField={handleFieldPanelSelect}
                                                    onClose={() => setShowAddFieldPopup(false)}
                                                />
                                            )}
                                        </>
                                    )}
                                </SimpleContainer>

                                <div className="lw-uploadSigningScreen__infoText">
                                    <Text14>
                                        {t('signing.upload.spotHelpText')}
                                    </Text14>
                                </div>
                            </>
                        )}

                        <SimpleContainer className="lw-uploadSigningScreen__actionsRow lw-uploadSigningScreen__actionsRow--inline">
                            <SecondaryButton
                                onPress={() => navigate(AdminStackName + SigningManagerScreenName)}
                            >
                                {t('common.back')}
                            </SecondaryButton>
                            <PrimaryButton onPress={handleSubmit} disabled={loading} isPerforming={loading}>
                                {loading ? t('signing.upload.sending') : t('signing.upload.sendToClient')}
                            </PrimaryButton>
                        </SimpleContainer>

                        {loading && (
                            <SimpleContainer className="lw-uploadSigningScreen__loading">
                                <Skeleton width="100%" height={40} borderRadius={6} />
                            </SimpleContainer>
                        )}
                    </SimpleContainer>

                    <SimpleContainer className="lw-uploadSigningScreen__formGroup lw-uploadSigningScreen__otpPolicyGroup">
                        <label className="lw-uploadSigningScreen__label">{t('signing.upload.signingOrderLabel')}</label>

                        <div className="lw-uploadSigningScreen__radioRow">
                            <label className="lw-uploadSigningScreen__radioLabel">
                                <input
                                    type="radio"
                                    name="signingOrder"
                                    checked={signingOrder === 'parallel'}
                                    onChange={() => setSigningOrder('parallel')}
                                />
                                {t('signing.upload.signingOrderParallel')}
                            </label>
                        </div>

                        <div className="lw-uploadSigningScreen__radioRow">
                            <label className="lw-uploadSigningScreen__radioLabel">
                                <input
                                    type="radio"
                                    name="signingOrder"
                                    checked={signingOrder === 'sequential'}
                                    onChange={() => setSigningOrder('sequential')}
                                />
                                {t('signing.upload.signingOrderSequential')}
                            </label>
                        </div>

                        {signingOrder === 'sequential' && selectedSigners.length >= 2 && (
                            <SimpleContainer className="lw-uploadSigningScreen__seqOrderSection">
                                <Text14 className="lw-uploadSigningScreen__seqOrderTitle">
                                    {t('signing.upload.sequentialOrderTitle')}
                                </Text14>
                                <SimpleContainer className="lw-uploadSigningScreen__seqOrderList">
                                    {selectedSigners.map((s, idx) => (
                                        <SimpleContainer
                                            key={s.UserId}
                                            className={`lw-uploadSigningScreen__seqOrderItem${seqOverIdx === idx && seqDragIdx !== idx ? ' lw-uploadSigningScreen__seqOrderItem--dragOver' : ''}${seqDragIdx === idx ? ' lw-uploadSigningScreen__seqOrderItem--dragging' : ''}`}
                                            data-signer-order-index={idx}
                                            onDragOver={(e) => handleSeqDragOver(e, idx)}
                                            onDrop={(e) => handleSeqDrop(e, idx)}
                                        >
                                            <span
                                                className="lw-uploadSigningScreen__seqDragHandle"
                                                draggable
                                                onDragStart={(e) => handleSeqDragStart(e, idx)}
                                                onDragEnd={handleSeqDragEnd}
                                                onTouchStart={() => handleSeqTouchStart(idx)}
                                                onTouchMove={(e) => handleSeqTouchMove(e)}
                                                onTouchEnd={handleSeqTouchEnd}
                                            >
                                                &#x2630;
                                            </span>
                                            <span className="lw-uploadSigningScreen__seqOrderNum">{idx + 1}</span>
                                            <span className="lw-uploadSigningScreen__seqOrderName">{s.Name}</span>
                                        </SimpleContainer>
                                    ))}
                                </SimpleContainer>
                            </SimpleContainer>
                        )}
                    </SimpleContainer>

                    {otpFeatureEnabled && (
                        <SimpleContainer className="lw-uploadSigningScreen__formGroup lw-uploadSigningScreen__otpPolicyGroup">
                            <label className="lw-uploadSigningScreen__label">{t('signing.upload.otpPolicyLabel')}</label>

                            <div className="lw-uploadSigningScreen__radioRow">
                                <label className="lw-uploadSigningScreen__radioLabel">
                                    <input
                                        type="radio"
                                        name="otpPolicy"
                                        checked={otpPolicy === "require"}
                                        onChange={() => setOtpPolicy("require")}
                                    />
                                    {t('signing.upload.otpRequire')}
                                </label>
                            </div>

                            <div className="lw-uploadSigningScreen__radioRow">
                                <label className="lw-uploadSigningScreen__radioLabel">
                                    <input
                                        type="radio"
                                        name="otpPolicy"
                                        checked={otpPolicy === "waive"}
                                        onChange={() => setOtpPolicy("waive")}
                                    />
                                    {t('signing.upload.otpWaive')}
                                </label>
                            </div>

                            {otpPolicy === "waive" && (
                                <div className="lw-uploadSigningScreen__waiverBox">
                                    <div className="lw-uploadSigningScreen__waiverText">
                                        {t('signing.upload.otpWaiverWarning')}
                                    </div>
                                    <label className="lw-uploadSigningScreen__checkboxLabel">
                                        <input
                                            type="checkbox"
                                            checked={otpWaiverAck}
                                            onChange={(e) => setOtpWaiverAck(Boolean(e.target.checked))}
                                        />
                                        {t('signing.upload.otpWaiverAck')}
                                    </label>
                                </div>
                            )}
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            </SimpleScrollView>

            {selectedFile && (
                <SimpleContainer className="lw-uploadSigningScreen__stickySendBar">
                    <SecondaryButton
                        onPress={() => navigate(AdminStackName + SigningManagerScreenName)}
                    >
                        {t('common.back')}
                    </SecondaryButton>
                    <PrimaryButton onPress={handleSubmit} disabled={loading} isPerforming={loading}>
                        {loading ? t('signing.upload.sending') : t('signing.upload.sendToClient')}
                    </PrimaryButton>
                </SimpleContainer>
            )}
        </SimpleScreen>
    );
}
