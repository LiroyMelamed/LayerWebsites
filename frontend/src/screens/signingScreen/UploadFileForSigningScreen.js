// src/screens/signingScreen/UploadFileForSigningScreen.js
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useScreenSize } from "../../providers/ScreenSizeProvider";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
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
import FieldTypeNavbar from "../../components/specializedComponents/signFiles/fieldToolbar/FieldTypeNavbar";
import FloatingAddField from "../../components/specializedComponents/signFiles/fieldToolbar/FloatingAddField";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import casesApi from "../../api/casesApi";
import useHttpRequest from "../../hooks/useHttpRequest";
import { customersApi } from "../../api/customersApi";
import { usePopup } from "../../providers/PopUpProvider";
import ClientPopup from "../mainScreen/components/ClientPopUp";

import "./UploadFileForSigningScreen.scss";
import { MainScreenName } from "../mainScreen/MainScreen";
import { useTranslation } from "react-i18next";
import { SIGNING_OTP_ENABLED } from "../../featureFlags";

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
]);

function FieldSettingsPopup({
    spot,
    index,
    fieldTypeOptions,
    onSave,
    onCancel,
    onDuplicate,
    onDelete,
}) {
    const { t } = useTranslation();
    const [isRequired, setIsRequired] = useState(spot?.isRequired !== false);
    const [rangeFrom, setRangeFrom] = useState("");
    const [rangeTo, setRangeTo] = useState("");
    const [rangeError, setRangeError] = useState("");

    const typeMeta = fieldTypeOptions.find((opt) => opt.id === (spot?.type || 'signature'));

    const handleDuplicate = (mode, range) => {
        onDuplicate?.(index, mode, range);
        onCancel?.();
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
            </SimpleContainer>

            <SimpleContainer className="lw-fieldSettingsPopup__footer">
                <SecondaryButton onPress={onDelete} className="lw-fieldSettingsPopup__delete">
                    {t('common.remove')}
                </SecondaryButton>
                <SimpleContainer className="lw-fieldSettingsPopup__footerActions">
                    <SecondaryButton onPress={onCancel}>{t('common.cancel')}</SecondaryButton>
                    <PrimaryButton onPress={() => onSave?.(index, { isRequired })}>{t('common.save')}</PrimaryButton>
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
    const otpFeatureEnabled = SIGNING_OTP_ENABLED;

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
                    duplicateSpotToPages(i, mode, range);
                }}
                onDelete={() => {
                    closePopup();
                    openConfirmRemove(index);
                }}
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

    const handleSpotContext = (index, ev) => {
        // open popup menu using popup provider; reuse SimplePopUp as modal menu
        setSelectedSpotIndex(index);
        openPopup(
            <SimpleContainer className="lw-fieldContextMenu">
                <SecondaryButton
                    className="lw-fieldContextMenu__action"
                    onPress={() => { closePopup(); openFieldEditor(index); }}
                >
                    {t('signing.context.edit')}
                </SecondaryButton>
                <div className="lw-fieldContextMenu__divider" />
                <div className="lw-fieldContextMenu__groupTitle">{t('signing.context.duplicate')}</div>
                <SecondaryButton
                    className="lw-fieldContextMenu__action"
                    onPress={() => { closePopup(); duplicateSpotToPages(index, 'all'); }}
                >
                    {t('signing.context.allPages')}
                </SecondaryButton>
                <SecondaryButton
                    className="lw-fieldContextMenu__action"
                    onPress={() => { closePopup(); duplicateSpotToPages(index, 'even'); }}
                >
                    {t('signing.context.evenPages')}
                </SecondaryButton>
                <SecondaryButton
                    className="lw-fieldContextMenu__action"
                    onPress={() => { closePopup(); duplicateSpotToPages(index, 'odd'); }}
                >
                    {t('signing.context.oddPages')}
                </SecondaryButton>
                <SecondaryButton
                    className="lw-fieldContextMenu__action"
                    onPress={() => { closePopup(); openFieldEditor(index); }}
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
    const { result: customersByName, isPerforming: isPerformingCustomersByName, performRequest: SearchCustomersByName } = useHttpRequest(customersApi.getCustomersByName, null, () => { });

    const [caseId, setCaseId] = useState("");
    const [selectedCase, setSelectedCase] = useState(null);
    const [clientId, setClientId] = useState("");
    const [caseSearchQuery, setCaseSearchQuery] = useState("");
    const [signerSearchQuery, setSignerSearchQuery] = useState("");
    const [selectedSigners, setSelectedSigners] = useState([]);
    const [selectedSignerId, setSelectedSignerId] = useState(null);
    const [notes, setNotes] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);

    const [signatureSpots, setSignatureSpots] = useState([]);
    const [selectedFieldType, setSelectedFieldType] = useState('signature');
    const [, setSelectedSpotIndex] = useState(null);
    const [isDragActive, setIsDragActive] = useState(false);

    // Court-ready policy: OTP is required by default; waiver must be explicit + acknowledged.
    const [otpPolicy, setOtpPolicy] = useState(otpFeatureEnabled ? "require" : "waive"); // 'waive' | 'require'
    const [otpWaiverAck, setOtpWaiverAck] = useState(!otpFeatureEnabled);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const messageTimerRef = useRef(null);

    useEffect(() => {
        if (message) {
            clearTimeout(messageTimerRef.current);
            messageTimerRef.current = setTimeout(() => setMessage(null), 3000);
        }
        return () => clearTimeout(messageTimerRef.current);
    }, [message]);

    const [uploadedFileKey, setUploadedFileKey] = useState(null);
    const [detecting, setDetecting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

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

    const fileInputRef = useRef(null);

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
        const isRequired = fieldType === 'signature';

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
                width: 160,
                height: 60,
                signerIndex: signerIdx,
                signerUserId: signer?.UserId,
                signerName,
                isRequired,
                type: fieldType,
            },
        ]);
    };

    const openAddFieldMenu = (pageNumber, anchor) => {
        const signerIdx = getSelectedSignerIndex();
        openPopup(
            <SimpleContainer className="lw-fieldContextMenu lw-fieldContextMenu--floating">
                <SimpleContainer className="lw-fieldContextMenu__header">
                    <span className="lw-fieldContextMenu__title">{t('signing.fieldSettings.addFieldTitle')}</span>
                    <SecondaryButton
                        onPress={closePopup}
                        className="lw-fieldContextMenu__close"
                    >
                        {t('common.close')}
                    </SecondaryButton>
                </SimpleContainer>
                {fieldTypeOptions.map((option) => (
                    <SecondaryButton
                        key={option.id}
                        className="lw-fieldContextMenu__action"
                        onPress={() => {
                            closePopup();
                            setSelectedFieldType(option.id);
                            handleAddSpotForPage(pageNumber, signerIdx, option.id, anchor);
                        }}
                    >
                        {option.label}
                    </SecondaryButton>
                ))}
            </SimpleContainer>
        );
    };

    const handleUpdateSpot = (index, updates) => {
        setSignatureSpots((prev) =>
            prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
        );
    };

    const handleRemoveSpot = (index) => {
        setSignatureSpots((prev) => prev.filter((_, i) => i !== index));
        setSelectedSpotIndex(null);
    };

    const resetFileState = () => {
        setUploadedFileKey(null);
        setSignatureSpots([]);
    };

    const handleFileChange = (e) => {
        resetFileState();
        const f = e.target.files?.[0] || null;
        setSelectedFile(f);
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        resetFileState();

        const f = e.dataTransfer.files?.[0] || null;
        if (f) setSelectedFile(f);
    };

    const validateForm = () => {
        if (!selectedFile) {
            setMessage({ type: "error", text: t('signing.upload.validation.selectFile') });
            return false;
        }
        if (!selectedSigners || selectedSigners.length === 0) {
            setMessage({ type: "error", text: t('signing.upload.validation.selectAtLeastOneSigner') });
            return false;
        }
        if (signatureSpots.length === 0) {
            setMessage({ type: "error", text: t('signing.upload.validation.atLeastOneSpot') });
            return false;
        }

        if (otpFeatureEnabled && otpPolicy !== "waive" && otpPolicy !== "require") {
            setMessage({ type: "error", text: t('signing.upload.validation.selectOtpPolicy') });
            return false;
        }

        if (otpFeatureEnabled && otpPolicy === "waive" && !otpWaiverAck) {
            setMessage({ type: "error", text: t('signing.upload.validation.waiverAckRequired') });
            return false;
        }
        return true;
    };

    const addSigner = (customer) => {
        if (!customer?.UserId) return;

        setSelectedSigners((prev) => {
            const exists = prev.some((s) => Number(s?.UserId) === Number(customer.UserId));
            if (exists) return prev;
            return [
                ...prev,
                {
                    UserId: customer.UserId,
                    Name: customer.Name || t('signing.signerFallback', { index: prev.length + 1 }),
                },
            ];
        });
    };

    const removeSigner = (userId) => {
        setSelectedSigners((prev) => prev.filter((s) => Number(s?.UserId) !== Number(userId)));
        // Also clean up spots assigned to removed signer (simple behavior)
        setSignatureSpots((prev) => prev.filter((spot) => Number(spot?.signerUserId) !== Number(userId)));
    };

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
            setMessage(null);

            const key = await ensureUploadedKey();

            const signersPayload = (selectedSigners || []).map((s) => ({
                userId: Number(s.UserId),
                name: s.Name,
            }));

            const detectRes = await signingFilesApi.detectSignatureSpots(
                key,
                signersPayload.length ? signersPayload : null
            );

            const spots = detectRes?.data?.spots || detectRes?.spots || [];


            setSignatureSpots(spots);

            if (!spots.length) {
                setMessage({
                    type: "error",
                    text: t('signing.upload.detect.noneFound'),
                });
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: "error", text: t('signing.upload.detect.error') });
        } finally {
            setDetecting(false);
        }
    };

    const handleSubmit = async () => {
        setMessage(null);

        if (!validateForm()) return;

        const retentionAck = await ensureRetentionNoticeAcknowledged();
        if (!retentionAck) return;

        try {
            setLoading(true);

            const key = await ensureUploadedKey();

            const signersPayload = (selectedSigners || []).map((s) => ({
                userId: Number(s.UserId),
                name: s.Name,
            }));

            const primaryClientId = signersPayload?.[0]?.userId || Number(clientId) || null;

            const normalizedCaseId = caseId ? Number(caseId) : null;

            const requireOtp = otpFeatureEnabled ? otpPolicy === "require" : false;
            const otpWaiverAcknowledged = otpFeatureEnabled
                ? (otpPolicy === "waive" ? Boolean(otpWaiverAck) : false)
                : true;

            await signingFilesApi.uploadFileForSigning({
                caseId: normalizedCaseId,
                clientId: primaryClientId,
                fileName: selectedFile.name,
                fileKey: key,
                signatureLocations: signatureSpots,
                notes: notes || null,
                signers: signersPayload,
                requireOtp,
                otpWaiverAcknowledged,
            });

            setMessage({ type: "success", text: t('signing.upload.successSent') });

            setCaseId("");
            setSelectedCase(null);
            setClientId("");
            setSelectedSigners([]);
            setNotes("");
            setSelectedFile(null);
            setSignatureSpots([]);
            setUploadedFileKey(null);
            setOtpPolicy(otpFeatureEnabled ? "require" : "waive");
            setOtpWaiverAck(!otpFeatureEnabled);
            setCaseSearchQuery("");

            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (err) {
            console.error(err);
            setMessage({ type: "error", text: t('signing.upload.errorSending') });
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
                rePerformRequest={() => SearchCustomersByName(query)}
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
                                getButtonTextFunction={(item) => `${item.Name}`}
                                className="lw-uploadSigningScreen__search"
                                buttonPressFunction={handleAddSignerFromSearch}
                                emptyActionText={t('customers.addCustomer')}
                                onEmptyAction={handleOpenAddCustomerPopup}
                                value={signerSearchQuery}
                                clearOnSelect
                            />
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
                                        <SimpleContainer key={s.UserId} className="lw-uploadSigningScreen__signerChip">
                                            <span className="lw-uploadSigningScreen__signerChipName">{s.Name}</span>
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
                            <div
                                className={`lw-uploadSigningScreen__fileBox${isDragActive ? " is-dragActive" : ""}`}
                                onDragEnter={handleDragEnter}
                                onDragLeave={handleDragLeave}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div>{t('signing.upload.fileDropPrompt')}</div>
                                <div className="lw-uploadSigningScreen__fileHint">
                                    {t('signing.upload.fileHintPdfOnly')}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="lw-uploadSigningScreen__fileInput"
                                    onChange={handleFileChange}
                                    accept=".pdf"
                                />
                            </div>

                            {selectedFile && (
                                <div className="lw-uploadSigningScreen__fileName">
                                    {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                                </div>
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

                        {selectedFile && (
                            <>
                                <SimpleContainer className="lw-uploadSigningScreen__viewerHeaderRow">
                                    <h3 className="lw-uploadSigningScreen__viewerTitle">
                                        {t('signing.upload.viewerTitle')}
                                    </h3>

                                    <SecondaryButton onPress={handleDetectSpots} disabled={detecting}>
                                        {detecting ? t('signing.upload.detect.detecting') : t('signing.upload.detect.button')}
                                    </SecondaryButton>
                                </SimpleContainer>

                                <SimpleContainer className="lw-signing-pdfViewerWrapper">
                                    {Array.isArray(selectedSigners) && selectedSigners.length > 1 && (
                                        <SimpleContainer className="lw-uploadSigningScreen__signerSticky">
                                            <SimpleContainer className="lw-fieldTypeNavbar__signerRow">
                                                <span className="lw-fieldTypeNavbar__signerLabel">{t('signing.upload.signerSelectorLabel')}</span>
                                                <SimpleContainer className="lw-fieldTypeNavbar__signerButtons">
                                                    {selectedSigners.map((s) => {
                                                        const isSelected = Number(s?.UserId) === Number(selectedSignerId);
                                                        const Button = isSelected ? PrimaryButton : SecondaryButton;
                                                        return (
                                                            <Button
                                                                key={s?.UserId}
                                                                onPress={() => setSelectedSignerId(s?.UserId)}
                                                                className="lw-fieldTypeNavbar__signerButton"
                                                            >
                                                                {s?.Name || t('signing.signerFallback', { index: 1 })}
                                                            </Button>
                                                        );
                                                    })}
                                                </SimpleContainer>
                                            </SimpleContainer>
                                        </SimpleContainer>
                                    )}
                                    <FieldTypeNavbar
                                        selected={selectedFieldType}
                                        onSelect={setSelectedFieldType}
                                        fieldTypes={fieldTypeOptions}
                                    />
                                    <PdfViewer
                                        pdfFile={selectedFile}
                                        spots={signatureSpots}
                                        onUpdateSpot={handleUpdateSpot}
                                        onRemoveSpot={handleRemoveSpot}
                                        onRequestRemove={(i) => openConfirmRemove(i)}
                                        onSelectSpot={openFieldEditor}
                                        onRequestContext={handleSpotContext}
                                        onAddSpotForPage={handleAddSpotForPage}
                                        signers={selectedSigners}
                                        onPageChange={setCurrentPage}
                                    />
                                    <FloatingAddField
                                        onAdd={openAddFieldMenu}
                                        containerSelector=".lw-signing-pdfViewer"
                                        currentPage={currentPage}
                                    />
                                </SimpleContainer>

                                <div className="lw-uploadSigningScreen__infoText">
                                    <Text14>
                                        {t('signing.upload.spotHelpText')}
                                    </Text14>
                                </div>
                            </>
                        )}

                        <SimpleContainer className="lw-uploadSigningScreen__actionsRow">
                            <SecondaryButton
                                onPress={() => navigate(AdminStackName + SigningManagerScreenName)}
                            >
                                {t('common.back')}
                            </SecondaryButton>
                            <PrimaryButton onPress={handleSubmit} disabled={loading}>
                                {loading ? t('signing.upload.sending') : t('signing.upload.sendToClient')}
                            </PrimaryButton>
                        </SimpleContainer>

                        {loading && (
                            <SimpleContainer className="lw-uploadSigningScreen__loading">
                                <SimpleLoader />
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

            {message && (
                <div
                    className={`lw-uploadSigningScreen__message ${message.type === "error" ? "is-error" : "is-success"}`}
                    onClick={() => setMessage(null)}
                >
                    {message.text}
                </div>
            )}
        </SimpleScreen>
    );
}
