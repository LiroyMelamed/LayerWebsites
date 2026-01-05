// src/components/SignatureCanvas.js
import React, { useRef, useState, useEffect, useMemo } from "react";
import signingFilesApi from "../../../api/signingFilesApi";
import PdfViewer from "./pdfViewer/PdfViewer";
import ApiUtils from "../../../api/apiUtils";
import PrimaryButton from "../../styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../styledComponents/buttons/SecondaryButton";
import TertiaryButton from "../../styledComponents/buttons/TertiaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { colors } from "../../../constant/colors";
import "./signFiles.scss";
const SignatureCanvas = ({ signingFileId, publicToken, onClose }) => {
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
    const [saveAsDefault, setSaveAsDefault] = useState(true);

    const isPublic = Boolean(publicToken);
    const effectiveSigningFileId = useMemo(() => {
        return fileDetails?.file?.SigningFileId || signingFileId;
    }, [fileDetails, signingFileId]);

    const getSpotPage = (spot) => spot?.PageNumber ?? spot?.pageNum ?? spot?.pagenumber ?? 1;
    const getSpotY = (spot) => spot?.Y ?? spot?.y ?? 0;

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
            if (attempt < 15) {
                setTimeout(() => scrollToSpot(spot, attempt + 1), 100);
            }
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

    // Load file details and PDF
    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            try {
                setLoading(true);
                const res = isPublic
                    ? await signingFilesApi.getPublicSigningFileDetails(publicToken)
                    : await signingFilesApi.getSigningFileDetails(signingFileId);
                const data = res?.data;

                if (!isMounted) return;
                setFileDetails(data);

                // Find first unsigned spot for this client
                const spots = data?.signatureSpots || [];
                const firstUnsigned = spots.find((s) => !s.IsSigned) || null;
                setCurrentSpot(firstUnsigned || null);
                if (firstUnsigned) {
                    setTimeout(() => scrollToSpot(firstUnsigned), 0);
                }

                // Load PDF from fileKey
                if (data?.file?.FileKey) {
                    loadPdfFromFileKey(data.file.FileKey);
                }
            } catch (err) {
                console.error("Failed to fetch file details", err);
                if (isMounted) {
                    setMessage({ type: "error", text: "שגיאה בטעינת המסמך" });
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        load();

        return () => {
            isMounted = false;
        };
    }, [signingFileId, isPublic, publicToken]);

    // Load saved signature for this user (auth) or token user (public)
    useEffect(() => {
        let isMounted = true;

        const loadSaved = async () => {
            try {
                setSavedSignature((p) => ({ ...p, loading: true }));
                const res = isPublic
                    ? await signingFilesApi.getPublicSavedSignature(publicToken)
                    : await signingFilesApi.getSavedSignature();
                const data = res?.data;
                if (!isMounted) return;

                const exists = Boolean(data?.exists);
                const url = data?.url || null;
                setSavedSignature({ loading: false, exists, url });

                // Default UX: if a saved signature exists, offer it first.
                setSignatureMode(exists ? "saved" : "draw");
                // If there's no saved signature yet, saving the first draw is usually desired.
                setSaveAsDefault(!exists);
            } catch (err) {
                console.warn("Failed to load saved signature", err);
                if (!isMounted) return;
                setSavedSignature({ loading: false, exists: false, url: null });
                setSignatureMode("draw");
                setSaveAsDefault(true);
            }
        };

        loadSaved();
        return () => {
            isMounted = false;
        };
    }, [isPublic, publicToken]);

    // Setup canvas when current spot changes
    useEffect(() => {
        if (currentSpot && canvasRef.current) {
            const canvas = canvasRef.current;
            canvas.width = 400;
            canvas.height = 180;
            const ctx = canvas.getContext("2d");
            // Keep canvas transparent so exported PNG has no white background.
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#999";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.fillText("חתום כאן", canvas.width / 2, canvas.height / 2);
            setHasUserDrawn(false);
            lastPointRef.current = null;
        }
    }, [currentSpot]);

    const loadPdfFromFileKey = async (fileKey) => {
        try {
            // PdfPage currently expects a Blob (it calls URL.createObjectURL).
            // So we fetch the PDF ourselves (with auth) and pass a Blob to PdfViewer/PdfPage.
            const baseUrl = ApiUtils?.defaults?.baseURL || ""; // e.g. http://localhost:5000/api
            const token = localStorage.getItem("token");
            const url = isPublic
                ? `${baseUrl}/SigningFiles/public/${encodeURIComponent(publicToken)}/pdf`
                : `${baseUrl}/SigningFiles/${encodeURIComponent(effectiveSigningFileId)}/pdf`;

            const res = await fetch(url, {
                method: "GET",
                headers: !isPublic && token ? { Authorization: `Bearer ${token}` } : {},
            });

            if (!res.ok) {
                throw new Error(`PDF fetch failed: ${res.status}`);
            }

            const blob = await res.blob();
            setPdfFile(blob);
        } catch (err) {
            console.error("Failed to load PDF", err);
            setPdfFile(null);
        }
    };

    const startDrawing = (e) => {
        if (!canvasRef.current || !currentSpot || currentSpot.IsSigned) return;

        // Prevent touch scroll/zoom while drawing (especially in iframes on mobile).
        if (typeof e?.preventDefault === "function") e.preventDefault();

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        setIsDrawing(true);

        // Capture pointer so we keep receiving move/up even if finger leaves the canvas.
        try {
            if (typeof canvas.setPointerCapture === "function" && e?.pointerId != null) {
                canvas.setPointerCapture(e.pointerId);
            }
        } catch {
            // ignore
        }

        // Clear placeholder text on first stroke so it won't be included in the saved image.
        if (!hasUserDrawn) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHasUserDrawn(true);
        }

        const rect = canvas.getBoundingClientRect();
        const clientX = e?.clientX ?? e?.touches?.[0]?.clientX;
        const clientY = e?.clientY ?? e?.touches?.[0]?.clientY;
        if (clientX == null || clientY == null) return;

        const x = clientX - rect.left;
        const y = clientY - rect.top;

        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

    const drawMove = (e) => {
        if (!isDrawing || !canvasRef.current) return;
        if (typeof e?.preventDefault === "function") e.preventDefault();

    const getPointFromClientXY = useCallback((clientX, clientY) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const clientX = e?.clientX ?? e?.touches?.[0]?.clientX;
        const clientY = e?.clientY ?? e?.touches?.[0]?.clientY;
        if (clientX == null || clientY == null) return;

        const x = clientX - rect.left;
        const y = clientY - rect.top;

    const startStroke = useCallback(
        (clientX, clientY) => {
            if (!canvasRef.current || !currentSpot || currentSpot.IsSigned) return;
            const ready = ensureCanvasReadyForStroke();
            if (!ready) return;
            const point = getPointFromClientXY(clientX, clientY);
            if (!point) return;

            setIsDrawing(true);
            lastPointRef.current = point;
            ready.ctx.beginPath();
            ready.ctx.moveTo(point.x, point.y);
        },
        [currentSpot, ensureCanvasReadyForStroke, getPointFromClientXY]
    );

    const continueStroke = useCallback(
        (clientX, clientY) => {
            if (!isDrawing || !canvasRef.current) return;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            const point = getPointFromClientXY(clientX, clientY);
            if (!point) return;

            ctx.lineTo(point.x, point.y);
            ctx.stroke();
            lastPointRef.current = point;
        },
        [getPointFromClientXY, isDrawing]
    );

    const endStroke = useCallback(() => {
        setIsDrawing(false);
        lastPointRef.current = null;
    }, []);

    const handleMouseDown = (e) => startStroke(e.clientX, e.clientY);
    const handleMouseMove = (e) => continueStroke(e.clientX, e.clientY);
    const handleMouseUp = () => endStroke();

    const handleTouchStart = (e) => {
        const touch = e.touches && e.touches[0];
        if (!touch) return;
        e.preventDefault();
        startStroke(touch.clientX, touch.clientY);
    };

    const endDrawing = () => {
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#999";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.fillText("חתום כאן", canvas.width / 2, canvas.height / 2);
        setHasUserDrawn(false);
    };

    const fetchUrlAsDataUrl = async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch saved signature: ${res.status}`);
        const blob = await res.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Failed to read signature blob"));
            reader.readAsDataURL(blob);
        });
    };

    const maybeSaveSignatureAsDefault = async (dataUrl) => {
        if (!saveAsDefault) return;
        if (!dataUrl) return;

        if (isPublic) {
            await signingFilesApi.savePublicSavedSignature(publicToken, dataUrl);
        } else {
            await signingFilesApi.saveSavedSignature(dataUrl);
        }

        // Refresh saved signature URL so it can be reused immediately.
        try {
            const res = isPublic
                ? await signingFilesApi.getPublicSavedSignature(publicToken)
                : await signingFilesApi.getSavedSignature();
            const data = res?.data;
            setSavedSignature({
                loading: false,
                exists: Boolean(data?.exists),
                url: data?.url || null,
            });
        } catch {
            // ignore refresh errors
        }
    };

    const signCurrentSpotWithImage = async (dataUrl) => {
        if (!currentSpot || currentSpot.IsSigned) return;

        if (isPublic) {
            await signingFilesApi.publicSignFile(publicToken, {
                signatureSpotId: currentSpot.SignatureSpotId,
                signatureImage: dataUrl,
            });
        } else {
            await signingFilesApi.signFile(effectiveSigningFileId, {
                signatureSpotId: currentSpot.SignatureSpotId,
                signatureImage: dataUrl,
            });
        }
    };

    const saveSignature = async () => {
        if (!canvasRef.current || !currentSpot || currentSpot.IsSigned) return;
        setSaving(true);
        try {
            const savedSignature = localStorage.getItem(SAVED_SIGNATURE_KEY);
            const canUseSaved = Boolean(savedSignature);

            if (!hasUserDrawn && !canUseSaved) {
                setMessage({ type: "error", text: "נא לחתום לפני השמירה" });
                return;
            }

            const dataUrl = hasUserDrawn
                ? canvasRef.current.toDataURL("image/png")
                : savedSignature;

            if (hasUserDrawn && dataUrl) {
                localStorage.setItem(SAVED_SIGNATURE_KEY, String(dataUrl));
            }

            await signCurrentSpotWithImage(dataUrl);
            await maybeSaveSignatureAsDefault(dataUrl);

            setMessage({ type: "success", text: "החתימה נשמרה בהצלחה" });

            // Reload file details
            const res = isPublic
                ? await signingFilesApi.getPublicSigningFileDetails(publicToken)
                : await signingFilesApi.getSigningFileDetails(effectiveSigningFileId);
            const data = res?.data;
            setFileDetails(data);

            const spots = data?.signatureSpots || [];
            const nextUnsigned = spots.find((s) => !s.IsSigned) || null;
            setCurrentSpot(nextUnsigned);
            if (nextUnsigned) scrollToSpot(nextUnsigned);
            clearCanvas();

            // Clear message after 2 seconds
            setTimeout(() => setMessage(null), 2000);
        } catch (err) {
            console.error("Failed to save signature", err);
            setMessage({ type: "error", text: "שגיאה בשמירת החתימה: " + (err?.message || "") });
        } finally {
            setSaving(false);
        }
    };

    const useSavedSignatureForNext = async () => {
        if (!savedSignature?.exists || !savedSignature?.url) {
            setMessage({ type: "error", text: "אין חתימה שמורה" });
            return;
        }

        if (!currentSpot || currentSpot.IsSigned) return;

        try {
            setSaving(true);
            const dataUrl = await fetchUrlAsDataUrl(savedSignature.url);
            await signCurrentSpotWithImage(dataUrl);

            setMessage({ type: "success", text: "החתימה נשמרה בהצלחה" });

            const res = isPublic
                ? await signingFilesApi.getPublicSigningFileDetails(publicToken)
                : await signingFilesApi.getSigningFileDetails(effectiveSigningFileId);
            const data = res?.data;
            setFileDetails(data);

            const spots = data?.signatureSpots || [];
            const nextUnsigned = spots.find((s) => !s.IsSigned) || null;
            setCurrentSpot(nextUnsigned);
            if (nextUnsigned) scrollToSpot(nextUnsigned);
            clearCanvas();

            setTimeout(() => setMessage(null), 2000);
        } catch (err) {
            console.error("Failed to use saved signature", err);
            setMessage({ type: "error", text: "שגיאה בשימוש בחתימה שמורה" });
        } finally {
            setSaving(false);
        }
    };

    const rejectFile = async () => {
        const reason = prompt("מה הסיבה לדחיית המסמך?");
        if (reason === null) return;

        try {
            setSaving(true);
            if (isPublic) {
                await signingFilesApi.publicRejectSigning(publicToken, {
                    rejectionReason: reason,
                });
            } else {
                await signingFilesApi.rejectSigning(effectiveSigningFileId, {
                    rejectionReason: reason,
                });
            }
            setMessage({ type: "success", text: "המסמך נדחה ונשלחה הודעה לעורך הדין" });
            setTimeout(() => onClose(), 1200);
        } catch (err) {
            console.error("Failed to reject file", err);
            setMessage({ type: "error", text: "שגיאה בדחיית המסמך" });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="lw-signing-scope">
                <div className="lw-signing-modal" onClick={onClose}>
                    <div className="lw-signing-modalContent" onClick={(e) => e.stopPropagation()}>
                        <div className="lw-signing-modalHeader">
                            <h3>טוען מסמך...</h3>
                            <TertiaryButton
                                size={buttonSizes.SMALL}
                                onPress={onClose}
                                style={{ marginInlineStart: "auto" }}
                            >
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
                <div className="lw-signing-modal" onClick={onClose}>
                    <div className="lw-signing-modalContent" onClick={(e) => e.stopPropagation()}>
                        <div className="lw-signing-modalHeader">
                            <h3>שגיאה בטעינת המסמך</h3>
                            <TertiaryButton
                                size={buttonSizes.SMALL}
                                onPress={onClose}
                                style={{ marginInlineStart: "auto" }}
                            >
                                סגור
                            </TertiaryButton>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const spots = fileDetails.signatureSpots || [];
    const allSpotsSignedByUser = spots.every((s) => s.IsSigned);
    const signedCount = spots.filter((s) => s.IsSigned).length;
    const remainingCount = Math.max(0, spots.length - signedCount);

    const goToNextSigningSpot = () => {
        const unsigned = spots.filter((s) => !s.IsSigned);
        if (unsigned.length === 0) return;

        // First press should *focus* the first signing spot.
        if (!hasStartedNextFlow) {
            const first = unsigned[0];
            setCurrentSpot(first);
            scrollToSpot(first);
            setHasStartedNextFlow(true);
            return;
        }

        const currentId = currentSpot?.SignatureSpotId;
        const currentIdx = unsigned.findIndex((s) => s.SignatureSpotId === currentId);
        const nextSpot = currentIdx >= 0
            ? unsigned[Math.min(currentIdx + 1, unsigned.length - 1)]
            : unsigned[0];

        setCurrentSpot(nextSpot);
        scrollToSpot(nextSpot);
    };

    return (
        <div className="lw-signing-scope">
            <div className="lw-signing-modal" onClick={onClose}>
                <div className="lw-signing-modalContent" onClick={(e) => e.stopPropagation()}>
                    <div className="lw-signing-modalHeader">
                        <h3>חתימה על מסמך – {fileDetails.file.FileName}</h3>
                        <TertiaryButton
                            size={buttonSizes.SMALL}
                            onPress={onClose}
                            style={{ marginInlineStart: "auto" }}
                        >
                            סגור
                        </TertiaryButton>
                    </div>

                    <SimpleContainer className="lw-signing-modalBody">
                        <SimpleContainer className="lw-signing-pdfContainer" ref={pdfScrollRef}>
                            {pdfFile && fileDetails.file?.FileKey ? (
                                <PdfViewer
                                    pdfFile={pdfFile}
                                    spots={spots}
                                    signers={[{ UserId: fileDetails.file.ClientId, Name: "אתה" }]}
                                    onUpdateSpot={() => { }}
                                    onRemoveSpot={() => { }}
                                    onAddSpotForPage={() => { }}
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
                                        (message.type === "success"
                                            ? "is-success"
                                            : message.type === "error"
                                                ? "is-error"
                                                : "is-warning")
                                    }
                                >
                                    {message.text}
                                </SimpleContainer>
                            )}

                            {/* Spots List */}
                            <div>
                                <div className="lw-signing-nextHeaderRow">
                                    <PrimaryButton
                                        size={buttonSizes.SMALL}
                                        onPress={goToNextSigningSpot}
                                        disabled={saving}
                                    >
                                        לחתימה הבאה
                                    </PrimaryButton>

                                    <div className="lw-signing-progressHint" style={{ margin: 0 }}>
                                        {spots.length > 0
                                            ? remainingCount > 0
                                                ? `נותרו ${remainingCount} חתימות`
                                                : "כל החתימות הושלמו"
                                            : ""}
                                    </div>
                                </div>

                                {remainingCount > 0 && (
                                    <div className="lw-signing-actionsRow" style={{ marginTop: "0.5rem" }}>
                                        <TertiaryButton
                                            size={buttonSizes.SMALL}
                                            onPress={() => setShowAllSpots((v) => !v)}
                                        >
                                            {showAllSpots ? "הסתר את כל המקומות" : "הצג את כל המקומות"}
                                        </TertiaryButton>

                                    </div>
                                )}

                                {showAllSpots && (
                                    <div className="lw-signing-spotsList">
                                        {spots.length === 0 ? (
                                            <div className="lw-signing-emptySpots">
                                                אין מקומות חתימה להצגה
                                            </div>
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
                                                    }}
                                                >
                                                    <div className="lw-signing-spotName">
                                                        {spot.SignerName}
                                                    </div>
                                                    <div className={"lw-signing-spotStatus" + (spot.IsSigned ? " is-signed" : "")}>
                                                        {spot.IsSigned ? "חתום" : "בהמתנה"}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Next signing step */}
                            {currentSpot && !currentSpot.IsSigned && (
                                <div className="lw-signing-canvasSection">
                                    {savedSignature.exists && signatureMode === "saved" ? (
                                        <div className="lw-signing-savedSigBox">
                                            {savedSignature.url ? (
                                                <img
                                                    className="lw-signing-savedSigPreview"
                                                    src={savedSignature.url}
                                                    alt="חתימה שמורה"
                                                />
                                            ) : (
                                                <div className="lw-signing-inlineHint">טוען חתימה שמורה...</div>
                                            )}

                                            <div className="lw-signing-actionsRow">
                                                <PrimaryButton
                                                    size={buttonSizes.SMALL}
                                                    onPress={useSavedSignatureForNext}
                                                    disabled={saving || !savedSignature.url}
                                                >
                                                    {saving ? "שומר..." : "השתמש בחתימה השמורה"}
                                                </PrimaryButton>
                                                <SecondaryButton
                                                    size={buttonSizes.SMALL}
                                                    onPress={() => {
                                                        setSignatureMode("draw");
                                                        setSaveAsDefault(false);
                                                        clearCanvas();
                                                    }}
                                                    disabled={saving}
                                                >
                                                    צייר חתימה חדשה
                                                </SecondaryButton>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {savedSignature.exists && (
                                                <div className="lw-signing-savedSigTopRow">
                                                    <SecondaryButton
                                                        size={buttonSizes.SMALL}
                                                        onPress={() => {
                                                            setSignatureMode("saved");
                                                            setSaveAsDefault(false);
                                                            clearCanvas();
                                                        }}
                                                        disabled={saving}
                                                    >
                                                        השתמש בחתימה השמורה
                                                    </SecondaryButton>
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
                                                // Fallback for older browsers that don't fully support Pointer Events
                                                onTouchStart={startDrawing}
                                                onTouchMove={drawMove}
                                                onTouchEnd={endDrawing}
                                            />

                                            <label className="lw-signing-checkboxRow">
                                                <input
                                                    type="checkbox"
                                                    checked={saveAsDefault}
                                                    onChange={(e) => setSaveAsDefault(e.target.checked)}
                                                    disabled={saving}
                                                />
                                                שמור חתימה לשימוש חוזר
                                            </label>

                                            <div className="lw-signing-actionsRow">
                                                <SecondaryButton
                                                    size={buttonSizes.SMALL}
                                                    onPress={clearCanvas}
                                                    disabled={saving}
                                                >
                                                    נקה
                                                </SecondaryButton>
                                                <PrimaryButton
                                                    size={buttonSizes.SMALL}
                                                    onPress={saveSignature}
                                                    disabled={saving}
                                                >
                                                    {saving ? "שומר..." : "שמור חתימה"}
                                                </PrimaryButton>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {currentSpot && currentSpot.IsSigned && (
                                <div className="lw-signing-message is-success">
                                    מקום החתימה הזה כבר חתום על ידך
                                </div>
                            )}

                            {allSpotsSignedByUser && spots.length > 0 && (
                                <div className="lw-signing-message is-success">
                                    השלמת את כל החתימות הנדרשות!
                                </div>
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
                        <SecondaryButton
                            size={buttonSizes.SMALL}
                            onPress={onClose}
                            disabled={saving}
                        >
                            סגור
                        </SecondaryButton>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SignatureCanvas;
