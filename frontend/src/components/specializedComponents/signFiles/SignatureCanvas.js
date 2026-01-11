// src/components/SignatureCanvas.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import signingFilesApi from "../../../api/signingFilesApi";
import ApiUtils from "../../../api/apiUtils";
import PdfViewer from "./pdfViewer/PdfViewer";

import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, Text14 } from "../../specializedComponents/text/AllTextKindFile";

import PrimaryButton from "../../styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../styledComponents/buttons/SecondaryButton";
import TertiaryButton from "../../styledComponents/buttons/TertiaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { colors } from "../../../constant/colors";

import "./signFiles.scss";

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

const CONSENT_TEXT_HE =
    "אני מאשר/ת כי קראתי את המסמך המוצג, ואני נותן/ת הסכמה לחתום עליו באופן אלקטרוני. ידוע לי כי חתימה ללא אימות OTP עשויה להפחית את חוזק הראיות במקרה של מחלוקת.";

const SignatureCanvas = ({ signingFileId, publicToken, onClose, variant = "modal" }) => {
    const canvasRef = useRef(null);
    const pdfScrollRef = useRef(null);
    const lastPointRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [fileDetails, setFileDetails] = useState(null);
    const [pdfFile, setPdfFile] = useState(null);
    const [currentSpot, setCurrentSpot] = useState(null);
    const [message, setMessage] = useState(null);
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
    const [signatureMode, setSignatureMode] = useState("draw"); // 'draw' | 'saved'

    // Court-ready: per-session identifier for audit trail + OTP binding.
    const signingSessionIdRef = useRef(uuidv4());
    const signingSessionId = signingSessionIdRef.current;

    const [consentAccepted, setConsentAccepted] = useState(false);
    const [otpRequested, setOtpRequested] = useState(false);
    const [otpCode, setOtpCode] = useState("");
    const [otpVerified, setOtpVerified] = useState(false);
    const [otpBusy, setOtpBusy] = useState(false);

    const isPublic = Boolean(publicToken);
    const isScreen = variant === "screen";

    const effectiveSigningFileId = useMemo(() => {
        return fileDetails?.file?.SigningFileId || signingFileId;
    }, [fileDetails, signingFileId]);

    const getSpotPage = (spot) => spot?.PageNumber ?? spot?.pageNum ?? spot?.pagenumber ?? 1;
    const getSpotY = (spot) => spot?.Y ?? spot?.y ?? 0;
    const isSpotRequired = (spot) => spot?.IsRequired !== false;

    const getUnsignedRequiredSpots = (spots) => {
        const list = Array.isArray(spots) ? spots : [];
        const required = list.filter((s) => isSpotRequired(s));
        const effective = required.length > 0 ? required : list;
        return effective.filter((s) => !s.IsSigned);
    };

    const focusNextUnsignedSpot = () => {
        const allSpots = fileDetails?.signatureSpots || [];
        const unsigned = getUnsignedRequiredSpots(allSpots);
        const target = (!currentSpot || currentSpot.IsSigned) ? (unsigned[0] || null) : currentSpot;
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

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            try {
                setLoading(true);

                // Fresh session requires explicit consent; OTP state is per session.
                setConsentAccepted(false);
                setOtpRequested(false);
                setOtpCode("");
                setOtpVerified(false);

                const res = isPublic
                    ? await signingFilesApi.getPublicSigningFileDetails(publicToken)
                    : await signingFilesApi.getSigningFileDetails(signingFileId);
                unwrapApi(res);
                const data = res?.data;
                if (!isMounted) return;
                setFileDetails(data);
                // Spec: first interaction jumps to first required spot.
                setCurrentSpot(null);
                setHasStartedNextFlow(false);
                const fileIdForPdf = data?.file?.SigningFileId || signingFileId;
                await loadPdfFromFileKey(fileIdForPdf);
            } catch (err) {
                console.error("Failed to fetch file details", err);
                if (isMounted) setMessage({ type: "error", text: "שגיאה בטעינת המסמך" });
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        load();
        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signingFileId, isPublic, publicToken]);

    useEffect(() => {
        setSavedSignature((p) => ({ ...p, loading: true }));
        refreshSavedSignature().then(() => {
            // Default UX: if saved exists, offer it first.
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPublic, publicToken]);

    useEffect(() => {
        if (!savedSignature.loading) {
            setSignatureMode(savedSignature.exists ? "saved" : "draw");
        }
    }, [savedSignature.exists, savedSignature.loading]);

    useEffect(() => {
        if (currentSpot && canvasRef.current) {
            const canvas = canvasRef.current;
            canvas.width = 400;
            canvas.height = 180;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#999";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.fillText("חתום כאן", canvas.width / 2, canvas.height / 2);
            setHasUserDrawn(false);
            lastPointRef.current = null;
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
        ctx.fillText("חתום כאן", canvas.width / 2, canvas.height / 2);
        setHasUserDrawn(false);
    };

    const getApiErrorMessage = (err) => {
        const msg = err?.response?.data?.message || err?.data?.message || err?.message;
        if (!msg) return "שגיאה לא צפויה";
        return String(msg);
    };

    const unwrapApi = (res) => {
        if (res?.success === false) {
            const err = new Error(res?.data?.message || res?.message || "שגיאה לא צפויה");
            err.data = res?.data || null;
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
            img.onerror = () => reject(new Error("Failed to load signature image"));
        });
        img.src = raw;
        await loaded;

        const targetW = 400;
        const targetH = 180;
        const c = document.createElement("canvas");
        c.width = targetW;
        c.height = targetH;
        const ctx = c.getContext("2d");
        if (!ctx) return raw;

        ctx.clearRect(0, 0, targetW, targetH);
        ctx.fillStyle = "rgba(255,255,255,0)";

        const iw = img.naturalWidth || targetW;
        const ih = img.naturalHeight || targetH;
        const scale = Math.min(targetW / iw, targetH / ih);
        const drawW = Math.max(1, Math.round(iw * scale));
        const drawH = Math.max(1, Math.round(ih * scale));
        const dx = Math.round((targetW - drawW) / 2);
        const dy = Math.round((targetH - drawH) / 2);

        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, dx, dy, drawW, drawH);
        return c.toDataURL("image/png");
    };

    const saveSignatureAsDefault = async (dataUrl) => {
        if (!dataUrl) return;
        if (isPublic) {
            await signingFilesApi.savePublicSavedSignature(publicToken, dataUrl);
        } else {
            await signingFilesApi.saveSavedSignature(dataUrl);
        }
        await refreshSavedSignature();
    };

    const signCurrentSpotWithImage = async (dataUrl, spotOverride = null) => {
        const spot = spotOverride || currentSpot;
        if (!spot || spot.IsSigned) return false;

        const requireOtp = Boolean(fileDetails?.file?.RequireOtp);
        const consentVersion = String(fileDetails?.file?.SigningPolicyVersion || "2026-01-11");

        if (!consentAccepted) {
            setMessage({ type: "warning", text: "יש לאשר הסכמה לחתימה לפני המשך." });
            return false;
        }
        if (requireOtp && !otpVerified) {
            setMessage({ type: "warning", text: "נדרש אימות SMS לפני חתימה." });
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

    const reloadDetailsAndAdvance = async () => {
        const res = isPublic
            ? await signingFilesApi.getPublicSigningFileDetails(publicToken)
            : await signingFilesApi.getSigningFileDetails(effectiveSigningFileId);
        unwrapApi(res);
        const data = res?.data;
        setFileDetails(data);

        const spots = data?.signatureSpots || [];
        const nextUnsigned = getUnsignedRequiredSpots(spots)[0] || null;
        setCurrentSpot(nextUnsigned);
        if (nextUnsigned) {
            scrollToSpot(nextUnsigned);
            setHasStartedNextFlow(true);
        }
        clearCanvas();
    };

    const saveSignature = async () => {
        if (!canvasRef.current || !currentSpot || currentSpot.IsSigned) return;
        setSaving(true);
        try {
            if (!hasUserDrawn) {
                setMessage({ type: "error", text: "נא לחתום לפני השמירה" });
                return;
            }

            const dataUrl = canvasRef.current.toDataURL("image/png");
            const didSign = await signCurrentSpotWithImage(dataUrl);
            if (!didSign) return;
            // Spec: new signature overwrites saved signature
            await saveSignatureAsDefault(dataUrl);

            setMessage({ type: "success", text: "החתימה נשמרה בהצלחה" });
            await reloadDetailsAndAdvance();
            setTimeout(() => setMessage(null), 2000);
        } catch (err) {
            console.error("Failed to save signature", err);
            setMessage({ type: "error", text: "שגיאה בשמירת החתימה" });
        } finally {
            setSaving(false);
        }
    };

    const useSavedSignatureForNext = async () => {
        try {
            if (!savedSignature?.exists) {
                setMessage({ type: "error", text: "אין חתימה שמורה" });
                return;
            }

            const allSpots = fileDetails?.signatureSpots || [];
            const unsigned = getUnsignedRequiredSpots(allSpots);
            const target = (!currentSpot || currentSpot.IsSigned) ? (unsigned[0] || null) : currentSpot;
            if (!target) return;

            if (!currentSpot || currentSpot.IsSigned) {
                setCurrentSpot(target);
                scrollToSpot(target);
                setHasStartedNextFlow(true);
            }

            setSaving(true);
            const sigRes = isPublic
                ? await signingFilesApi.getPublicSavedSignatureDataUrl(publicToken)
                : await signingFilesApi.getSavedSignatureDataUrl();
            unwrapApi(sigRes);
            const rawDataUrl = sigRes?.data?.dataUrl;
            const dataUrl = await normalizeSignatureDataUrl(rawDataUrl);
            if (!dataUrl) {
                throw new Error("Missing saved signature dataUrl");
            }

            setCurrentSpot(target);
            const didSign = await signCurrentSpotWithImage(dataUrl, target);
            if (!didSign) return;

            setMessage({ type: "success", text: "החתימה נשמרה בהצלחה" });
            await reloadDetailsAndAdvance();
            setTimeout(() => setMessage(null), 2000);
        } catch (err) {
            console.error("Failed to use saved signature", err);
            setMessage({ type: "error", text: getApiErrorMessage(err) || "שגיאה בשימוש בחתימה שמורה" });
        } finally {
            setSaving(false);
        }
    };

    const signAllRemainingSpots = async () => {
        try {
            const allSpots = fileDetails?.signatureSpots || [];
            const unsigned = getUnsignedRequiredSpots(allSpots);
            if (!unsigned.length) return;

            setSaving(true);

            let dataUrl;

            if (savedSignature?.exists) {
                const sigRes = isPublic
                    ? await signingFilesApi.getPublicSavedSignatureDataUrl(publicToken)
                    : await signingFilesApi.getSavedSignatureDataUrl();
                unwrapApi(sigRes);
                const rawDataUrl = sigRes?.data?.dataUrl;
                dataUrl = await normalizeSignatureDataUrl(rawDataUrl);
            } else {
                if (!canvasRef.current || !hasUserDrawn) {
                    setMessage({ type: "error", text: "כדי לחתום על הכל יש לבחור חתימה שמורה או לצייר חתימה" });
                    return;
                }
                dataUrl = canvasRef.current.toDataURL("image/png");
            }

            if (!dataUrl) {
                setMessage({ type: "error", text: "לא נמצאה חתימה לשימוש" });
                return;
            }

            // Sign sequentially to avoid overloading the API and keep order predictable.
            for (const spot of unsigned) {
                setCurrentSpot(spot);
                // eslint-disable-next-line no-await-in-loop
                const didSign = await signCurrentSpotWithImage(dataUrl, spot);
                if (!didSign) return;
            }

            setMessage({ type: "success", text: "נחתמו כל המקומות בהצלחה" });
            await reloadDetailsAndAdvance();
            setTimeout(() => setMessage(null), 2000);
        } catch (err) {
            console.error("Failed to sign all spots", err);
            setMessage({ type: "error", text: getApiErrorMessage(err) || "שגיאה בחתימה על כל המקומות" });
        } finally {
            setSaving(false);
        }
    };

    const requestOtp = async () => {
        try {
            setOtpBusy(true);
            const res = isPublic
                ? await signingFilesApi.publicRequestSigningOtp(publicToken, signingSessionId)
                : await signingFilesApi.requestSigningOtp(effectiveSigningFileId, signingSessionId);
            unwrapApi(res);
            setOtpRequested(true);
            setMessage({ type: "success", text: "קוד אימות נשלח ב-SMS" });
        } catch (err) {
            console.error("OTP request failed", err);
            setMessage({ type: "error", text: getApiErrorMessage(err) || "שגיאה בשליחת קוד" });
        } finally {
            setOtpBusy(false);
        }
    };

    const verifyOtp = async () => {
        try {
            const otp = String(otpCode || "").trim();
            if (!/^[0-9]{6}$/.test(otp)) {
                setMessage({ type: "error", text: "נא להזין קוד בן 6 ספרות" });
                return;
            }

            setOtpBusy(true);
            const res = isPublic
                ? await signingFilesApi.publicVerifySigningOtp(publicToken, otp, signingSessionId)
                : await signingFilesApi.verifySigningOtp(effectiveSigningFileId, otp, signingSessionId);
            unwrapApi(res);
            setOtpVerified(true);
            setMessage({ type: "success", text: "הקוד אומת בהצלחה" });
        } catch (err) {
            console.error("OTP verify failed", err);
            setMessage({ type: "error", text: getApiErrorMessage(err) || "שגיאה באימות קוד" });
        } finally {
            setOtpBusy(false);
        }
    };

    const rejectFile = async () => {
        const reason = prompt("מה הסיבה לדחיית המסמך?");
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
            setMessage({ type: "success", text: "המסמך נדחה ונשלחה הודעה לעורך הדין" });
            setTimeout(() => onClose(), 1200);
        } catch (err) {
            console.error("Failed to reject file", err);
            setMessage({ type: "error", text: getApiErrorMessage(err) || "שגיאה בדחיית המסמך" });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="lw-signing-scope">
                <div className={isScreen ? "lw-signing-screen" : "lw-signing-modal"} onClick={isScreen ? undefined : onClose}>
                    <div
                        className={isScreen ? "lw-signing-modalContent lw-signing-screenContent" : "lw-signing-modalContent"}
                        onClick={isScreen ? undefined : (e) => e.stopPropagation()}
                    >
                        <div className="lw-signing-modalHeader">
                            <h3>טוען מסמך...</h3>
                            <TertiaryButton className="lw-signing-closeButton" size={buttonSizes.SMALL} onPress={onClose}>
                                סגור
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
                            <h3>שגיאה בטעינת המסמך</h3>
                            <TertiaryButton className="lw-signing-closeButton" size={buttonSizes.SMALL} onPress={onClose}>
                                סגור
                            </TertiaryButton>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const spots = fileDetails.signatureSpots || [];
    const requiredSpots = spots.filter((s) => isSpotRequired(s));
    const effectiveRequiredSpots = requiredSpots.length > 0 ? requiredSpots : spots;
    const unsignedRequiredSpots = getUnsignedRequiredSpots(spots);
    const remainingCount = unsignedRequiredSpots.length;
    const allSpotsSignedByUser = effectiveRequiredSpots.length > 0 && remainingCount === 0;

    const goToNextSigningSpot = () => {
        const unsigned = unsignedRequiredSpots;
        if (unsigned.length === 0) return;

        if (!hasStartedNextFlow) {
            const first = unsigned[0];
            setCurrentSpot(first);
            scrollToSpot(first);
            setHasStartedNextFlow(true);
            return;
        }

        const currentId = currentSpot?.SignatureSpotId;
        const currentIdx = unsigned.findIndex((s) => s.SignatureSpotId === currentId);
        const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % unsigned.length : 0;
        const nextSpot = unsigned[nextIdx];
        setCurrentSpot(nextSpot);
        scrollToSpot(nextSpot);
    };

    return (
        <div className="lw-signing-scope">
            <div className={isScreen ? "lw-signing-screen" : "lw-signing-modal"} onClick={isScreen ? undefined : onClose}>
                <div
                    className={isScreen ? "lw-signing-modalContent lw-signing-screenContent" : "lw-signing-modalContent"}
                    onClick={isScreen ? undefined : (e) => e.stopPropagation()}
                >

                    <SimpleContainer className="lw-signing-modalBody">
                        <SimpleContainer className="lw-signing-pdfContainer" ref={pdfScrollRef}>
                            {pdfFile && fileDetails.file?.FileKey ? (
                                <PdfViewer
                                    pdfFile={pdfFile}
                                    spots={spots}
                                    signers={[{ UserId: fileDetails.file.ClientId, Name: "אתה" }]}
                                    onUpdateSpot={undefined}
                                    onRemoveSpot={undefined}
                                    onAddSpotForPage={undefined}
                                    showAddSpotButtons={false}
                                />
                            ) : (
                                <SimpleContainer className="lw-signing-inlineHint">
                                    <Text14>בקרוב: תצוגה מקדימה של המסמך</Text14>
                                </SimpleContainer>
                            )}
                        </SimpleContainer>

                        <SimpleContainer className="lw-signing-sidePanel">
                            {message && (
                                <SimpleContainer
                                    className={
                                        "lw-signing-message " +
                                        (message.type === "success" ? "is-success" : message.type === "error" ? "is-error" : "is-warning")
                                    }
                                >
                                    {message.text}
                                </SimpleContainer>
                            )}

                            <div className="lw-signing-legalBox">
                                <label className="lw-signing-legalRow">
                                    <input
                                        type="checkbox"
                                        checked={consentAccepted}
                                        onChange={(e) => setConsentAccepted(Boolean(e.target.checked))}
                                        disabled={saving}
                                    />
                                    <span>{CONSENT_TEXT_HE}</span>
                                </label>
                            </div>

                            {Boolean(fileDetails?.file?.RequireOtp) && (
                                <div className="lw-signing-otpBox">
                                    <div className="lw-signing-otpTitle">נדרש אימות SMS (OTP) לפני חתימה</div>
                                    <div className="lw-signing-otpRow">
                                        <input
                                            className="lw-signing-otpInput"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            placeholder="קוד (6 ספרות)"
                                            value={otpCode}
                                            onChange={(e) => setOtpCode(e.target.value)}
                                            disabled={otpBusy || saving}
                                        />
                                        <PrimaryButton size={buttonSizes.SMALL} onPress={verifyOtp} disabled={otpBusy || saving}>
                                            אמת
                                        </PrimaryButton>
                                    </div>
                                    <div className="lw-signing-actionsRow">
                                        <SecondaryButton size={buttonSizes.SMALL} onPress={requestOtp} disabled={otpBusy || saving}>
                                            {otpRequested ? "שלח שוב" : "שלח קוד"}
                                        </SecondaryButton>
                                        {otpVerified && <div className="lw-signing-otpVerified">אומת</div>}
                                    </div>
                                </div>
                            )}

                            {!allSpotsSignedByUser && remainingCount > 0 && (
                                <div>
                                    <div className="lw-signing-nextHeaderRow">
                                        <PrimaryButton
                                            className="lw-signing-nextFocus"
                                            size={buttonSizes.SMALL}
                                            onPress={() => goToNextSigningSpot()}
                                            disabled={saving}
                                        >
                                            לחתימה הבאה
                                        </PrimaryButton>

                                        <div className="lw-signing-progressHint">
                                            {effectiveRequiredSpots.length > 0 ? `נותרו ${remainingCount} חתימות` : ""}
                                        </div>
                                    </div>

                                    <div className="lw-signing-actionsRow">
                                        <TertiaryButton size={buttonSizes.SMALL} onPress={() => setShowAllSpots((v) => !v)}>
                                            {showAllSpots ? "הסתר את כל המקומות" : "הצג את כל המקומות"}
                                        </TertiaryButton>
                                    </div>

                                    {showAllSpots && (
                                        <div className="lw-signing-spotsList">
                                            {spots.length === 0 ? (
                                                <div className="lw-signing-emptySpots">אין מקומות חתימה להצגה</div>
                                            ) : (
                                                spots.map((spot) => (
                                                    <div
                                                        key={spot.SignatureSpotId}
                                                        className={
                                                            "lw-signing-spotRow" +
                                                            (spot.IsSigned ? " is-signed" : "") +
                                                            (currentSpot && spot.SignatureSpotId === currentSpot.SignatureSpotId
                                                                ? " is-selected"
                                                                : "")
                                                        }
                                                        onClick={() => {
                                                            setCurrentSpot(spot);
                                                            scrollToSpot(spot);
                                                            setHasStartedNextFlow(true);
                                                        }}
                                                    >
                                                        <div className="lw-signing-spotName">{spot.SignerName}</div>
                                                        <div className={"lw-signing-spotStatus" + (spot.IsSigned ? " is-signed" : "")}>
                                                            {spot.IsSigned ? "חתום" : "בהמתנה"}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {savedSignature.exists && signatureMode === "saved" && remainingCount > 0 && (
                                <div className="lw-signing-canvasSection">
                                    <div className="lw-signing-savedSigBox">

                                        <div className="lw-signing-savedSigPreviewWrap">
                                            <TertiaryButton
                                                className="lw-signing-modeToggleButton"
                                                size={buttonSizes.SMALL}
                                                onPress={() => {
                                                    focusNextUnsignedSpot();
                                                    setSignatureMode("draw");
                                                    clearCanvas();
                                                }}
                                                disabled={saving}
                                            >
                                                <Text12 shouldApplyClamping className="lw-signing-modeToggleText">
                                                    {"צייר\nחתימה חדשה"}
                                                </Text12>
                                            </TertiaryButton>

                                            {savedSignature.url ? (
                                                <img
                                                    className="lw-signing-savedSigPreview"
                                                    src={savedSignature.url}
                                                    alt="חתימה שמורה"
                                                />
                                            ) : (
                                                <div className="lw-signing-inlineHint">טוען חתימה שמורה...</div>
                                            )}
                                        </div>

                                        <div className="lw-signing-actionsRow">
                                            <PrimaryButton
                                                size={buttonSizes.SMALL}
                                                onPress={useSavedSignatureForNext}
                                                disabled={saving || !savedSignature.exists}
                                            >
                                                {saving ? "שומר..." : "חתום"}
                                            </PrimaryButton>
                                            <SecondaryButton
                                                size={buttonSizes.SMALL}
                                                onPress={signAllRemainingSpots}
                                                disabled={
                                                    saving ||
                                                    remainingCount === 0 ||
                                                    (!savedSignature?.exists && !(signatureMode !== "saved" && hasUserDrawn))
                                                }
                                            >
                                                חתום על הכל
                                            </SecondaryButton>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {signatureMode !== "saved" && currentSpot && !currentSpot.IsSigned && (
                                <div className="lw-signing-canvasSection">
                                    {savedSignature.exists && (
                                        <div className="lw-signing-toggleSlot">
                                            <TertiaryButton
                                                className="lw-signing-modeToggleButton"
                                                size={buttonSizes.SMALL}
                                                onPress={() => {
                                                    setSignatureMode("saved");
                                                    clearCanvas();
                                                }}
                                                disabled={saving}
                                            >
                                                <Text12 shouldApplyClamping className="lw-signing-modeToggleText">
                                                    {"השתמש\nבחתימה שמורה"}
                                                </Text12>
                                            </TertiaryButton>
                                        </div>
                                    )}

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

                                    <div className="lw-signing-actionsRow">
                                        <SecondaryButton size={buttonSizes.SMALL} onPress={clearCanvas} disabled={saving}>
                                            נקה
                                        </SecondaryButton>
                                        <PrimaryButton size={buttonSizes.SMALL} onPress={saveSignature} disabled={saving}>
                                            {saving ? "שומר..." : "שמור חתימה"}
                                        </PrimaryButton>
                                    </div>
                                </div>
                            )}

                            {currentSpot && currentSpot.IsSigned && (
                                <div className="lw-signing-message is-success">מקום החתימה הזה כבר חתום על ידך</div>
                            )}

                            {allSpotsSignedByUser && spots.length > 0 && (
                                <div className="lw-signing-message is-success">השלמת את כל החתימות הנדרשות!</div>
                            )}
                        </SimpleContainer>
                    </SimpleContainer>

                    <SimpleContainer className="lw-signing-modalFooter">
                        {!allSpotsSignedByUser && (
                            <TertiaryButton
                                size={buttonSizes.SMALL}
                                onPress={rejectFile}
                                disabled={saving}
                                hasBorder={true}
                                innerTextColor={colors.error}
                            >
                                דחה מסמך
                            </TertiaryButton>
                        )}
                        <SecondaryButton size={buttonSizes.SMALL} onPress={onClose} disabled={saving}>
                            סגור
                        </SecondaryButton>
                    </SimpleContainer>
                </div>
            </div>
        </div>
    );
};

export default SignatureCanvas;
