// src/components/SignatureCanvas.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import signingFilesApi from "../../../api/signingFilesApi";
import ApiUtils from "../../../api/apiUtils";
import PdfViewer from "./pdfViewer/PdfViewer";
import { useTranslation } from "react-i18next";
// OTP UI is driven by file.OtpEnabled / file.RequireOtp from the API
// (platform setting SIGNING_OTP_ENABLED), not a build-time feature flag.

import SimpleContainer from "../../simpleComponents/SimpleContainer";
import SimpleLoader from "../../simpleComponents/SimpleLoader";
import { Text12, Text14 } from "../../specializedComponents/text/AllTextKindFile";

import PrimaryButton from "../../styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../styledComponents/buttons/SecondaryButton";
import TertiaryButton from "../../styledComponents/buttons/TertiaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { colors } from "../../../constant/colors";

import "./signFiles.scss";
import { showAppToast } from "../../ui/showAppToast";
import "../../../screens/signingScreen/PublicSigningScreen.scss";

function uuidv4() {
    const cryptoObj = window.crypto || window.msCrypto;
    if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();

    try {
        const bytes = new Uint8Array(16);
        if (cryptoObj?.getRandomValues) cryptoObj.getRandomValues(bytes);
        else {
            for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        }

        // RFC4122 v4
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;

        const toHex = (n) => n.toString(16).padStart(2, "0");
        const hex = Array.from(bytes, toHex).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
        const rnd = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
        return `${rnd().slice(0, 8)}-${rnd().slice(0, 4)}-4${rnd().slice(0, 3)}-8${rnd().slice(0, 3)}-${rnd()}${rnd().slice(0, 4)}`;
    }
}

const SignatureCanvas = ({ signingFileId, publicToken, onClose, variant = "modal" }) => {
    const { t } = useTranslation();
    const canvasRef = useRef(null);
    const pdfScrollRef = useRef(null);
    const lastPointRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [fileDetails, setFileDetails] = useState(null);
    const [pdfFile, setPdfFile] = useState(null);
    const [pdfReady, setPdfReady] = useState(false);
    const [currentSpot, setCurrentSpot] = useState(null);
    const [saving, setSaving] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasUserDrawn, setHasUserDrawn] = useState(false);

    const [showAllSpots, setShowAllSpots] = useState(false);
    const [hasStartedNextFlow, setHasStartedNextFlow] = useState(false);

    const [savedSignature, setSavedSignature] = useState({
        loading: false,
        exists: false,
        url: null,
    });
    const [savedStamp, setSavedStamp] = useState({
        loading: false,
        exists: false,
        url: null,
    });
    // New: arrays of saved items for the merged "saved" tab
    const [savedSignatures, setSavedSignatures] = useState([]);
    const [savedStamps, setSavedStamps] = useState([]);
    const [savedItemsLoading, setSavedItemsLoading] = useState(false);
    const [signatureMode, setSignatureMode] = useState("draw"); // 'draw' | 'saved' | 'stamp' | 'savedStamp'

    // Court-ready: per-session identifier for audit trail + OTP binding.
    const signingSessionIdRef = useRef(uuidv4());
    const signingSessionId = signingSessionIdRef.current;

    const [consentAccepted, setConsentAccepted] = useState(false);
    const [showConsentUi, setShowConsentUi] = useState(true);
    const [otpRequested, setOtpRequested] = useState(false);
    const [otpCode, setOtpCode] = useState("");
    const [otpVerified, setOtpVerified] = useState(false);
    const [otpBusy, setOtpBusy] = useState(false);
    const otpAutoSentRef = useRef(false);
    const otpAutoVerifyRef = useRef(false);
    const otpLastFailedRef = useRef("");
    const otpResendAtRef = useRef(0);
    const otpInputRef = useRef(null);
    const [showCompletion, setShowCompletion] = useState(false);
    const [showOptionalRemaining, setShowOptionalRemaining] = useState(false);
    const [fieldValue, setFieldValue] = useState("");
    const [fieldChecked, setFieldChecked] = useState(false);
    const [clientStampFile, setClientStampFile] = useState(null);
    const [clientStampPreview, setClientStampPreview] = useState(null);
    const [stampSignPhase, setStampSignPhase] = useState(false); // true = drawing on top of stamp
    const [stampNormalizedDataUrl, setStampNormalizedDataUrl] = useState(null);
    const [showSpotPopup, setShowSpotPopup] = useState(false);
    const [selectedSavedItem, setSelectedSavedItem] = useState(null); // { type: 'signature'|'stamp', url, index }
    const [canvasClearSpinning, setCanvasClearSpinning] = useState(false);
    const autoOpenedFirstSpotRef = useRef(false);
    const signaturesCelebratedRef = useRef(false);
    const holdSignatureCompleteOverlayRef = useRef(false);
    const canvasClearSpinTimerRef = useRef(null);

    const getSignModeForSpotType = (type) => {
        const t0 = String(type || 'signature').toLowerCase();
        if (t0 === 'initials') return 'initials';
        if (t0 === 'signature') return 'signature';
        if (t0 === 'clientstamp') return 'clientStamp';
        return 'field';
    };

    const isPublic = Boolean(publicToken);

    const getActiveSpotForMode = (details, current) => {
        const canAct = (spot) => {
            if (!spot || spot.IsSigned) return false;
            const flag = spot?.CanSign ?? spot?.canSign;
            if (typeof flag === 'boolean') return flag;
            if (!isPublic) return true;
            const myId = details?.signerUserId ?? details?.SignerUserId;
            const spotSignerId = spot?.SignerUserId ?? spot?.signerUserId;
            if (myId == null || spotSignerId == null) return false;
            return Number(spotSignerId) === Number(myId);
        };
        if (canAct(current)) return current;
        const allSpots = (details?.signatureSpots || []).filter((s) => getSpotType(s) !== 'lawyerstamp');
        const unsignedRequired = getUnsignedRequiredSpots(allSpots);
        if (unsignedRequired.length > 0) return unsignedRequired[0];
        return null;
    };

    const isScreen = variant === "screen";
    // Server sets OtpEnabled from platform setting SIGNING_OTP_ENABLED.
    // Skip OTP when the document/signer is already complete (read-only success view).
    const fileStatusEarly = String(fileDetails?.file?.Status || fileDetails?.file?.status || "").toLowerCase();
    const alreadyComplete =
        fileDetails?.readOnly === true
        || fileDetails?.file?.ReadOnly === true
        || fileDetails?.signerCompleted === true
        || fileStatusEarly === "signed"
        || fileStatusEarly === "rejected";
    const otpEnabled = Boolean(fileDetails?.file?.OtpEnabled);
    const otpRequired = otpEnabled && Boolean(fileDetails?.file?.RequireOtp) && !alreadyComplete;

    const consentStorageKey = useMemo(() => {
        const keyPart = isPublic
            ? `public:${String(publicToken || "")}`
            : `file:${String(signingFileId || "")}`;
        return `lw_signing_consent_accepted:${keyPart}`;
    }, [isPublic, publicToken, signingFileId]);

    const fieldValuesStorageKey = useMemo(() => {
        const keyPart = isPublic
            ? `public:${String(publicToken || "")}`
            : `file:${String(signingFileId || "")}`;
        return `lw_signing_field_values:${keyPart}`;
    }, [isPublic, publicToken, signingFileId]);

    // Production policy: rely on DB persistence for legal correctness.
    // Cache is DEV-only as a guardrail during rollout.
    const FIELD_VALUES_CACHE_ENABLED = process.env.NODE_ENV !== 'production';
    const FIELD_VALUES_CACHE_TTL_MS = 15 * 60 * 1000;

    const readFieldValuesCache = () => {
        if (!FIELD_VALUES_CACHE_ENABLED) return {};
        try {
            const raw = localStorage.getItem(fieldValuesStorageKey);
            const parsed = raw ? JSON.parse(raw) : null;
            const envelope = parsed && typeof parsed === 'object' ? parsed : null;
            const ts = Number(envelope?.ts || 0);
            if (!Number.isFinite(ts) || ts <= 0) return {};
            if (Date.now() - ts > FIELD_VALUES_CACHE_TTL_MS) return {};
            const values = envelope?.values;
            return values && typeof values === 'object' ? values : {};
        } catch {
            return {};
        }
    };

    const writeFieldValuesCache = (nextMap) => {
        if (!FIELD_VALUES_CACHE_ENABLED) return;
        try {
            localStorage.setItem(
                fieldValuesStorageKey,
                JSON.stringify({ ts: Date.now(), values: nextMap || {} })
            );
        } catch {
            // ignore
        }
    };

    const mergeFieldValuesFromCache = (details) => {
        if (!FIELD_VALUES_CACHE_ENABLED) return details;
        const cache = readFieldValuesCache();
        const spots = details?.signatureSpots;
        if (!Array.isArray(spots) || !spots.length) return details;

        const merged = spots.map((s) => {
            const id = s?.SignatureSpotId ?? s?.signatureSpotId;
            if (!id) return s;
            const type = String(s?.FieldType ?? s?.fieldType ?? s?.type ?? 'signature').toLowerCase();
            const isSig = type === 'signature' || type === 'initials';
            if (isSig) return s;

            const current = (s?.FieldValue ?? s?.fieldValue ?? s?.fieldvalue ?? '');
            const hasCurrent = String(current || '').trim().length > 0;
            if (hasCurrent) return s;

            const cached = cache[String(id)];
            if (cached == null || String(cached).trim().length === 0) return s;

            return { ...s, FieldValue: String(cached), fieldValue: String(cached) };
        });

        return { ...details, signatureSpots: merged };
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await ApiUtils.get("platform-settings/public");
                const raw = res?.data?.SHOW_PUBLIC_SIGNING_CONSENT;
                const enabled = !(raw === false || raw === "false" || raw === "0" || raw === 0);
                if (cancelled) return;
                setShowConsentUi(enabled);
                if (!enabled) setConsentAccepted(true);
            } catch {
                // Default: keep consent UI visible.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!showConsentUi) {
            setConsentAccepted(true);
            return;
        }
        try {
            const persisted = localStorage.getItem(consentStorageKey) === "true";
            setConsentAccepted(persisted);
        } catch {
            // ignore (private mode / blocked storage)
        }
    }, [consentStorageKey, showConsentUi]);

    useEffect(() => {
        if (!showConsentUi) setConsentAccepted(true);
    }, [showConsentUi]);

    const effectiveSigningFileId = useMemo(() => {
        return fileDetails?.file?.SigningFileId || signingFileId;
    }, [fileDetails, signingFileId]);

    const getSpotPage = (spot) => spot?.PageNumber ?? spot?.pageNum ?? spot?.pagenumber ?? 1;
    const getSpotY = (spot) => spot?.Y ?? spot?.y ?? 0;
    const isSpotRequired = (spot) => {
        const raw = spot?.IsRequired ?? spot?.isRequired;
        if (typeof raw === 'boolean') return raw;
        if (raw === true || raw === false || raw === 'true' || raw === 'false') {
            return raw === true || raw === 'true';
        }
        const type = getSpotType(spot);
        if (type === 'lawyerstamp') return false;
        // Default fillable fields to required (matches lawyer create defaults).
        return true;
    };
    const getInputTypeForField = (type) => {
        switch (type) {
            case 'email':
                return 'email';
            case 'phone':
                return 'tel';
            case 'date':
                return 'date';
            default:
                return 'text';
        }
    };
    const getInputPropsForField = (type) => {
        switch (type) {
            case 'phone':
                return { inputMode: 'numeric', pattern: '[0-9]*' };
            case 'number':
                return { inputMode: 'numeric', pattern: '[0-9]*' };
            case 'idnumber':
                return { inputMode: 'numeric', pattern: '[0-9]*' };
            case 'email':
                return { inputMode: 'email' };
            default:
                return {};
        }
    };
    const sanitizeFieldValue = (type, value) => {
        const raw = value == null ? '' : String(value);
        if (type === 'phone') {
            const trimmed = raw.trim();
            if (trimmed.startsWith('+')) {
                return `+${trimmed.slice(1).replace(/\D/g, '')}`;
            }
            return trimmed.replace(/\D/g, '');
        }
        if (type === 'number' || type === 'idnumber') {
            return raw.replace(/\D/g, '');
        }
        return raw.trim();
    };
    const validateFieldValue = (type, value) => {
        if (!value) return { ok: true };
        if (type === 'email') {
            const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            return emailOk ? { ok: true } : { ok: false, message: t('errors.invalidEmail') };
        }
        if (type === 'phone' || type === 'number' || type === 'idnumber') {
            const digitsOnly = /^[0-9]+$/.test(value);
            return digitsOnly ? { ok: true } : { ok: false, message: t('errors.numbersOnly') };
        }
        return { ok: true };
    };
    const getSpotType = (spot) => String(spot?.FieldType ?? spot?.fieldType ?? spot?.type ?? 'signature').toLowerCase();
    const getFieldTypeKey = (type) => {
        switch (type) {
            case 'idnumber':
                return 'idNumber';
            case 'clientstamp':
                return 'clientStamp';
            case 'lawyerstamp':
                return 'lawyerStamp';
            default:
                return type;
        }
    };
    const isSignatureLike = (spotType) => spotType === 'signature' || spotType === 'initials';

    const getSpotId = (spot) => {
        const n = Number(spot?.SignatureSpotId ?? spot?.signatureSpotId ?? spot?.id);
        return Number.isFinite(n) && n > 0 ? n : null;
    };
    const isSpotSigned = (spot) => Boolean(spot?.IsSigned ?? spot?.isSigned ?? spot?.issigned);

    const isMyActionableSpot = (spot) => {
        // Prefer explicit backend flag (public + authenticated details).
        const flag = spot?.CanSign ?? spot?.canSign ?? spot?.IsMine ?? spot?.isMine;
        if (typeof flag === 'boolean') return flag;
        const myId = fileDetails?.signerUserId ?? fileDetails?.SignerUserId;
        const spotSignerId = spot?.SignerUserId ?? spot?.signerUserId;
        if (isPublic) {
            // Public links: never treat another signer's spot as actionable when flags are missing.
            if (myId == null || spotSignerId == null) return false;
            return Number(spotSignerId) === Number(myId);
        }
        // Legacy authenticated responses without CanSign: allow unless clearly assigned to someone else.
        if (myId == null || spotSignerId == null) return true;
        return Number(spotSignerId) === Number(myId);
    };

    const getUnsignedRequiredSpots = (spots) => {
        const list = Array.isArray(spots) ? spots : [];
        return list.filter((s) => isSpotRequired(s) && isMyActionableSpot(s) && !isSpotSigned(s));
    };

    const getUnsignedOptionalSpots = (spots) => {
        const list = Array.isArray(spots) ? spots : [];
        return list.filter((s) => !isSpotRequired(s) && !isSpotSigned(s) && isMyActionableSpot(s));
    };

    const focusNextUnsignedSpot = () => {
        const allSpots = (fileDetails?.signatureSpots || []).filter((s) => getSpotType(s) !== 'lawyerstamp');
        const unsignedRequired = getUnsignedRequiredSpots(allSpots);
        const target = (!currentSpot || currentSpot.IsSigned) ? (unsignedRequired[0] || null) : currentSpot;
        if (target) {
            setCurrentSpot(target);
            scrollToSpot(target);
            setHasStartedNextFlow(true);
        }
        return target;
    };

    const findScrollableAncestor = (el) => {
        let cur = el;
        while (cur && cur !== document.body) {
            if (cur.scrollHeight > cur.clientHeight + 2) return cur;
            cur = cur.parentElement;
        }
        return pdfScrollRef.current || document.scrollingElement || document.documentElement;
    };

    const scrollToSpot = (spot, attempt = 0) => {
        if (!spot) return;
        const pageNum = Number(getSpotPage(spot) || 1);
        const hintedContainer = pdfScrollRef.current;

        const root = hintedContainer || document;
        const pageEl = root.querySelector
            ? root.querySelector(`[data-page-number="${pageNum}"]`)
            : null;

        if (!pageEl) {
            if (attempt < 15) setTimeout(() => scrollToSpot(spot, attempt + 1), 100);
            return;
        }

        const container =
            hintedContainer && hintedContainer.scrollHeight > hintedContainer.clientHeight + 2
                ? hintedContainer
                : findScrollableAncestor(pageEl);

        const pageRect = pageEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect
            ? container.getBoundingClientRect()
            : { top: 0 };

        const pageTopWithinContainer = pageRect.top - containerRect.top + (container.scrollTop || 0);
        const pageWidth = pageRect.width || 800;
        const scale = pageWidth / 800;
        const y = Number(getSpotY(spot) || 0) * scale;

        const targetTop = Math.max(0, pageTopWithinContainer + y - 120);
        if (typeof container.scrollTo === "function") {
            container.scrollTo({ top: targetTop, behavior: "smooth" });
        } else {
            container.scrollTop = targetTop;
        }
    };

    const loadPdfFromFileKey = async (fileIdForPdf) => {
        try {
            const baseUrl = ApiUtils?.defaults?.baseURL || "";
            const token = localStorage.getItem("token");
            const url = isPublic
                ? `${baseUrl}/SigningFiles/public/${encodeURIComponent(publicToken)}/pdf`
                : `${baseUrl}/SigningFiles/${encodeURIComponent(fileIdForPdf || signingFileId)}/pdf`;

            const headers = {
                "x-signing-session-id": signingSessionId,
            };
            if (!isPublic && token) {
                headers.Authorization = `Bearer ${token}`;
            }

            const res = await fetch(url, {
                method: "GET",
                headers,
            });
            if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
            const blob = await res.blob();
            setPdfFile(blob);
        } catch (err) {
            console.error("Failed to load PDF", err);
            setPdfFile(null);
        }
    };

    const refreshSavedSignature = async () => {
        try {
            const res = isPublic
                ? await signingFilesApi.getPublicSavedSignature(publicToken)
                : await signingFilesApi.getSavedSignature();
            unwrapApi(res);
            const data = res?.data;
            setSavedSignature({
                loading: false,
                exists: Boolean(data?.exists),
                url: data?.url || null,
            });
        } catch (err) {
            console.warn("Failed to refresh saved signature", err);
            setSavedSignature({ loading: false, exists: false, url: null });
        }
    };

    const refreshSavedStamp = async () => {
        try {
            const res = isPublic
                ? await signingFilesApi.getPublicSavedStamp(publicToken)
                : await signingFilesApi.getSavedStamp();
            unwrapApi(res);
            const data = res?.data;
            setSavedStamp({
                loading: false,
                exists: Boolean(data?.exists),
                url: data?.url || null,
            });
        } catch (err) {
            console.warn("Failed to refresh saved stamp", err);
            setSavedStamp({ loading: false, exists: false, url: null });
        }
    };

    const refreshSavedItems = async () => {
        try {
            setSavedItemsLoading(true);
            const res = isPublic
                ? await signingFilesApi.listPublicSavedItems(publicToken)
                : await signingFilesApi.listSavedItems();
            unwrapApi(res);
            const data = res?.data || {};
            setSavedSignatures(data.signatures || []);
            setSavedStamps(data.stamps || []);
            // Also update legacy single-item state for backward compat
            const sigs = data.signatures || [];
            const stamps = data.stamps || [];
            setSavedSignature({
                loading: false,
                exists: sigs.length > 0,
                url: sigs[0]?.url || null,
            });
            setSavedStamp({
                loading: false,
                exists: stamps.length > 0,
                url: stamps[0]?.url || null,
            });
        } catch (err) {
            console.warn("Failed to refresh saved items", err);
            setSavedSignatures([]);
            setSavedStamps([]);
        } finally {
            setSavedItemsLoading(false);
        }
    };

    const deleteSavedItem = async (type, index) => {
        try {
            const res = isPublic
                ? await signingFilesApi.deletePublicSavedItem(publicToken, type, index)
                : await signingFilesApi.deleteSavedItem(type, index);
            unwrapApi(res);
            showAppToast({ type: "success", text: t("signing.canvas.deleteSavedSuccess") });
            await refreshSavedItems();
        } catch (err) {
            console.error("Failed to delete saved item", err);
            showAppToast({ type: "error", text: t("signing.canvas.deleteSavedError") });
        }
    };

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            try {
                setLoading(true);
                setPdfReady(false);
                setPdfFile(null);

                // Restore consent from localStorage; OTP state is per session.
                try {
                    const persisted = localStorage.getItem(consentStorageKey) === "true";
                    setConsentAccepted(persisted);
                } catch { setConsentAccepted(false); }
                setOtpRequested(false);
                setOtpCode("");
                setOtpVerified(false);
                otpAutoSentRef.current = false;

                const res = isPublic
                    ? await signingFilesApi.getPublicSigningFileDetails(publicToken)
                    : await signingFilesApi.getSigningFileDetails(signingFileId);
                unwrapApi(res);
                const data = res?.data;
                if (!isMounted) return;
                setFileDetails(mergeFieldValuesFromCache(data));
                // Spec: first interaction jumps to first required spot.
                setCurrentSpot(null);
                setHasStartedNextFlow(false);
                autoOpenedFirstSpotRef.current = false;
                signaturesCelebratedRef.current = false;
                holdSignatureCompleteOverlayRef.current = false;
                const fileStatus = String(data?.file?.Status || data?.file?.status || "").toLowerCase();
                const readOnly = data?.readOnly === true
                    || data?.file?.ReadOnly === true
                    || data?.signerCompleted === true
                    || fileStatus === "signed"
                    || fileStatus === "rejected";
                if (readOnly || fileStatus === "signed" || data?.signerCompleted === true) {
                    setShowCompletion(true);
                    setOtpVerified(true);
                }
                const fileIdForPdf = data?.file?.SigningFileId || signingFileId;
                await loadPdfFromFileKey(fileIdForPdf);
            } catch (err) {
                console.error("Failed to fetch file details", err);
                if (isMounted) showAppToast({ type: "error", text: t("signing.canvas.loadDocumentError") });
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        load();
        return () => {
            isMounted = false;
            if (canvasClearSpinTimerRef.current) {
                clearTimeout(canvasClearSpinTimerRef.current);
                canvasClearSpinTimerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signingFileId, isPublic, publicToken]);

    // Public/signing link: auto-open the first required signature spot once the PDF is ready.
    useEffect(() => {
        if (!isScreen || !pdfReady || !fileDetails || autoOpenedFirstSpotRef.current) return;

        const fileStatus = String(fileDetails?.file?.Status || fileDetails?.file?.status || "").toLowerCase();
        const locked = fileDetails?.readOnly === true
            || fileDetails?.file?.ReadOnly === true
            || fileDetails?.signerCompleted === true
            || fileStatus === "signed"
            || fileStatus === "rejected"
            || showCompletion;
        if (locked) return;

        const allSpots = (fileDetails?.signatureSpots || []).filter((s) => getSpotType(s) !== 'lawyerstamp');
        const unsignedRequired = getUnsignedRequiredSpots(allSpots);
        const remainingSigs = unsignedRequired.filter((s) => isSignatureLike(getSpotType(s))).length;
        // Signatures already done: completion overlay offers continue-to-fields. Don't auto-open a field pad.
        if (unsignedRequired.length === 0 || remainingSigs === 0) return;

        autoOpenedFirstSpotRef.current = true;
        const first = unsignedRequired[0];
        setCurrentSpot(first);
        setHasStartedNextFlow(true);
        setShowSpotPopup(true);
        const t = setTimeout(() => scrollToSpot(first), 80);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isScreen, pdfReady, fileDetails, showCompletion]);

    // Celebrate when signatures are done (even if data fields remain).
    useEffect(() => {
        if (!fileDetails || loading || showCompletion) return;
        const allSpots = (fileDetails?.signatureSpots || []).filter((s) => getSpotType(s) !== 'lawyerstamp');
        const unsignedRequired = getUnsignedRequiredSpots(allSpots);
        const remainingSigs = unsignedRequired.filter((s) => isSignatureLike(getSpotType(s))).length;
        if (remainingSigs > 0) return;

        if (unsignedRequired.length > 0) {
            if (holdSignatureCompleteOverlayRef.current) {
                setShowCompletion(true);
                setShowSpotPopup(false);
                setCurrentSpot(null);
                return;
            }
            if (signaturesCelebratedRef.current) return;
            signaturesCelebratedRef.current = true;
            holdSignatureCompleteOverlayRef.current = true;
            setShowSpotPopup(false);
            setShowOptionalRemaining(false);
            setShowCompletion(true);
            setCurrentSpot(null);
            return;
        }

        const unsignedOptional = getUnsignedOptionalSpots(allSpots);
        if (unsignedOptional.length > 0) {
            if (!showOptionalRemaining) {
                setShowSpotPopup(false);
                setShowOptionalRemaining(true);
            }
            return;
        }
        const fileStatus = String(fileDetails?.file?.Status || fileDetails?.file?.status || "").toLowerCase();
        const locked = fileDetails?.readOnly === true
            || fileDetails?.file?.ReadOnly === true
            || fileDetails?.signerCompleted === true
            || fileStatus === "signed"
            || fileStatus === "rejected";
        if (locked || allSpots.length > 0) {
            setShowSpotPopup(false);
            setShowOptionalRemaining(false);
            setShowCompletion(true);
            setCurrentSpot(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fileDetails, loading, showCompletion, showOptionalRemaining]);

    useEffect(() => {
        setSavedSignature((p) => ({ ...p, loading: true }));
        setSavedStamp((p) => ({ ...p, loading: true }));
        refreshSavedItems();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPublic, publicToken]);

    useEffect(() => {
        if (savedSignature.loading || savedStamp.loading || savedItemsLoading) return;

        const activeSpot = getActiveSpotForMode(fileDetails, currentSpot);
        const activeSpotType = activeSpot ? getSpotType(activeSpot) : 'signature';
        const signMode = getSignModeForSpotType(activeSpotType);

        // Always start with a blank "new signature" canvas.
        // Saved signature / stamp remain available via their tabs.
        if (signMode === 'clientStamp') {
            setSignatureMode('stamp');
            return;
        }
        setSignatureMode('draw');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedSignature.exists, savedSignature.loading, savedStamp.exists, savedStamp.loading, savedItemsLoading, savedSignatures.length, savedStamps.length, currentSpot, fileDetails]);

    useEffect(() => {
        if (signatureMode !== 'saved') return;
        if (selectedSavedItem) return;
        if (savedSignatures.length > 0) {
            const item = savedSignatures[0];
            setSelectedSavedItem({ type: 'signature', url: item.url, index: item.index });
            return;
        }
        if (savedStamps.length > 0) {
            const item = savedStamps[0];
            setSelectedSavedItem({ type: 'stamp', url: item.url, index: item.index });
        }
    }, [signatureMode, savedSignatures, savedStamps, selectedSavedItem]);

    useEffect(() => {
        if (currentSpot && canvasRef.current) {
            const canvas = canvasRef.current;
            canvas.width = 400;
            canvas.height = 180;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!stampSignPhase) {
                ctx.fillStyle = "#999";
                ctx.font = "12px Arial";
                ctx.textAlign = "center";
                ctx.fillText(t("signing.canvas.signHere"), canvas.width / 2, canvas.height / 2);
            }
            setHasUserDrawn(false);
            lastPointRef.current = null;
        }
    }, [currentSpot, stampSignPhase]);

    useEffect(() => {
        if (!currentSpot) return;
        const value = currentSpot?.FieldValue ?? currentSpot?.fieldValue ?? "";
        const type = getSpotType(currentSpot);
        if (type === 'checkbox') {
            const truthy = value === true || value === 'true' || value === 1 || value === '1' || value === 'yes' || value === '✓';
            setFieldChecked(Boolean(truthy));
            setFieldValue(truthy ? 'true' : '');
        } else if (type === 'date' && !value) {
            // Auto-fill today's date for empty date fields
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            setFieldValue(`${y}-${m}-${d}`);
            setFieldChecked(false);
        } else {
            setFieldValue(String(value || ""));
            setFieldChecked(false);
        }
    }, [currentSpot]);

    const getClientPointOnCanvas = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const clientX = e?.clientX ?? e?.touches?.[0]?.clientX;
        const clientY = e?.clientY ?? e?.touches?.[0]?.clientY;
        if (clientX == null || clientY == null) return null;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startDrawing = (e) => {
        if (!canvasRef.current || !currentSpot || currentSpot.IsSigned) return;
        if (typeof e?.preventDefault === "function") e.preventDefault();

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        setIsDrawing(true);
        try {
            if (typeof canvas.setPointerCapture === "function" && e?.pointerId != null) {
                canvas.setPointerCapture(e.pointerId);
            }
        } catch {
            // ignore
        }

        if (!hasUserDrawn) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHasUserDrawn(true);
        }

        const point = getClientPointOnCanvas(e);
        if (!point) return;

        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        lastPointRef.current = point;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
    };

    const drawMove = (e) => {
        if (!isDrawing || !canvasRef.current) return;
        if (typeof e?.preventDefault === "function") e.preventDefault();
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const point = getClientPointOnCanvas(e);
        if (!point) return;
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        lastPointRef.current = point;
    };

    const endDrawing = (e) => {
        setIsDrawing(false);
        lastPointRef.current = null;
        try {
            const canvas = canvasRef.current;
            if (canvas && typeof canvas.releasePointerCapture === "function" && e?.pointerId != null) {
                canvas.releasePointerCapture(e.pointerId);
            }
        } catch {
            // ignore
        }
    };

    const clearCanvas = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#999";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(t("signing.canvas.signHere"), canvas.width / 2, canvas.height / 2);
        setHasUserDrawn(false);
    };

    const handleClearCanvasClick = () => {
        if (saving || !hasUserDrawn) return;
        if (canvasClearSpinTimerRef.current) {
            clearTimeout(canvasClearSpinTimerRef.current);
            canvasClearSpinTimerRef.current = null;
        }
        // Retrigger CSS animation even on rapid taps.
        setCanvasClearSpinning(false);
        requestAnimationFrame(() => {
            setCanvasClearSpinning(true);
            clearCanvas();
            canvasClearSpinTimerRef.current = setTimeout(() => {
                setCanvasClearSpinning(false);
                canvasClearSpinTimerRef.current = null;
            }, 550);
        });
    };

    const getApiErrorMessage = (err) => {
        const msg = err?.response?.data?.message || err?.data?.message || err?.message;
        if (!msg) return null;
        const s = String(msg);
        // Only use the API message if it contains Hebrew characters (user-facing),
        // otherwise fall back to the translated string from the caller.
        if (/[\u0590-\u05FF]/.test(s)) return s;
        return null;
    };

    const resetOtpAfterServerReject = (err) => {
        const code = err?.response?.data?.errorCode
            || err?.data?.errorCode
            || err?.data?.code
            || err?.response?.data?.code;
        const msg = String(
            err?.response?.data?.message
            || err?.data?.message
            || err?.message
            || ""
        );
        const isOtpRequired = code === "OTP_REQUIRED"
            || /OTP_REQUIRED/i.test(msg)
            || /אימות בקוד חד/.test(msg);
        if (!isOtpRequired) return false;

        // Hard re-auth only when the challenge is gone/expired — not on every field submit.
        const hardReset = code === "OTP_EXPIRED"
            || code === "OTP_NOT_FOUND"
            || /OTP_EXPIRED/i.test(msg)
            || /OTP_NOT_FOUND/i.test(msg)
            || /פג תוקף/.test(msg);

        if (!hardReset && otpVerified) {
            // Keep the verified session; avoid SMS re-send loop.
            return true;
        }

        setOtpVerified(false);
        setOtpRequested(false);
        setOtpCode("");
        if (hardReset) {
            otpAutoSentRef.current = false;
        }
        otpLastFailedRef.current = "";
        otpAutoVerifyRef.current = false;
        return true;
    };

    const unwrapApi = (res) => {
        if (res?.success === false) {
            const rawMsg = res?.data?.message || res?.message || '';
            const msg = /[\u0590-\u05FF]/.test(rawMsg) ? rawMsg : t("errors.unexpected");
            const err = new Error(msg);
            err.data = res?.data || null;
            err.response = { data: res?.data || { message: rawMsg, errorCode: res?.data?.errorCode } };
            throw err;
        }
        return res;
    };

    const normalizeSignatureDataUrl = async (dataUrl) => {
        const raw = String(dataUrl || "");
        if (!raw.startsWith("data:image/")) return raw;

        const img = new Image();
        const loaded = new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(t("signing.canvas.failedToLoadSignatureImage")));
        });
        img.src = raw;
        await loaded;

        const iw0 = img.naturalWidth || 1;
        const ih0 = img.naturalHeight || 1;

        // Trim transparent margins so letterboxed empty PNG space does not shrink ink.
        const measure = document.createElement("canvas");
        measure.width = iw0;
        measure.height = ih0;
        const mctx = measure.getContext("2d", { willReadFrequently: true });
        if (!mctx) return raw;
        mctx.clearRect(0, 0, iw0, ih0);
        mctx.drawImage(img, 0, 0);
        let sx = 0;
        let sy = 0;
        let sw = iw0;
        let sh = ih0;
        try {
            const data = mctx.getImageData(0, 0, iw0, ih0).data;
            let minX = iw0;
            let minY = ih0;
            let maxX = -1;
            let maxY = -1;
            for (let y = 0; y < ih0; y += 1) {
                for (let x = 0; x < iw0; x += 1) {
                    const a = data[(y * iw0 + x) * 4 + 3];
                    if (a > 8) {
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (maxX >= minX && maxY >= minY) {
                sx = minX;
                sy = minY;
                sw = Math.max(1, maxX - minX + 1);
                sh = Math.max(1, maxY - minY + 1);
            }
        } catch {
            // Cross-origin / tainted canvas — keep full image.
        }

        const targetW = 400;
        const targetH = 180;
        const c = document.createElement("canvas");
        c.width = targetW;
        c.height = targetH;
        const ctx = c.getContext("2d");
        if (!ctx) return raw;

        ctx.clearRect(0, 0, targetW, targetH);
        // Cover-fit trimmed ink into storage canvas (slight crop OK).
        const scale = Math.max(targetW / sw, targetH / sh);
        const drawW = Math.max(1, Math.round(sw * scale));
        const drawH = Math.max(1, Math.round(sh * scale));
        const dx = Math.round((targetW - drawW) / 2);
        const dy = Math.round((targetH - drawH) / 2);

        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, drawW, drawH);
        return c.toDataURL("image/png");
    };

    /**
     * Stamp: cover-crop into a landscape stamp canvas so phone screenshots / tall
     * photos fill the field instead of appearing as a tiny vertical strip.
     */
    const normalizeStampDataUrl = async (dataUrl) => {
        const raw = String(dataUrl || "");
        if (!raw.startsWith("data:image/")) return raw;

        const img = new Image();
        const loaded = new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(t("signing.canvas.failedToLoadSignatureImage")));
        });
        img.src = raw;
        await loaded;

        const iw = Math.max(1, img.naturalWidth || 1);
        const ih = Math.max(1, img.naturalHeight || 1);
        const TARGET_W = 560;
        const TARGET_H = 280;
        // Cover-fit: scale up enough to fill the stamp box, then center-crop.
        const scale = Math.max(TARGET_W / iw, TARGET_H / ih);
        const drawW = Math.max(1, Math.round(iw * scale));
        const drawH = Math.max(1, Math.round(ih * scale));
        const dx = Math.round((TARGET_W - drawW) / 2);
        const dy = Math.round((TARGET_H - drawH) / 2);

        const c = document.createElement("canvas");
        c.width = TARGET_W;
        c.height = TARGET_H;
        const ctx = c.getContext("2d");
        if (!ctx) return raw;
        ctx.clearRect(0, 0, TARGET_W, TARGET_H);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, dx, dy, drawW, drawH);
        // Always strip letterbox so saved stamps stay transparent in PDF.
        return removeImageBackground(c.toDataURL("image/png"));
    };

    const fetchSavedItemDataUrl = async (savedItem) => {
        if (!savedItem || savedItem.type == null || savedItem.index == null) return null;
        const res = isPublic
            ? await signingFilesApi.getPublicSavedItemDataUrl(publicToken, savedItem.type, savedItem.index)
            : await signingFilesApi.getSavedItemDataUrl(savedItem.type, savedItem.index);
        unwrapApi(res);
        const rawDataUrl = res?.data?.dataUrl;
        if (!rawDataUrl) return null;
        return normalizeSignatureDataUrl(rawDataUrl);
    };

    const saveSignatureAsDefault = async (dataUrl) => {
        if (!dataUrl) return;
        if (isPublic) {
            await signingFilesApi.savePublicSavedSignature(publicToken, dataUrl);
        } else {
            await signingFilesApi.saveSavedSignature(dataUrl);
        }
        await refreshSavedItems();
    };

    const saveStampAsDefault = async (dataUrl) => {
        if (!dataUrl) return;
        try {
            if (isPublic) {
                await signingFilesApi.savePublicSavedStamp(publicToken, dataUrl);
            } else {
                await signingFilesApi.saveSavedStamp(dataUrl);
            }
            await refreshSavedItems();
        } catch (err) {
            console.warn("Failed to save stamp as default", err);
        }
    };

    const signCurrentSpotWithImage = async (dataUrl, spotOverride = null) => {
        const spot = spotOverride || currentSpot;
        if (!spot || spot.IsSigned) return false;

        const spotType = getSpotType(spot);
        if (!isSignatureLike(spotType) && spotType !== 'clientstamp') return false;

        const requireOtp = otpRequired;
        const consentVersion = String(fileDetails?.file?.SigningPolicyVersion || "2026-01-11");

        if (!consentAccepted) {
            showAppToast({ type: "warning", text: t("signing.canvas.consentRequired") });
            return false;
        }
        if (requireOtp && !otpVerified) {
            showAppToast({ type: "warning", text: t("signing.canvas.otpRequired") });
            return false;
        }

        const config = { headers: { "x-signing-session-id": signingSessionId } };

        if (isPublic) {
            const res = await signingFilesApi.publicSignFile(
                publicToken,
                {
                    signatureSpotId: spot.SignatureSpotId,
                    signatureImage: dataUrl,
                    signingSessionId,
                    consentAccepted: true,
                    consentVersion,
                },
                config
            );
            unwrapApi(res);
        } else {
            const res = await signingFilesApi.signFile(
                effectiveSigningFileId,
                {
                    signatureSpotId: spot.SignatureSpotId,
                    signatureImage: dataUrl,
                    signingSessionId,
                    consentAccepted: true,
                    consentVersion,
                },
                config
            );
            unwrapApi(res);
        }

        return true;
    };

    const signCurrentSpotWithValue = async (value, spotOverride = null) => {
        const spot = spotOverride || currentSpot;
        if (!spot || spot.IsSigned) return false;

        const spotType = getSpotType(spot);
        if (isSignatureLike(spotType)) return false;

        const requireOtp = otpRequired;
        const consentVersion = String(fileDetails?.file?.SigningPolicyVersion || "2026-01-11");

        if (!consentAccepted) {
            showAppToast({ type: "warning", text: t("signing.canvas.consentRequired") });
            return false;
        }
        if (requireOtp && !otpVerified) {
            showAppToast({ type: "warning", text: t("signing.canvas.otpRequired") });
            return false;
        }

        const cleaned = sanitizeFieldValue(spotType, value);
        if (isSpotRequired(spot) && !cleaned) {
            showAppToast({ type: "warning", text: t("signing.canvas.fieldRequired") });
            return false;
        }

        const config = { headers: { "x-signing-session-id": signingSessionId } };

        if (isPublic) {
            const res = await signingFilesApi.publicSignFile(
                publicToken,
                {
                    signatureSpotId: spot.SignatureSpotId,
                    fieldValue: cleaned,
                    signingSessionId,
                    consentAccepted: true,
                    consentVersion,
                },
                config
            );
            unwrapApi(res);
        } else {
            const res = await signingFilesApi.signFile(
                effectiveSigningFileId,
                {
                    signatureSpotId: spot.SignatureSpotId,
                    fieldValue: cleaned,
                    signingSessionId,
                    consentAccepted: true,
                    consentVersion,
                },
                config
            );
            unwrapApi(res);
        }

        return true;
    };

    const advanceAfterSpotsChange = (spots, { quiet = false } = {}) => {
        const unsignedRequired = getUnsignedRequiredSpots(spots);
        const unsignedOptional = getUnsignedOptionalSpots(spots);
        if (unsignedRequired.length > 0) {
            const remainingSigs = unsignedRequired.filter((s) => isSignatureLike(getSpotType(s))).length;
            const remainingFields = unsignedRequired.length - remainingSigs;
            // All signatures done, data fields still open: celebrate, then let them continue.
            if (remainingSigs === 0) {
                if (!signaturesCelebratedRef.current) {
                    signaturesCelebratedRef.current = true;
                    holdSignatureCompleteOverlayRef.current = true;
                    setShowOptionalRemaining(false);
                    setShowCompletion(true);
                    setShowSpotPopup(false);
                    setCurrentSpot(null);
                    return;
                }
                // Reload after the last signature must not steal the overlay.
                if (holdSignatureCompleteOverlayRef.current) {
                    setShowCompletion(true);
                    setShowSpotPopup(false);
                    setCurrentSpot(null);
                    return;
                }
            }
            const next = unsignedRequired[0];
            const fromPage = Number(getSpotPage(currentSpot) || 1);
            const toPage = Number(getSpotPage(next) || 1);
            setShowOptionalRemaining(false);
            setShowCompletion(false);
            setCurrentSpot(next);
            scrollToSpot(next);
            setHasStartedNextFlow(true);
            if (isScreen) setShowSpotPopup(true);
            // Multi-page docs: make it obvious another canvas remains (empty pad ≠ finished).
            if (!quiet) {
                const nextIsSignature = isSignatureLike(getSpotType(next));
                if (unsignedRequired.length === 1) {
                    showAppToast({
                        type: "info",
                        text: nextIsSignature
                            ? t("signing.canvas.oneSignatureRemainingOnPage", { page: toPage })
                            : t("signing.canvas.oneFieldRemainingOnPage", { page: toPage }),
                    });
                } else if (toPage !== fromPage) {
                    showAppToast({
                        type: "info",
                        text: remainingSigs > 0 && remainingFields === 0
                            ? t("signing.canvas.nextSignatureOnPage", { count: remainingSigs, page: toPage })
                            : remainingSigs === 0
                                ? t("signing.canvas.nextFieldOnPage", { count: remainingFields, page: toPage })
                                : t("signing.canvas.remainingSignaturesAndFields", {
                                    signatures: remainingSigs,
                                    fields: remainingFields,
                                }),
                    });
                }
            }
            return;
        }
        if (unsignedOptional.length > 0) {
            const next = unsignedOptional[0];
            setShowCompletion(false);
            setShowOptionalRemaining(true);
            setCurrentSpot(next);
            scrollToSpot(next);
            setHasStartedNextFlow(true);
            // Keep session open; do not navigate away. Popup stays available to fill optionals.
            if (isScreen) setShowSpotPopup(false);
            setSelectedSavedItem(null);
            return;
        }
        if (isScreen) setShowSpotPopup(false);
        setSelectedSavedItem(null);
        setShowOptionalRemaining(false);
        if (spots.length > 0) {
            setShowCompletion(true);
        }
        setCurrentSpot(null);
    };

    /** Mark spots signed in local state immediately so remaining/finish UI don't wait on slow reload. */
    const applyOptimisticSignedSpots = (spotIds, previewDataUrl = null) => {
        const idSet = new Set(
            (Array.isArray(spotIds) ? spotIds : [])
                .map((id) => Number(id))
                .filter((n) => Number.isFinite(n) && n > 0)
        );
        if (idSet.size === 0) return null;

        let nextSpots = null;
        setFileDetails((prev) => {
            if (!prev?.signatureSpots) return prev;
            nextSpots = prev.signatureSpots.map((s) => {
                const id = Number(s?.SignatureSpotId ?? s?.signatureSpotId);
                if (!idSet.has(id)) return s;
                return {
                    ...s,
                    IsSigned: true,
                    SignatureUrl: previewDataUrl || s.SignatureUrl || s.signatureUrl || null,
                    signatureUrl: previewDataUrl || s.signatureUrl || s.SignatureUrl || null,
                };
            });
            return { ...prev, signatureSpots: nextSpots };
        });
        return nextSpots;
    };

    const reloadDetailsAndAdvance = async ({ optimisticSpotIds = null, previewDataUrl = null } = {}) => {
        // Finish / next-spot UI immediately from optimistic state when possible.
        if (optimisticSpotIds) {
            const optimisticSpots = applyOptimisticSignedSpots(optimisticSpotIds, previewDataUrl);
            if (optimisticSpots) {
                advanceAfterSpotsChange(optimisticSpots);
            }
        }

        const res = isPublic
            ? await signingFilesApi.getPublicSigningFileDetails(publicToken)
            : await signingFilesApi.getSigningFileDetails(effectiveSigningFileId);
        unwrapApi(res);
        const data = res?.data;
        const mergedData = mergeFieldValuesFromCache(data);
        setFileDetails(mergedData);

        const spots = mergedData?.signatureSpots || [];
        // Reconcile with server (quiet if we already advanced optimistically).
        advanceAfterSpotsChange(spots, { quiet: Boolean(optimisticSpotIds) });
        clearCanvas();
    };

    const saveSignature = async () => {
        if (!canvasRef.current || !currentSpot || currentSpot.IsSigned) return;
        setSaving(true);
        try {
            if (!hasUserDrawn) {
                const spotType = getSpotType(currentSpot);
                const signMode = getSignModeForSpotType(spotType);
                showAppToast({
                    type: "error",
                    text: signMode === 'initials'
                        ? t("signing.canvas.pleaseInitialBeforeSave")
                        : t("signing.canvas.pleaseSignBeforeSave"),
                });
                return;
            }

            const dataUrl = canvasRef.current.toDataURL("image/png");
            const didSign = await signCurrentSpotWithImage(dataUrl);
            if (!didSign) return;
            const spotType = getSpotType(currentSpot);
            const signMode = getSignModeForSpotType(spotType);

            // Spec: initials are a minimal flow: do NOT touch saved signature library.
            if (signMode === 'signature') {
                // Spec: new signature overwrites saved signature
                await saveSignatureAsDefault(dataUrl);
            }

            showAppToast({
                type: "success",
                text: signMode === 'initials'
                    ? t("signing.canvas.initialsSavedSuccess")
                    : t("signing.canvas.signatureSavedSuccess"),
            });
            await reloadDetailsAndAdvance({
                optimisticSpotIds: [currentSpot.SignatureSpotId],
                previewDataUrl: dataUrl,
            });
            return true;
        } catch (err) {
            console.error("Failed to save signature", err);
            resetOtpAfterServerReject(err);
            const spotType = currentSpot ? getSpotType(currentSpot) : 'signature';
            const signMode = getSignModeForSpotType(spotType);
            showAppToast({
                type: "error",
                text: getApiErrorMessage(err) || (signMode === 'initials'
                    ? t("signing.canvas.initialsSaveError")
                    : t("signing.canvas.signatureSaveError")),
            });
        } finally {
            setSaving(false);
        }
        return false;
    };

    const signOnly = async () => {
        if (!canvasRef.current || !currentSpot || currentSpot.IsSigned) return;
        setSaving(true);
        try {
            if (!hasUserDrawn) {
                showAppToast({ type: "error", text: t("signing.canvas.pleaseSignBeforeSave") });
                return;
            }

            const dataUrl = canvasRef.current.toDataURL("image/png");
            const didSign = await signCurrentSpotWithImage(dataUrl);
            if (!didSign) return;

            const spotType = getSpotType(currentSpot);
            const signMode = getSignModeForSpotType(spotType);
            // Auto-save newly drawn signatures (sign + sign-all); initials stay ephemeral.
            if (signMode === 'signature') {
                await saveSignatureAsDefault(dataUrl);
            }

            showAppToast({ type: "success", text: t("signing.canvas.signatureSavedSuccess") });
            await reloadDetailsAndAdvance({
                optimisticSpotIds: [currentSpot.SignatureSpotId],
                previewDataUrl: dataUrl,
            });
            return true;
        } catch (err) {
            console.error("Failed to sign", err);
            resetOtpAfterServerReject(err);
            showAppToast({ type: "error", text: getApiErrorMessage(err) || t("signing.canvas.signatureSaveError") });
        } finally {
            setSaving(false);
        }
        return false;
    };

    const saveFieldValue = async () => {
        if (!currentSpot || currentSpot.IsSigned || currentSpotIsSignature) return;
        setSaving(true);
        try {
            const rawValue = currentSpotType === 'checkbox' ? (fieldChecked ? 'true' : '') : fieldValue;
            const sanitized = sanitizeFieldValue(currentSpotType, rawValue);
            if (sanitized !== rawValue && currentSpotType !== 'checkbox') {
                setFieldValue(sanitized);
            }
            const validation = validateFieldValue(currentSpotType, sanitized);
            if (!validation.ok) {
                showAppToast({ type: 'error', text: validation.message || t('errors.unexpected') });
                return;
            }
            const didSign = await signCurrentSpotWithValue(sanitized);
            if (!didSign) return;

            // Persist: keep field values visible across refresh even if backend is temporarily missing FieldValue.
            try {
                const id = currentSpot?.SignatureSpotId;
                if (id && sanitized && String(sanitized).trim().length > 0) {
                    const existing = readFieldValuesCache();
                    writeFieldValuesCache({
                        ...existing,
                        [String(id)]: String(sanitized),
                    });
                }
            } catch {
                // ignore
            }

            // Optimistic: update current spot value immediately so overlay shows it even before reload.
            const currentId = getSpotId(currentSpot);
            const updatedSpots = (fileDetails?.signatureSpots || []).map((s) => {
                if (currentId == null || getSpotId(s) !== currentId) return s;
                return {
                    ...s,
                    IsSigned: true,
                    FieldValue: sanitized,
                    fieldValue: sanitized,
                    fieldvalue: sanitized,
                };
            });
            setFileDetails((prev) => (
                prev ? { ...prev, signatureSpots: updatedSpots } : prev
            ));
            advanceAfterSpotsChange(updatedSpots);

            showAppToast({ type: "success", text: t("signing.canvas.fieldSavedSuccess") });
            // NOTE: Intentionally no reloadDetailsAndAdvance() here.
            // If the DB schema lacks signaturespots.fieldvalue, the backend won't return FieldValue,
            // and an immediate reload would erase the visible value from the overlay.
            return true;
        } catch (err) {
            console.error("Failed to save field value", err);
            resetOtpAfterServerReject(err);
            showAppToast({ type: "error", text: getApiErrorMessage(err) || t("signing.canvas.fieldSaveError") });
        } finally {
            setSaving(false);
        }
        return false;
    };

    const fileToDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });

    const removeImageBackground = (dataUrl) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            if (!ctx) { resolve(dataUrl); return; }
            ctx.drawImage(img, 0, 0, w, h);
            const imageData = ctx.getImageData(0, 0, w, h);
            const d = imageData.data;
            // Sample corner pixels to detect background color
            const corners = [
                0,                          // top-left
                (w - 1) * 4,               // top-right
                ((h - 1) * w) * 4,         // bottom-left
                ((h - 1) * w + w - 1) * 4, // bottom-right
            ];
            let bgR = 255, bgG = 255, bgB = 255;
            let validCorners = 0;
            let rSum = 0, gSum = 0, bSum = 0;
            for (const idx of corners) {
                if (idx >= 0 && idx + 2 < d.length) {
                    rSum += d[idx]; gSum += d[idx + 1]; bSum += d[idx + 2];
                    validCorners++;
                }
            }
            if (validCorners > 0) {
                bgR = Math.round(rSum / validCorners);
                bgG = Math.round(gSum / validCorners);
                bgB = Math.round(bSum / validCorners);
            }
            // Make pixels similar to background transparent (aggressive for white letterbox).
            const threshold = 48;
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i];
                const g = d[i + 1];
                const b = d[i + 2];
                const nearWhite = r >= 245 && g >= 245 && b >= 245;
                const dr = Math.abs(r - bgR);
                const dg = Math.abs(g - bgG);
                const db = Math.abs(b - bgB);
                const dist = Math.sqrt(dr * dr + dg * dg + db * db);
                if (nearWhite || dist < threshold) {
                    d[i + 3] = 0; // fully transparent
                } else if (dist < threshold + 28) {
                    const alpha = Math.round(((dist - threshold) / 28) * d[i + 3]);
                    d[i + 3] = alpha;
                }
            }
            ctx.putImageData(imageData, 0, 0);
            resolve(c.toDataURL('image/png'));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });

    const handleClientStampFileSelected = (file) => {
        if (!file) return;
        setClientStampFile(file);
        const url = URL.createObjectURL(file);
        setClientStampPreview(url);
    };

    const clearClientStamp = () => {
        if (clientStampPreview) URL.revokeObjectURL(clientStampPreview);
        setClientStampFile(null);
        setClientStampPreview(null);
        setStampSignPhase(false);
        setStampNormalizedDataUrl(null);
    };

    const saveClientStamp = async () => {
        if (!currentSpot || currentSpot.IsSigned || !clientStampFile) return;
        setSaving(true);
        try {
            const isPdf = clientStampFile.type === 'application/pdf';
            let dataUrl;
            if (isPdf) {
                dataUrl = await fileToDataUrl(clientStampFile);
            } else {
                const rawDataUrl = await fileToDataUrl(clientStampFile);
                const normalized = await normalizeStampDataUrl(rawDataUrl);
                // Remove background (white/colored) from uploaded stamp
                dataUrl = await removeImageBackground(normalized);
            }
            if (!dataUrl) {
                showAppToast({ type: "error", text: t("signing.canvas.clientStampUploadError") });
                return;
            }
            // Enter "sign on stamp" phase: show canvas with stamp as background
            setStampNormalizedDataUrl(dataUrl);
            setStampSignPhase(true);
            clearCanvas();
            setHasUserDrawn(false);
        } catch (err) {
            console.error("Failed to process client stamp", err);
            showAppToast({ type: "error", text: t("signing.canvas.clientStampUploadError") });
        } finally {
            setSaving(false);
        }
    };

    const saveStampWithSignature = async () => {
        if (!currentSpot || currentSpot.IsSigned || !stampNormalizedDataUrl) return;
        setSaving(true);
        try {
            let finalDataUrl = stampNormalizedDataUrl;

            // If user drew on top, composite stamp + drawing (preserve stamp aspect)
            if (hasUserDrawn && canvasRef.current) {
                const stampImg = new Image();
                await new Promise((res, rej) => { stampImg.onload = res; stampImg.onerror = rej; stampImg.src = stampNormalizedDataUrl; });
                const W = Math.max(1, stampImg.naturalWidth || 400);
                const H = Math.max(1, stampImg.naturalHeight || 180);
                const comp = document.createElement('canvas');
                comp.width = W;
                comp.height = H;
                const ctx = comp.getContext('2d');
                if (ctx) {
                    ctx.drawImage(stampImg, 0, 0, W, H);

                    // Draw the user's strokes on top (contain-fit from signature canvas)
                    const drawingDataUrl = canvasRef.current.toDataURL('image/png');
                    const drawImg = new Image();
                    await new Promise((res, rej) => { drawImg.onload = res; drawImg.onerror = rej; drawImg.src = drawingDataUrl; });
                    const dw = drawImg.naturalWidth || W;
                    const dh = drawImg.naturalHeight || H;
                    const s = Math.min(W / dw, H / dh);
                    const ow = Math.round(dw * s);
                    const oh = Math.round(dh * s);
                    ctx.drawImage(drawImg, Math.round((W - ow) / 2), Math.round((H - oh) / 2), ow, oh);

                    finalDataUrl = comp.toDataURL('image/png');
                }
            }

            const didSign = await signCurrentSpotWithImage(finalDataUrl);
            if (!didSign) return;

            // Save the composited stamp+signature so the preview includes the drawn signature
            saveStampAsDefault(finalDataUrl);

            showAppToast({ type: "success", text: t("signing.canvas.clientStampSavedSuccess") });
            clearClientStamp();
            await reloadDetailsAndAdvance({
                optimisticSpotIds: [currentSpot?.SignatureSpotId],
                previewDataUrl: finalDataUrl,
            });
            return true;
        } catch (err) {
            console.error("Failed to save client stamp", err);
            resetOtpAfterServerReject(err);
            showAppToast({ type: "error", text: getApiErrorMessage(err) || t("signing.canvas.clientStampUploadError") });
        } finally {
            setSaving(false);
        }
        return false;
    };

    const applySavedSignatureForNext = async (savedItem = null) => {
        try {
            const allSpots = (fileDetails?.signatureSpots || []).filter((s) => getSpotType(s) !== 'lawyerstamp');
            const unsigned = getUnsignedRequiredSpots(allSpots).filter((s) => getSpotType(s) === 'signature');
            const target = (!currentSpot || currentSpot.IsSigned) ? (unsigned[0] || null) : currentSpot;
            if (!target) return;

            if (getSpotType(target) !== 'signature') {
                showAppToast({ type: "error", text: t("signing.canvas.useSavedSignatureSignatureOnly") });
                return;
            }

            if (!currentSpot || currentSpot.IsSigned) {
                setCurrentSpot(target);
                scrollToSpot(target);
                setHasStartedNextFlow(true);
            }

            setSaving(true);
            let dataUrl = null;

            if (savedItem) {
                dataUrl = await fetchSavedItemDataUrl(savedItem);
            } else if (savedSignature?.exists) {
                const sigRes = isPublic
                    ? await signingFilesApi.getPublicSavedSignatureDataUrl(publicToken)
                    : await signingFilesApi.getSavedSignatureDataUrl();
                unwrapApi(sigRes);
                const rawDataUrl = sigRes?.data?.dataUrl;
                dataUrl = await normalizeSignatureDataUrl(rawDataUrl);
            }

            if (!dataUrl) {
                showAppToast({ type: "error", text: t("signing.canvas.noSavedSignature") });
                return;
            }

            setCurrentSpot(target);
            const didSign = await signCurrentSpotWithImage(dataUrl, target);
            if (!didSign) return;

            showAppToast({ type: "success", text: t("signing.canvas.signatureSavedSuccess") });
            await reloadDetailsAndAdvance({
                optimisticSpotIds: [target.SignatureSpotId],
                previewDataUrl: dataUrl,
            });
            return true;
        } catch (err) {
            console.error("Failed to use saved signature", err);
            resetOtpAfterServerReject(err);
            showAppToast({ type: "error", text: getApiErrorMessage(err) || t("signing.canvas.useSavedSignatureError") });
        } finally {
            setSaving(false);
        }
        return false;
    };

    const applySavedStampForNext = async (savedItem = null) => {
        try {
            const allSpots = (fileDetails?.signatureSpots || []).filter((s) => getSpotType(s) !== 'lawyerstamp');
            const unsigned = getUnsignedRequiredSpots(allSpots).filter((s) => getSpotType(s) === 'signature');
            const target = (!currentSpot || currentSpot.IsSigned) ? (unsigned[0] || null) : currentSpot;
            if (!target) return;

            if (!currentSpot || currentSpot.IsSigned) {
                setCurrentSpot(target);
                scrollToSpot(target);
                setHasStartedNextFlow(true);
            }

            setSaving(true);
            let dataUrl = null;

            if (savedItem) {
                dataUrl = await fetchSavedItemDataUrl(savedItem);
            } else if (savedStamp?.exists) {
                const stampRes = isPublic
                    ? await signingFilesApi.getPublicSavedStampDataUrl(publicToken)
                    : await signingFilesApi.getSavedStampDataUrl();
                unwrapApi(stampRes);
                const rawDataUrl = stampRes?.data?.dataUrl;
                dataUrl = await normalizeStampDataUrl(rawDataUrl);
            }

            if (!dataUrl) {
                showAppToast({ type: "error", text: t("signing.canvas.noSavedStamp") });
                return;
            }

            setCurrentSpot(target);
            const didSign = await signCurrentSpotWithImage(dataUrl, target);
            if (!didSign) return;

            showAppToast({ type: "success", text: t("signing.canvas.clientStampSavedSuccess") });
            await reloadDetailsAndAdvance({
                optimisticSpotIds: [target.SignatureSpotId],
                previewDataUrl: dataUrl,
            });
            return true;
        } catch (err) {
            console.error("Failed to use saved stamp", err);
            resetOtpAfterServerReject(err);
            showAppToast({ type: "error", text: getApiErrorMessage(err) || t("signing.canvas.useSavedStampError") });
        } finally {
            setSaving(false);
        }
        return false;
    };

    const signAllRemainingSpots = async (savedItem = null) => {
        try {
            if (!consentAccepted) {
                showAppToast({ type: "warning", text: t("signing.canvas.consentRequired") });
                return false;
            }
            if (otpRequired && !otpVerified) {
                showAppToast({ type: "warning", text: t("signing.canvas.otpRequired") });
                return false;
            }
            const allSpots = (fileDetails?.signatureSpots || []).filter((s) => getSpotType(s) !== 'lawyerstamp');
            const unsignedRequired = getUnsignedRequiredSpots(allSpots);
            // Sign-all applies one drawn/saved signature to every remaining
            // signature-like spot this signer can act on (signature + initials).
            const unsigned = unsignedRequired.filter((s) => isSignatureLike(getSpotType(s)));
            if (!unsigned.length) return;

            setSaving(true);

            let dataUrl;

            if (savedItem) {
                dataUrl = await fetchSavedItemDataUrl(savedItem);
            } else if (canvasRef.current && hasUserDrawn) {
                dataUrl = canvasRef.current.toDataURL("image/png");
                // Persist a newly drawn signature before applying it everywhere.
                try {
                    await saveSignatureAsDefault(dataUrl);
                } catch (persistErr) {
                    console.warn("Failed to persist signature during sign-all", persistErr);
                }
            } else if (savedSignature?.exists) {
                const sigRes = isPublic
                    ? await signingFilesApi.getPublicSavedSignatureDataUrl(publicToken)
                    : await signingFilesApi.getSavedSignatureDataUrl();
                unwrapApi(sigRes);
                const rawDataUrl = sigRes?.data?.dataUrl;
                dataUrl = await normalizeSignatureDataUrl(rawDataUrl);
            } else {
                showAppToast({ type: "error", text: t("signing.canvas.signAllRequiresSignature") });
                return;
            }

            if (!dataUrl) {
                showAppToast({ type: "error", text: t("signing.canvas.noSignatureToUse") });
                return;
            }

            const consentVersion = String(fileDetails?.file?.SigningPolicyVersion || "2026-01-11");
            const signatureSpotIds = unsigned
                .map((s) => Number(s.SignatureSpotId))
                .filter((n) => Number.isFinite(n) && n > 0);

            // Always batch — one request signs the full list server-side
            // (avoids per-spot rate limits and is much faster).
            if (signatureSpotIds.length >= 1) {
                const config = { headers: { "x-signing-session-id": signingSessionId } };
                const body = {
                    signatureSpotIds,
                    signatureImage: dataUrl,
                    signingSessionId,
                    consentAccepted: true,
                    consentVersion,
                };
                const res = isPublic
                    ? await signingFilesApi.publicSignFileBatch(publicToken, body, config)
                    : await signingFilesApi.signFileBatch(fileDetails.file.SigningFileId, body, config);
                unwrapApi(res);
            }

            showAppToast({ type: "success", text: t("signing.canvas.signedAllSuccess") });
            await reloadDetailsAndAdvance({
                optimisticSpotIds: signatureSpotIds,
                previewDataUrl: dataUrl,
            });
            return true;
        } catch (err) {
            console.error("Failed to sign all spots", err);
            resetOtpAfterServerReject(err);
            showAppToast({ type: "error", text: getApiErrorMessage(err) || t("signing.canvas.signAllError") });
            // Reload to reflect any partially signed spots
            try { await reloadDetailsAndAdvance(); } catch (_) { /* ignore */ }
        } finally {
            setSaving(false);
        }
        return false;
    };


    const requestOtp = async ({ silent = false } = {}) => {
        try {
            if (!otpRequired) return;
            const now = Date.now();
            if (!silent && now < otpResendAtRef.current) {
                showAppToast({ type: "warning", text: t("signing.canvas.otpWaitBeforeResend") || "נא להמתין לפני שליחה מחדש" });
                return;
            }
            setOtpBusy(true);
            const res = isPublic
                ? await signingFilesApi.publicRequestSigningOtp(publicToken, signingSessionId)
                : await signingFilesApi.requestSigningOtp(effectiveSigningFileId, signingSessionId);
            unwrapApi(res);
            const skipped = Boolean(res?.skipped || res?.data?.skipped);
            const delivered = res?.delivered === true || res?.data?.delivered === true;
            setOtpRequested(true);
            otpLastFailedRef.current = "";
            otpAutoVerifyRef.current = false;
            otpResendAtRef.current = Date.now() + 30_000;
            if (!silent) {
                if (skipped) {
                    // No SMS expected (already complete / not required).
                } else if (delivered) {
                    showAppToast({ type: "success", text: t("signing.canvas.otpSent") });
                } else {
                    showAppToast({ type: "error", text: t("signing.canvas.otpSendError") });
                }
            }
        } catch (err) {
            console.error("OTP request failed", err);
            otpAutoSentRef.current = false;
            if (!silent) {
                showAppToast({ type: "error", text: getApiErrorMessage(err) || t("signing.canvas.otpSendError") });
            }
        } finally {
            setOtpBusy(false);
        }
    };

    // Send the first OTP once the document is ready (never for completed/read-only views).
    useEffect(() => {
        if (!fileDetails || !otpRequired || otpVerified || otpAutoSentRef.current || alreadyComplete) return;
        otpAutoSentRef.current = true;
        requestOtp({ silent: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fileDetails, otpRequired, otpVerified, alreadyComplete]);

    const verifyOtp = async () => {
        try {
            if (!otpRequired) return;
            const otp = String(otpCode || "").replace(/\D/g, "").slice(0, 6);
            if (!/^[0-9]{6}$/.test(otp)) {
                showAppToast({ type: "error", text: t("signing.canvas.otpInvalidFormat") });
                return;
            }

            setOtpBusy(true);
            const res = isPublic
                ? await signingFilesApi.publicVerifySigningOtp(publicToken, otp, signingSessionId)
                : await signingFilesApi.verifySigningOtp(effectiveSigningFileId, otp, signingSessionId);
            unwrapApi(res);
            const verifiedOk = res?.data?.verified === true || res?.verified === true;
            if (!verifiedOk) {
                // Remember this code so auto-submit does not loop; input stays editable.
                otpLastFailedRef.current = otp;
                otpAutoVerifyRef.current = false;
                setOtpVerified(false);
                const rateLimited = Boolean(res?.data?.rateLimited || res?.rateLimited);
                showAppToast({
                    type: "error",
                    text: rateLimited
                        ? (t("signing.canvas.otpRateLimited") || "נעשו יותר מדי ניסיונות. בקשו קוד חדש ונסו שוב.")
                        : t("signing.canvas.otpVerifyError"),
                });
                try { otpInputRef.current?.focus?.(); otpInputRef.current?.select?.(); } catch (_) { /* ignore */ }
                return;
            }
            otpLastFailedRef.current = "";
            setOtpVerified(true);
            
        } catch (err) {
            console.error("OTP verify failed", err);
            otpLastFailedRef.current = String(otpCode || "").replace(/\D/g, "").slice(0, 6);
            otpAutoVerifyRef.current = false;
            setOtpVerified(false);
            showAppToast({ type: "error", text: getApiErrorMessage(err) || t("signing.canvas.otpVerifyError") });
            try { otpInputRef.current?.focus?.(); otpInputRef.current?.select?.(); } catch (_) { /* ignore */ }
        } finally {
            setOtpBusy(false);
        }
    };

    // Auto-submit when 6 digits are present. After a failure, wait until the client changes the code.
    useEffect(() => {
        if (!otpRequired || otpVerified || otpBusy || saving) return;
        const otp = String(otpCode || "").replace(/\D/g, "").slice(0, 6);
        if (otp.length !== 6) {
            otpAutoVerifyRef.current = false;
            return;
        }
        if (otp === otpLastFailedRef.current) return;
        if (otpAutoVerifyRef.current) return;
        otpAutoVerifyRef.current = true;
        verifyOtp();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otpCode, otpRequired, otpVerified, otpBusy, saving]);

    const rejectFile = async () => {
        const reason = prompt(t("signing.canvas.rejectReasonPrompt"));
        if (reason === null) return;
        try {
            setSaving(true);
            if (isPublic) {
                const res = await signingFilesApi.publicRejectSigning(publicToken, { rejectionReason: reason, signingSessionId });
                unwrapApi(res);
            } else {
                const res = await signingFilesApi.rejectSigning(effectiveSigningFileId, { rejectionReason: reason, signingSessionId });
                unwrapApi(res);
            }
            showAppToast({ type: "success", text: t("signing.canvas.documentRejected") });
            setTimeout(() => onClose(), 1200);
        } catch (err) {
            console.error("Failed to reject file", err);
            showAppToast({ type: "error", text: getApiErrorMessage(err) || t("signing.canvas.rejectError") });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        // Public signing: same centered spinner as /s/:slug so resolve → open feels like one loader
        if (isScreen) {
            return (
                <div className="lw-signing-scope lw-publicSigningScreen">
                    <SimpleContainer className="lw-publicSigningScreen__container">
                        <SimpleContainer className="lw-publicSigningScreen__stack">
                            <div className="lw-publicSigningScreen__spinner" aria-hidden="true" />
                            <Text14>{t("signing.public.loadingDocument") || t("signing.canvas.loadingDocument")}</Text14>
                        </SimpleContainer>
                    </SimpleContainer>
                </div>
            );
        }
        return (
            <div className="lw-signing-scope">
                <div className="lw-signing-modal" onClick={onClose}>
                    <div
                        className="lw-signing-modalContent"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="lw-signing-modalHeader">
                            <h3>{t("signing.canvas.loadingDocument")}</h3>
                            <TertiaryButton className="lw-signing-closeButton" size={buttonSizes.SMALL} onPress={onClose}>
                                {t("common.close")}
                            </TertiaryButton>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!fileDetails) {
        return (
            <div className="lw-signing-scope">
                <div className={isScreen ? "lw-signing-screen" : "lw-signing-modal"} onClick={isScreen ? undefined : onClose}>
                    <div
                        className={isScreen ? "lw-signing-modalContent lw-signing-screenContent" : "lw-signing-modalContent"}
                        onClick={isScreen ? undefined : (e) => e.stopPropagation()}
                    >
                        <div className="lw-signing-modalHeader">
                            <h3>{t("signing.canvas.loadDocumentErrorTitle")}</h3>
                            <TertiaryButton className="lw-signing-closeButton" size={buttonSizes.SMALL} onPress={onClose}>
                                {t("common.close")}
                            </TertiaryButton>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Sequential signing: show waiting message if not this signer's turn
    if (fileDetails?.signingOrder === 'sequential' && fileDetails?.isMyTurn === false) {
        return (
            <div className="lw-signing-scope">
                <div className={isScreen ? "lw-signing-screen" : "lw-signing-modal"} onClick={isScreen ? undefined : onClose}>
                    <div
                        className={isScreen ? "lw-signing-modalContent lw-signing-screenContent" : "lw-signing-modalContent"}
                        onClick={isScreen ? undefined : (e) => e.stopPropagation()}
                    >
                        <div className="lw-signing-modalHeader">
                            <h3>{t("signing.canvas.waitingForPreviousSigners")}</h3>
                            <TertiaryButton className="lw-signing-closeButton" size={buttonSizes.SMALL} onPress={onClose}>
                                {t("common.close")}
                            </TertiaryButton>
                        </div>
                        <div className="lw-signing-modalBody" style={{ padding: '2rem', textAlign: 'center' }}>
                            <Text14>{t("signing.canvas.waitingForPreviousSignersDesc")}</Text14>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const allSpots = fileDetails.signatureSpots || [];
    // LawyerStamp spots are pre-signed by the lawyer — hide them from the client view entirely.
    // Multi-signer: show everyone's signed spots (so later signers see prior signatures),
    // but only show unsigned spots the current user can actually sign.
    const spots = allSpots.filter((s) => {
        if (getSpotType(s) === 'lawyerstamp') return false;
        if (s?.IsSigned) return true;
        return isMyActionableSpot(s);
    });
    const fileStatus = String(fileDetails?.file?.Status || fileDetails?.file?.status || "").toLowerCase();
    const unsignedRequiredSpotsRaw = getUnsignedRequiredSpots(spots);
    const unsignedOptionalSpotsRaw = getUnsignedOptionalSpots(spots);
    const isDocumentLocked = (
        fileDetails?.readOnly === true
        || fileDetails?.file?.ReadOnly === true
        || fileDetails?.signerCompleted === true
        || fileStatus === "signed"
        || fileStatus === "rejected"
    ) && unsignedRequiredSpotsRaw.length === 0;
    const requiredSpots = spots.filter((s) => isSpotRequired(s));
    const effectiveRequiredSpots = requiredSpots;
    const unsignedRequiredSpots = isDocumentLocked ? [] : unsignedRequiredSpotsRaw;
    const unsignedOptionalSpots = isDocumentLocked ? [] : unsignedOptionalSpotsRaw;
    const remainingCount = unsignedRequiredSpots.length;
    const remainingSignatureSpots = unsignedRequiredSpots.filter(
        (s) => isSignatureLike(getSpotType(s)),
    ).length;
    const remainingFieldSpots = remainingCount - remainingSignatureSpots;
    const optionalRemainingCount = unsignedOptionalSpots.length;
    const allSpotsSignedByUser = remainingCount === 0;
    const hasUnsignedSignatureSpots = remainingSignatureSpots > 0;
    const remainingHintPage = remainingCount > 0
        ? Number(getSpotPage(unsignedRequiredSpots[0]) || 1)
        : null;
    const remainingHintText = remainingCount > 0
        ? (remainingSignatureSpots > 0 && remainingFieldSpots > 0
            ? t("signing.canvas.remainingSignaturesAndFields", {
                signatures: remainingSignatureSpots,
                fields: remainingFieldSpots,
            })
            : remainingSignatureSpots > 0
                ? (remainingSignatureSpots === 1 && remainingHintPage
                    ? t("signing.canvas.oneSignatureRemainingOnPage", { page: remainingHintPage })
                    : t("signing.canvas.remainingSignatures", { count: remainingSignatureSpots }))
                : (remainingFieldSpots === 1 && remainingHintPage
                    ? t("signing.canvas.oneFieldRemainingOnPage", { page: remainingHintPage })
                    : t("signing.canvas.remainingFields", { count: remainingFieldSpots })))
        : (allSpotsSignedByUser && spots.length > 0
            ? t("signing.canvas.allRequiredCompleted")
            : "");

    const nextSpotButtonLabel = hasUnsignedSignatureSpots
        ? t("signing.canvas.nextSignature")
        : t("signing.canvas.nextField");
    const activeSpotForMode = getActiveSpotForMode(fileDetails, currentSpot);
    const currentSpotType = activeSpotForMode ? getSpotType(activeSpotForMode) : 'signature';
    const currentSpotIsSignature = activeSpotForMode ? isSignatureLike(currentSpotType) : false;
    const currentSignMode = getSignModeForSpotType(currentSpotType);

    const goToNextSigningSpot = () => {
        const queue = unsignedRequiredSpots.length > 0
            ? unsignedRequiredSpots
            : unsignedOptionalSpots;
        if (queue.length === 0) return;

        if (!hasStartedNextFlow) {
            const first = queue[0];
            setCurrentSpot(first);
            scrollToSpot(first);
            setHasStartedNextFlow(true);
            if (isScreen) setShowSpotPopup(true);
            return;
        }

        const currentId = currentSpot?.SignatureSpotId;
        const currentIdx = queue.findIndex((s) => s.SignatureSpotId === currentId);
        const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % queue.length : 0;
        const nextSpot = queue[nextIdx];
        setCurrentSpot(nextSpot);
        scrollToSpot(nextSpot);
        if (isScreen) setShowSpotPopup(true);
    };

    const continueToRemainingFields = () => {
        signaturesCelebratedRef.current = true;
        holdSignatureCompleteOverlayRef.current = false;
        setShowCompletion(false);
        const next = unsignedRequiredSpots[0] || unsignedOptionalSpots[0];
        if (!next) return;
        setCurrentSpot(next);
        scrollToSpot(next);
        setHasStartedNextFlow(true);
        if (isScreen) setShowSpotPopup(true);
    };

    const remainingFieldsForComplete = remainingFieldSpots > 0
        ? remainingFieldSpots
        : optionalRemainingCount;
    const renderCompletionOverlay = () => {
        if (!showCompletion) return null;
        const hasMoreFields = remainingFieldsForComplete > 0;
        return (
            <div className="lw-signing-completeOverlay" role="dialog" aria-modal="true">
                <div className="lw-signing-completeCard">
                    <div className="lw-signing-completeCheck" aria-hidden="true">
                        <svg viewBox="0 0 52 52">
                            <circle className="lw-signing-completeCheck__circle" cx="26" cy="26" r="24" fill="none" />
                            <path className="lw-signing-completeCheck__mark" fill="none" d="M14 27 l8 8 16-16" />
                        </svg>
                    </div>
                    <h2 className="lw-signing-completeTitle">{t("signing.canvas.signingCompleteTitle")}</h2>
                    <p className="lw-signing-completeSubtitle">
                        {hasMoreFields
                            ? t("signing.canvas.signingCompleteFieldsRemainSubtitle", { count: remainingFieldsForComplete })
                            : t("signing.canvas.signingCompleteSubtitle")}
                    </p>
                    <div className="lw-signing-completeActions">
                        {hasMoreFields && (
                            <PrimaryButton onPress={continueToRemainingFields}>
                                {t("signing.canvas.signingCompleteContinueFields")}
                            </PrimaryButton>
                        )}
                        {hasMoreFields ? (
                            <SecondaryButton onPress={onClose}>
                                {t("signing.canvas.signingCompleteClose")}
                            </SecondaryButton>
                        ) : (
                            <PrimaryButton onPress={onClose}>
                                {t("signing.canvas.signingCompleteClose")}
                            </PrimaryButton>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const handleSpotSelect = (index) => {
        const spot = spots[index];
        if (!spot || spot.IsSigned) return;
        if (!isMyActionableSpot(spot)) return;
        setCurrentSpot(spot);
        if (isSignatureLike(getSpotType(spot))) {
            setSignatureMode("draw");
            clearCanvas();
        }
        scrollToSpot(spot);
        setHasStartedNextFlow(true);
        if (isScreen) setShowSpotPopup(true);
    };

    const closeSpotPopup = () => {
        setShowSpotPopup(false);
    };

    // ─── Shared signing UI (used in side panel for modal, popup for screen) ───
    const renderConsentAndOtp = () => (
        <>
            {!consentAccepted && showConsentUi && (
                <div className="lw-signing-legalBox">
                    <label className="lw-signing-legalRow">
                        <input
                            type="checkbox"
                            checked={consentAccepted}
                            onChange={(e) => {
                                const next = Boolean(e.target.checked);
                                if (!next) return;
                                setConsentAccepted(true);
                                try {
                                    localStorage.setItem(consentStorageKey, "true");
                                } catch { /* ignore */ }
                            }}
                            disabled={saving}
                        />
                        <span>{t("signing.canvas.consentText")}</span>
                    </label>
                </div>
            )}

            {otpRequired && !otpVerified && (
                <div className="lw-signing-otpBox">
                    <div className="lw-signing-otpTitle">{t("signing.canvas.otpTitle")}</div>
                    <div className="lw-signing-otpRow">
                        <input
                            className="lw-signing-otpInput"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder={t("signing.canvas.otpPlaceholder")}
                            value={otpCode}
                            ref={otpInputRef}
                            onChange={(e) => {
                                const digits = String(e.target.value || "").replace(/\D/g, "").slice(0, 6);
                                // Editing clears the failed-code lock so a corrected code can auto-submit.
                                if (digits !== otpLastFailedRef.current) {
                                    otpLastFailedRef.current = "";
                                    otpAutoVerifyRef.current = false;
                                }
                                setOtpCode(digits);
                            }}
                            autoComplete="one-time-code"
                            disabled={saving || otpVerified}
                            aria-label={t("signing.canvas.otpPlaceholder")}
                        />
                    </div>
                    <div className="lw-signing-actionsRow">
                        <SecondaryButton size={buttonSizes.SMALL} onPress={() => requestOtp()} disabled={otpBusy || saving || otpVerified}>
                            {otpRequested ? t("signing.canvas.resend") : t("signing.canvas.sendCode")}
                        </SecondaryButton>
                    </div>
                </div>
            )}
        </>
    );

    const renderSigningControls = () => (
        <>
            {/* ─── Tab bar for signature spots (draw / saved / stamp) ─── */}
            {currentSpot && !currentSpot.IsSigned && currentSpotIsSignature && remainingCount > 0 && (
                <div className="lw-signing-tabBar">
                    <button
                        className={"lw-signing-tab" + (signatureMode === "draw" ? " is-active" : "")}
                        onClick={() => { setSignatureMode("draw"); clearCanvas(); clearClientStamp(); setSelectedSavedItem(null); }}
                        disabled={saving}
                    >
                        {t("signing.canvas.tabDraw")}
                    </button>
                    {(savedSignatures.length > 0 || savedStamps.length > 0) && (
                        <button
                            className={"lw-signing-tab" + (signatureMode === "saved" ? " is-active" : "")}
                            onClick={() => {
                                setSignatureMode("saved");
                                clearClientStamp();
                                // Keep / auto-select first item so חתום / חתום על הכל stay visible.
                                if (savedSignatures.length > 0) {
                                    const item = savedSignatures[0];
                                    setSelectedSavedItem({ type: 'signature', url: item.url, index: item.index });
                                } else if (savedStamps.length > 0) {
                                    const item = savedStamps[0];
                                    setSelectedSavedItem({ type: 'stamp', url: item.url, index: item.index });
                                } else {
                                    setSelectedSavedItem(null);
                                }
                            }}
                            disabled={saving}
                        >
                            {t("signing.canvas.tabSaved")}
                        </button>
                    )}
                    <button
                        className={"lw-signing-tab" + (signatureMode === "stamp" ? " is-active" : "")}
                        onClick={() => { setSignatureMode("stamp"); }}
                        disabled={saving}
                    >
                        {t("signing.canvas.tabStamp")}
                    </button>
                </div>
            )}

            {/* ─── Merged saved items mode (signatures + stamps) ─── */}
            {currentSpotIsSignature && signatureMode === "saved" && remainingCount > 0 && !stampSignPhase && (
                <div className="lw-signing-canvasSection">
                    <div className="lw-signing-savedItemsGrid">
                        {savedSignatures.map((item) => (
                            <div
                                key={item.key}
                                className={`lw-signing-savedItem${selectedSavedItem?.type === 'signature' && selectedSavedItem?.index === item.index ? ' is-selected' : ''}`}
                                onClick={() => setSelectedSavedItem({ type: 'signature', url: item.url, index: item.index })}
                            >
                                <div className="lw-signing-savedItemLabel">{t("signing.canvas.savedSignatureLabel")}</div>
                                <button
                                    className="lw-signing-savedItemDelete"
                                    onClick={(e) => { e.stopPropagation(); deleteSavedItem('signature', item.index); }}
                                    disabled={saving}
                                    title={t("signing.canvas.deleteSavedItem")}
                                >×</button>
                                <div className="lw-signing-savedItemPreview">
                                    {item.url ? (
                                        <img src={item.url} alt={t("signing.canvas.savedSignatureAlt")} className="lw-signing-savedSigPreview" />
                                    ) : (
                                        <div className="lw-signing-inlineHint">{t("signing.canvas.loadingSavedSignature")}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {savedStamps.map((item) => (
                            <div
                                key={item.key}
                                className={`lw-signing-savedItem${selectedSavedItem?.type === 'stamp' && selectedSavedItem?.index === item.index ? ' is-selected' : ''}`}
                                onClick={() => setSelectedSavedItem({ type: 'stamp', url: item.url, index: item.index })}
                            >
                                <div className="lw-signing-savedItemLabel">{t("signing.canvas.savedStampLabel")}</div>
                                <button
                                    className="lw-signing-savedItemDelete"
                                    onClick={(e) => { e.stopPropagation(); deleteSavedItem('stamp', item.index); }}
                                    disabled={saving}
                                    title={t("signing.canvas.deleteSavedItem")}
                                >×</button>
                                <div className="lw-signing-savedItemPreview">
                                    {item.url ? (
                                        <img src={item.url} alt={t("signing.canvas.savedStampAlt")} className="lw-signing-savedSigPreview" />
                                    ) : (
                                        <div className="lw-signing-inlineHint">{t("signing.canvas.loadingSavedStamp")}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {savedSignatures.length === 0 && savedStamps.length === 0 && (
                            <div className="lw-signing-inlineHint">{t("signing.canvas.noSavedItems")}</div>
                        )}
                    </div>
                    {selectedSavedItem && (
                        <div className="lw-signing-actionsRow">
                            <PrimaryButton
                                size={buttonSizes.SMALL}
                                onPress={async () => {
                                    if (selectedSavedItem.type === 'signature') {
                                        await applySavedSignatureForNext(selectedSavedItem);
                                    } else {
                                        await applySavedStampForNext(selectedSavedItem);
                                    }
                                }}
                                disabled={saving}
                            >
                                {saving ? t("signing.canvas.saving") : t("signing.canvas.signOnly")}
                            </PrimaryButton>
                            {remainingSignatureSpots >= 1 && (
                                <SecondaryButton
                                    size={buttonSizes.SMALL}
                                    onPress={async () => { await signAllRemainingSpots(selectedSavedItem); }}
                                    disabled={saving}
                                >
                                    {t("signing.canvas.signAll")}
                                </SecondaryButton>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Stamp upload mode (for signature spots) ─── */}
            {currentSpot && !currentSpot.IsSigned && currentSpotIsSignature && signatureMode === "stamp" && !stampSignPhase && (
                <div className="lw-signing-canvasSection">
                    <div className="lw-signing-fieldInput">
                        <div className="lw-signing-fieldLabel" style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                            {t("signing.fieldSettings.clientStampUploadHint")}
                        </div>
                        {clientStampPreview && (
                            <img
                                src={clientStampPreview}
                                alt={t("signing.fields.clientStamp")}
                                className="lw-signing-savedSigPreview"
                                style={{ maxHeight: 120, objectFit: 'contain', margin: '0.5rem 0' }}
                            />
                        )}
                        <label className="lw-signing-fileUploadBtn">
                            <input
                                type="file"
                                accept="image/png,image/jpeg,application/pdf"
                                onChange={(e) => handleClientStampFileSelected(e.target.files?.[0])}
                                disabled={saving}
                                className="lw-signing-fileUploadInput"
                            />
                            {clientStampFile ? clientStampFile.name : t("signing.canvas.chooseFile")}
                        </label>
                    </div>
                    <div className="lw-signing-actionsRow">
                        <SecondaryButton size={buttonSizes.MEDIUM} onPress={clearClientStamp} disabled={saving}>
                            {t("common.clear")}
                        </SecondaryButton>
                        <PrimaryButton size={buttonSizes.MEDIUM} onPress={saveClientStamp} disabled={saving || !clientStampFile}>
                            {saving ? t("signing.canvas.saving") : t("signing.canvas.nextStep")}
                        </PrimaryButton>
                    </div>
                </div>
            )}

            {/* ─── Stamp sign-on-top phase (shared for stamp mode and clientStamp spots) ─── */}
            {currentSpot && !currentSpot.IsSigned && (signatureMode === "stamp" || signatureMode === "savedStamp" || currentSignMode === 'clientStamp') && stampSignPhase && (
                <div className="lw-signing-canvasSection">
                    <div className="lw-signing-fieldLabel" style={{ padding: '0 0.75rem' }}>
                        {t("signing.canvas.signOnStampHint")}
                    </div>
                    <div className="lw-signing-stampCanvasWrap">
                        {stampNormalizedDataUrl && (
                            <img src={stampNormalizedDataUrl} alt="" className="lw-signing-stampCanvasBg" />
                        )}
                        <canvas
                            ref={canvasRef}
                            className="lw-signing-canvas lw-signing-canvas--overStamp"
                            onPointerDown={startDrawing}
                            onPointerMove={drawMove}
                            onPointerUp={endDrawing}
                            onPointerCancel={endDrawing}
                            onPointerLeave={endDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={drawMove}
                            onTouchEnd={endDrawing}
                        />
                    </div>
                    <div className="lw-signing-actionsRow">
                        <PrimaryButton size={buttonSizes.MEDIUM} onPress={async () => { await saveStampWithSignature(); }} disabled={saving}>
                            {saving ? t("signing.canvas.saving") : t("signing.canvas.saveField")}
                        </PrimaryButton>
                        <SecondaryButton size={buttonSizes.MEDIUM} onPress={clearClientStamp} disabled={saving}>
                            {t("signing.canvas.changeStamp")}
                        </SecondaryButton>
                        <SecondaryButton size={buttonSizes.MEDIUM} onPress={clearCanvas} disabled={saving}>
                            {t("common.clear")}
                        </SecondaryButton>
                    </div>
                </div>
            )}

            {/* ─── ClientStamp spot type – tab bar ─── */}
            {currentSpot && !currentSpot.IsSigned && currentSignMode === 'clientStamp' && !stampSignPhase && savedStamp.exists && (
                <div className="lw-signing-tabBar">
                    <button
                        className={"lw-signing-tab" + (signatureMode === "stamp" ? " is-active" : "")}
                        onClick={() => { setSignatureMode("stamp"); }}
                        disabled={saving}
                    >
                        {t("signing.canvas.tabStamp")}
                    </button>
                    <button
                        className={"lw-signing-tab" + (signatureMode === "savedStamp" ? " is-active" : "")}
                        onClick={() => { setSignatureMode("savedStamp"); clearClientStamp(); }}
                        disabled={saving}
                    >
                        {t("signing.canvas.tabSavedStamp")}
                    </button>
                </div>
            )}

            {/* ─── ClientStamp spot type – saved stamp panel ─── */}
            {currentSpot && !currentSpot.IsSigned && currentSignMode === 'clientStamp' && !stampSignPhase && signatureMode === 'savedStamp' && savedStamp.exists && (
                <div className="lw-signing-canvasSection">
                    <div className="lw-signing-savedSigBox">
                        <div className="lw-signing-fieldLabel">{t("signing.fieldSettings.clientStampTitle")}</div>
                        <div className="lw-signing-savedSigPreviewWrap">
                            {savedStamp.url ? (
                                <img
                                    className="lw-signing-savedSigPreview"
                                    src={savedStamp.url}
                                    alt={t("signing.canvas.savedStampAlt")}
                                />
                            ) : (
                                <div className="lw-signing-inlineHint">{t("signing.canvas.loadingSavedStamp")}</div>
                            )}
                        </div>
                        <div className="lw-signing-actionsRow">
                            <PrimaryButton
                                size={buttonSizes.SMALL}
                                onPress={applySavedStampForNext}
                                disabled={saving || !savedStamp.exists}
                            >
                                {saving ? t("signing.canvas.saving") : t("signing.canvas.nextStep")}
                            </PrimaryButton>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── ClientStamp spot type – upload phase ─── */}
            {currentSpot && !currentSpot.IsSigned && currentSignMode === 'clientStamp' && !stampSignPhase && signatureMode !== 'savedStamp' && (
                <div className="lw-signing-canvasSection">
                    <div className="lw-signing-fieldInput">
                        <div className="lw-signing-fieldLabel">{t("signing.fieldSettings.clientStampTitle")}</div>
                        <div className="lw-signing-fieldLabel" style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                            {t("signing.fieldSettings.clientStampUploadHint")}
                        </div>
                        {clientStampPreview && (
                            <img
                                src={clientStampPreview}
                                alt={t("signing.fields.clientStamp")}
                                className="lw-signing-savedSigPreview"
                                style={{ maxHeight: 120, objectFit: 'contain', margin: '0.5rem 0' }}
                            />
                        )}
                        <label className="lw-signing-fileUploadBtn">
                            <input
                                type="file"
                                accept="image/png,image/jpeg,application/pdf"
                                onChange={(e) => handleClientStampFileSelected(e.target.files?.[0])}
                                disabled={saving}
                                className="lw-signing-fileUploadInput"
                            />
                            {clientStampFile ? clientStampFile.name : t("signing.canvas.chooseFile")}
                        </label>
                    </div>
                    <div className="lw-signing-actionsRow">
                        <SecondaryButton size={buttonSizes.MEDIUM} onPress={clearClientStamp} disabled={saving}>
                            {t("common.clear")}
                        </SecondaryButton>
                        <PrimaryButton size={buttonSizes.MEDIUM} onPress={saveClientStamp} disabled={saving || !clientStampFile}>
                            {saving ? t("signing.canvas.saving") : t("signing.canvas.nextStep")}
                        </PrimaryButton>
                    </div>
                </div>
            )}

            {/* ─── Field input (non-signature, non-stamp) ─── */}
            {currentSpot && !currentSpot.IsSigned && !currentSpotIsSignature && currentSignMode !== 'clientStamp' && (
                <div className="lw-signing-canvasSection">
                    <div className="lw-signing-fieldInput">
                        <div className="lw-signing-fieldLabel">
                            {t("signing.canvas.fieldValueLabel", { type: t(`signing.fields.${getFieldTypeKey(currentSpotType)}`) })}
                        </div>
                        {currentSpotType === 'checkbox' ? (
                            <label className="lw-signing-fieldCheckbox">
                                <input
                                    type="checkbox"
                                    checked={fieldChecked}
                                    onChange={(e) => {
                                        setFieldChecked(Boolean(e.target.checked));
                                        setFieldValue(e.target.checked ? 'true' : '');
                                    }}
                                    disabled={saving}
                                />
                                <span>{t("signing.canvas.checkboxLabel")}</span>
                            </label>
                        ) : currentSpotType === 'date' ? (
                            <input
                                className="lw-signing-fieldInputControl"
                                type="text"
                                inputMode="numeric"
                                placeholder="DD/MM/YYYY"
                                value={(() => {
                                    if (/^\d{4}-\d{2}-\d{2}$/.test(fieldValue)) {
                                        const [y, m, d] = fieldValue.split('-');
                                        return `${d}/${m}/${y}`;
                                    }
                                    return fieldValue;
                                })()}
                                onChange={(e) => {
                                    const raw = e.target.value.replace(/[^\d/]/g, '');
                                    let formatted = raw;
                                    const digits = raw.replace(/\//g, '');
                                    if (digits.length <= 2) {
                                        formatted = digits;
                                    } else if (digits.length <= 4) {
                                        formatted = digits.slice(0, 2) + '/' + digits.slice(2);
                                    } else {
                                        formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8);
                                    }
                                    if (/^\d{2}\/\d{2}\/\d{4}$/.test(formatted)) {
                                        const [dd, mm, yyyy] = formatted.split('/');
                                        setFieldValue(`${yyyy}-${mm}-${dd}`);
                                    } else {
                                        setFieldValue(formatted);
                                    }
                                }}
                                maxLength={10}
                                disabled={saving}
                            />
                        ) : (
                            <input
                                className="lw-signing-fieldInputControl"
                                type={getInputTypeForField(currentSpotType)}
                                {...getInputPropsForField(currentSpotType)}
                                placeholder={t("signing.canvas.fieldValuePlaceholder")}
                                value={fieldValue}
                                onChange={(e) => setFieldValue(e.target.value)}
                                disabled={saving}
                            />
                        )}
                    </div>
                    <div className="lw-signing-actionsRow">
                        <SecondaryButton size={buttonSizes.MEDIUM} onPress={() => setFieldValue("")} disabled={saving}>
                            {t("common.clear")}
                        </SecondaryButton>
                        <PrimaryButton size={buttonSizes.MEDIUM} onPress={async () => { await saveFieldValue(); }} disabled={saving}>
                            {saving ? t("signing.canvas.saving") : t("signing.canvas.saveField")}
                        </PrimaryButton>
                    </div>
                </div>
            )}

            {/* ─── Draw mode ─── */}
            {signatureMode === "draw" && currentSpot && !currentSpot.IsSigned && currentSpotIsSignature && (
                <div className="lw-signing-canvasSection">
                    <div className="lw-signing-canvasWrap">
                        <canvas
                            ref={canvasRef}
                            className="lw-signing-canvas"
                            onPointerDown={startDrawing}
                            onPointerMove={drawMove}
                            onPointerUp={endDrawing}
                            onPointerCancel={endDrawing}
                            onPointerLeave={endDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={drawMove}
                            onTouchEnd={endDrawing}
                        />
                        <button
                            type="button"
                            className={`lw-signing-canvasClearBtn${canvasClearSpinning ? ' is-spinning' : ''}`}
                            onClick={handleClearCanvasClick}
                            disabled={saving || !hasUserDrawn}
                            title={t("common.clear")}
                            aria-label={t("common.clear")}
                        >
                            <svg
                                className="lw-signing-canvasClearBtn__icon"
                                viewBox="0 0 24 24"
                                width="18"
                                height="18"
                                aria-hidden="true"
                                focusable="false"
                            >
                                <path
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.4"
                                    strokeLinecap="round"
                                    d="M20.6 12a8.6 8.6 0 1 1-2.55-6.05"
                                />
                                <path
                                    fill="currentColor"
                                    d="M17.05 2.85l4.55 1.35-1.35 4.55-3.2-5.9z"
                                />
                            </svg>
                        </button>
                    </div>
                    <div className="lw-signing-actionsRow lw-signing-actionsRow--sign">
                        <PrimaryButton size={buttonSizes.MEDIUM} onPress={async () => { await signOnly(); }} disabled={saving}>
                            {saving
                                ? t("signing.canvas.saving")
                                : (currentSignMode === 'initials'
                                    ? t("signing.canvas.saveInitials")
                                    : t("signing.canvas.signOnly"))}
                        </PrimaryButton>
                        {!isPublic && currentSignMode === 'signature' && (
                            <SecondaryButton size={buttonSizes.MEDIUM} onPress={async () => { await saveSignature(); }} disabled={saving}>
                                {saving ? t("signing.canvas.saving") : t("signing.canvas.saveSignature")}
                            </SecondaryButton>
                        )}
                        {currentSignMode === 'signature' && remainingSignatureSpots >= 1 && (
                            <SecondaryButton
                                size={buttonSizes.MEDIUM}
                                onPress={async () => { await signAllRemainingSpots(); }}
                                disabled={saving}
                            >
                                {t("signing.canvas.signAll")}
                            </SecondaryButton>
                        )}
                    </div>
                </div>
            )}

            {currentSpot && currentSpot.IsSigned && (() => {
                const signedType = getSpotType(currentSpot);
                const sigUrl = currentSpot.SignatureUrl || currentSpot.signatureUrl;
                const fv = currentSpot.FieldValue ?? currentSpot.fieldValue ?? currentSpot.fieldvalue ?? '';
                const isCheckbox = signedType === 'checkbox';
                const isDate = signedType === 'date';
                const displayVal = isCheckbox
                    ? (fv === 'true' ? '✓' : '✗')
                    : isDate && /^\d{4}-\d{2}-\d{2}$/.test(fv)
                        ? fv.split('-').reverse().join('/')
                        : fv;

                return (
                    <div className="lw-signing-signedPreview">
                        <div className="lw-signing-message is-success">{t("signing.canvas.spotAlreadySigned")}</div>
                        {isSignatureLike(signedType) && sigUrl && (
                            <div className="lw-signing-signedImgWrap">
                                <img src={sigUrl} alt={t("signing.spot.signatureAlt")} className="lw-signing-signedImg" />
                            </div>
                        )}
                        {!isSignatureLike(signedType) && String(displayVal).trim() && (
                            <div className="lw-signing-signedFieldValue">
                                <Text14 color={colors.winter}>{t(`signing.fields.${getFieldTypeKey(signedType)}`)}</Text14>
                                <Text14 color={colors.text}>{displayVal}</Text14>
                            </div>
                        )}
                    </div>
                );
            })()}
        </>
    );

    const renderSpotPopup = () => {
        // Never keep the pad open over the finish / optional overlays.
        if (!showSpotPopup || !currentSpot || showCompletion || showOptionalRemaining || isDocumentLocked) {
            return null;
        }
        const spotType = getSpotType(currentSpot);
        const fieldTypeLabel = t(`signing.fields.${getFieldTypeKey(spotType)}`);
        const title = currentSpot.IsSigned
            ? t("signing.canvas.spotAlreadySigned")
            : isSignatureLike(spotType)
                ? (spotType === 'initials' ? t("signing.canvas.saveInitials") : t("signing.canvas.saveSignature"))
                : fieldTypeLabel;

        return (
            <div className="lw-signing-popupOverlay" onClick={closeSpotPopup}>
                <div className="lw-signing-popup" onClick={(e) => e.stopPropagation()}>
                    <div className="lw-signing-popupHeader">
                        <span className="lw-signing-popupTitle">{title}</span>
                        <TertiaryButton size={buttonSizes.SMALL} onPress={closeSpotPopup}>
                            {t("common.close")}
                        </TertiaryButton>
                    </div>
                    <div className="lw-signing-popupBody">
                        {!isDocumentLocked && renderConsentAndOtp()}
                        {!isDocumentLocked && renderSigningControls()}
                    </div>
                </div>
            </div>
        );
    };

    // ─── Screen variant: full-screen PDF + floating bar + popup ───
    if (isScreen) {
        // Keep the same spinner covering chrome until react-pdf Document is ready
        // (avoids: short-link loader → meta loader → PDF loader flash).
        const showPdfBootstrap = !pdfReady;
        return (
            <div className="lw-signing-scope">
                {showPdfBootstrap && (
                    <div className="lw-publicSigningScreen lw-signing-pdfBootstrap" aria-busy="true">
                        <SimpleContainer className="lw-publicSigningScreen__container">
                            <SimpleContainer className="lw-publicSigningScreen__stack">
                                <div className="lw-publicSigningScreen__spinner" aria-hidden="true" />
                                <Text14>{t("signing.public.loadingDocument") || t("signing.canvas.loadingDocument")}</Text14>
                            </SimpleContainer>
                        </SimpleContainer>
                    </div>
                )}
                <div className="lw-signing-screen">
                    <div className="lw-signing-modalContent lw-signing-screenContent">
                        <SimpleContainer className="lw-signing-screenBody">
                            <div className="lw-signing-floatingBar">
                                <div className="lw-signing-progressHint">
                                    {remainingHintText}
                                </div>
                                {remainingCount > 0 && (
                                    <PrimaryButton
                                        size={buttonSizes.SMALL}
                                        onPress={goToNextSigningSpot}
                                        disabled={saving}
                                    >
                                        {nextSpotButtonLabel}
                                    </PrimaryButton>
                                )}
                                {!allSpotsSignedByUser && (
                                    <TertiaryButton
                                        size={buttonSizes.SMALL}
                                        onPress={rejectFile}
                                        disabled={saving}
                                        hasBorder={true}
                                        innerTextColor={colors.error}
                                    >
                                        {t("signing.canvas.rejectDocument")}
                                    </TertiaryButton>
                                )}
                                <SecondaryButton size={buttonSizes.SMALL} onPress={onClose} disabled={saving}>
                                    {t("common.close")}
                                </SecondaryButton>
                            </div>

                            <SimpleContainer className="lw-signing-pdfContainer" ref={pdfScrollRef}>
                                {pdfFile && fileDetails.file?.FileKey ? (
                                    <PdfViewer
                                        pdfFile={pdfFile}
                                        spots={spots}
                                        signers={[{ UserId: fileDetails.file.ClientId, Name: t("signing.canvas.you") }]}
                                        onSelectSpot={handleSpotSelect}
                                        onUpdateSpot={undefined}
                                        onRemoveSpot={undefined}
                                        onAddSpotForPage={undefined}
                                        showAddSpotButtons={false}
                                        selectedSpotId={currentSpot?.SignatureSpotId || currentSpot?.signatureSpotId || null}
                                        onDocumentReady={() => setPdfReady(true)}
                                        suppressLoadingUI
                                    />
                                ) : null}
                            </SimpleContainer>

                        </SimpleContainer>

                        {renderSpotPopup()}
                    </div>
                </div>

                {showOptionalRemaining && !showCompletion && (
                    <div className="lw-signing-completeOverlay" role="dialog" aria-modal="true">
                        <div className="lw-signing-completeCard">
                            <h2 className="lw-signing-completeTitle">{t("signing.canvas.optionalRemainingTitle")}</h2>
                            <p className="lw-signing-completeSubtitle">{t("signing.canvas.optionalRemainingSubtitle")}</p>
                            <div className="lw-signing-completeActions">
                                <PrimaryButton
                                    onPress={() => {
                                        setShowOptionalRemaining(false);
                                        if (unsignedOptionalSpots[0]) {
                                            setCurrentSpot(unsignedOptionalSpots[0]);
                                            scrollToSpot(unsignedOptionalSpots[0]);
                                            if (isScreen) setShowSpotPopup(true);
                                        }
                                    }}
                                >
                                    {t("signing.canvas.optionalRemainingContinue")}
                                </PrimaryButton>
                                <SecondaryButton
                                    onPress={() => {
                                        setShowOptionalRemaining(false);
                                        setShowCompletion(true);
                                    }}
                                >
                                    {t("signing.canvas.optionalRemainingSkip")}
                                </SecondaryButton>
                            </div>
                        </div>
                    </div>
                )}

                {renderCompletionOverlay()}
            </div>
        );
    }

    // ─── Modal variant: original side-panel layout ───
    return (
        <div className="lw-signing-scope">
            <div className="lw-signing-modal" onClick={onClose}>
                <div
                    className="lw-signing-modalContent"
                    onClick={(e) => e.stopPropagation()}
                >

                    <SimpleContainer className="lw-signing-modalBody">
                        <SimpleContainer className="lw-signing-pdfContainer" ref={pdfScrollRef}>
                            {pdfFile && fileDetails.file?.FileKey ? (
                                <PdfViewer
                                    pdfFile={pdfFile}
                                    spots={spots}
                                    signers={[{ UserId: fileDetails.file.ClientId, Name: t("signing.canvas.you") }]}
                                    onSelectSpot={handleSpotSelect}
                                    onUpdateSpot={undefined}
                                    onRemoveSpot={undefined}
                                    onAddSpotForPage={undefined}
                                    showAddSpotButtons={false}
                                    selectedSpotId={currentSpot?.SignatureSpotId || currentSpot?.signatureSpotId || null}
                                />
                            ) : (
                                <SimpleContainer className="lw-signing-pdfLoading">
                                    <SimpleLoader />
                                </SimpleContainer>
                            )}
                        </SimpleContainer>

                        <SimpleContainer className="lw-signing-sidePanel">

                            {!isDocumentLocked && renderConsentAndOtp()}

                            {remainingCount > 1 && (
                                <div>
                                    <div className="lw-signing-nextHeaderRow">
                                        <PrimaryButton
                                            className="lw-signing-nextFocus"
                                            size={buttonSizes.SMALL}
                                            onPress={() => goToNextSigningSpot()}
                                            disabled={saving}
                                        >
                                            {nextSpotButtonLabel}
                                        </PrimaryButton>

                                        <div className="lw-signing-progressHint">
                                            {effectiveRequiredSpots.length > 0 ? remainingHintText : ""}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {(remainingCount > 0 || optionalRemainingCount > 0) && (
                                <div>

                                    <div className="lw-signing-actionsRow">
                                        <TertiaryButton size={buttonSizes.SMALL} onPress={() => setShowAllSpots((v) => !v)}>
                                            {showAllSpots ? t("signing.canvas.hideAllSpots") : t("signing.canvas.showAllSpots")}
                                        </TertiaryButton>
                                    </div>

                                    {showAllSpots && (
                                        <div className="lw-signing-spotsList">
                                            {spots.length === 0 ? (
                                                <div className="lw-signing-emptySpots">{t("signing.canvas.noSpotsToShow")}</div>
                                            ) : (
                                                spots.map((spot, idx) => (
                                                    <div
                                                        key={spot.SignatureSpotId}
                                                        className={
                                                            "lw-signing-spotRow" +
                                                            (spot.IsSigned ? " is-signed" : "") +
                                                            (currentSpot && spot.SignatureSpotId === currentSpot.SignatureSpotId
                                                                ? " is-selected"
                                                                : "")
                                                        }
                                                        onClick={() => handleSpotSelect(idx)}
                                                    >
                                                        <div className="lw-signing-spotName">{spot.SignerName}</div>
                                                        <div className={"lw-signing-spotStatus" + (spot.IsSigned ? " is-signed" : "")}>
                                                            {spot.IsSigned ? t("signing.status.signed") : t("signing.status.pending")}
                                                        </div>
                                                        {spot.IsSigned && (() => {
                                                            const sType = getSpotType(spot);
                                                            const sUrl = spot.SignatureUrl || spot.signatureUrl;
                                                            if (isSignatureLike(sType) && sUrl) {
                                                                return <img src={sUrl} alt="" className="lw-signing-spotRowImg" />;
                                                            }
                                                            const sv = spot.FieldValue ?? spot.fieldValue ?? spot.fieldvalue ?? '';
                                                            if (String(sv).trim()) {
                                                                const dv = sType === 'checkbox' ? (sv === 'true' ? '✓' : '✗')
                                                                    : sType === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(sv) ? sv.split('-').reverse().join('/') : sv;
                                                                return <div className="lw-signing-spotRowValue">{dv}</div>;
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {!isDocumentLocked && renderSigningControls()}

                            {(isDocumentLocked || (allSpotsSignedByUser && spots.length > 0 && optionalRemainingCount === 0)) && !showCompletion && !showOptionalRemaining && (
                                <div className="lw-signing-message is-success">{t("signing.canvas.allRequiredCompleted")}</div>
                            )}
                            {allSpotsSignedByUser && optionalRemainingCount > 0 && !showCompletion && !showOptionalRemaining && (
                                <div className="lw-signing-message is-success">{t("signing.canvas.optionalRemainingHint")}</div>
                            )}
                        </SimpleContainer>
                    </SimpleContainer>

                    <SimpleContainer className="lw-signing-modalFooter">
                        {!isDocumentLocked && !allSpotsSignedByUser && (
                            <TertiaryButton
                                size={buttonSizes.SMALL}
                                onPress={rejectFile}
                                disabled={saving}
                                hasBorder={true}
                                innerTextColor={colors.error}
                            >
                                {t("signing.canvas.rejectDocument")}
                            </TertiaryButton>
                        )}
                        <SecondaryButton size={buttonSizes.SMALL} onPress={onClose} disabled={saving}>
                            {t("common.close")}
                        </SecondaryButton>
                    </SimpleContainer>
                </div>
            </div>

            {showOptionalRemaining && !showCompletion && (
                <div className="lw-signing-completeOverlay" role="dialog" aria-modal="true">
                    <div className="lw-signing-completeCard">
                        <h2 className="lw-signing-completeTitle">{t("signing.canvas.optionalRemainingTitle")}</h2>
                        <p className="lw-signing-completeSubtitle">{t("signing.canvas.optionalRemainingSubtitle")}</p>
                        <div className="lw-signing-completeActions">
                            <PrimaryButton
                                onPress={() => {
                                    setShowOptionalRemaining(false);
                                    if (unsignedOptionalSpots[0]) {
                                        setCurrentSpot(unsignedOptionalSpots[0]);
                                        scrollToSpot(unsignedOptionalSpots[0]);
                                    }
                                }}
                            >
                                {t("signing.canvas.optionalRemainingContinue")}
                            </PrimaryButton>
                            <SecondaryButton
                                onPress={() => {
                                    setShowOptionalRemaining(false);
                                    setShowCompletion(true);
                                }}
                            >
                                {t("signing.canvas.optionalRemainingSkip")}
                            </SecondaryButton>
                        </div>
                    </div>
                </div>
            )}

            {renderCompletionOverlay()}
        </div>
    );
};

export default SignatureCanvas;
