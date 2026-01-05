// src/components/SignatureCanvas.js
import React, { useRef, useState, useEffect, useCallback } from "react";
import signingFilesApi from "../../../api/signingFilesApi";
import PdfViewer from "./pdfViewer/PdfViewer";
import ApiUtils from "../../../api/apiUtils";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import SimpleLoader from "../../simpleComponents/SimpleLoader";
import PrimaryButton from "../../styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../styledComponents/buttons/SecondaryButton";
import TertiaryButton from "../../styledComponents/buttons/TertiaryButton";
import { Text14, TextBold14, TextBold24 } from "../../specializedComponents/text/AllTextKindFile";
import "./signFiles.scss";

const SAVED_SIGNATURE_KEY = "lw_savedSignature_png_v1";

const SignatureCanvas = ({ signingFileId, onClose }) => {
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
                const res = await signingFilesApi.getSigningFileDetails(signingFileId);
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
    }, [signingFileId]);

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
            const url = `${baseUrl}/SigningFiles/${encodeURIComponent(signingFileId)}/pdf`;

            const res = await fetch(url, {
                method: "GET",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
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

    const ensureCanvasReadyForStroke = useCallback(() => {
        if (!canvasRef.current) return null;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        if (!hasUserDrawn) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHasUserDrawn(true);
        }

        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        return { canvas, ctx };
    }, [hasUserDrawn]);

    const getPointFromClientXY = useCallback((clientX, clientY) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top,
        };
    }, []);

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

    const handleTouchMove = (e) => {
        const touch = e.touches && e.touches[0];
        if (!touch) return;
        e.preventDefault();
        continueStroke(touch.clientX, touch.clientY);
    };

    const handleTouchEnd = (e) => {
        e.preventDefault();
        endStroke();
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

            await signingFilesApi.signFile(signingFileId, {
                signatureSpotId: currentSpot.SignatureSpotId,
                signatureImage: dataUrl,
            });

            setMessage({ type: "success", text: "✓ החתימה נשמרה בהצלחה" });

            // Reload file details
            const res = await signingFilesApi.getSigningFileDetails(signingFileId);
            const data = res?.data;
            setFileDetails(data);

            const spots = data?.signatureSpots || [];
            const nextUnsigned = spots.find((s) => !s.IsSigned) || null;
            setCurrentSpot(nextUnsigned);
            if (nextUnsigned) {
                setTimeout(() => scrollToSpot(nextUnsigned), 0);
            }
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

    const rejectFile = async () => {
        const reason = prompt("מה הסיבה לדחיית המסמך?");
        if (reason === null) return;

        try {
            setSaving(true);
            await signingFilesApi.rejectSigning(signingFileId, {
                rejectionReason: reason,
            });
            setMessage({ type: "success", text: "✓ המסמך נדחה ונשלחה הודעה לעורך הדין" });
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
            <SimpleContainer className="lw-signing-scope">
                <SimpleContainer className="lw-signing-modal" onClick={onClose}>
                    <SimpleContainer className="lw-signing-modalContent" onClick={(e) => e.stopPropagation()}>
                        <SimpleContainer className="lw-signing-modalHeader">
                            <TextBold14>טוען מסמך...</TextBold14>
                            <TertiaryButton className="lw-signing-closeButton" onPress={onClose}>סגור</TertiaryButton>
                        </SimpleContainer>
                        <SimpleLoader />
                    </SimpleContainer>
                </SimpleContainer>
            </SimpleContainer>
        );
    }

    if (!fileDetails) {
        return (
            <SimpleContainer className="lw-signing-scope">
                <SimpleContainer className="lw-signing-modal" onClick={onClose}>
                    <SimpleContainer className="lw-signing-modalContent" onClick={(e) => e.stopPropagation()}>
                        <SimpleContainer className="lw-signing-modalHeader">
                            <TextBold14>שגיאה בטעינת המסמך</TextBold14>
                            <TertiaryButton className="lw-signing-closeButton" onPress={onClose}>סגור</TertiaryButton>
                        </SimpleContainer>
                    </SimpleContainer>
                </SimpleContainer>
            </SimpleContainer>
        );
    }

    const spots = fileDetails.signatureSpots || [];
    const allSpotsSignedByUser = spots.every((s) => s.IsSigned);

    return (
        <SimpleContainer className="lw-signing-scope">
            <SimpleContainer className="lw-signing-modal" onClick={onClose}>
                <SimpleContainer className="lw-signing-modalContent" onClick={(e) => e.stopPropagation()}>
                    <SimpleContainer className="lw-signing-modalHeader">
                        <TextBold24>חתימה על מסמך – {fileDetails.file.FileName}</TextBold24>
                        <TertiaryButton className="lw-signing-closeButton" onPress={onClose}>סגור</TertiaryButton>
                    </SimpleContainer>

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

                            <SimpleContainer>
                                <TextBold14 className="lw-signing-sectionTitle">
                                    מקומות החתימה ({spots.filter((s) => s.IsSigned).length}/{spots.length})
                                </TextBold14>
                                <SimpleContainer className="lw-signing-spotsList">
                                    {spots.length === 0 ? (
                                        <SimpleContainer className="lw-signing-emptySpots">
                                            <Text14>אין מקומות חתימה להצגה</Text14>
                                        </SimpleContainer>
                                    ) : (
                                        spots.map((spot) => (
                                            <SimpleContainer
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
                                                <SimpleContainer className="lw-signing-spotName">
                                                    {spot.SignerName}
                                                </SimpleContainer>
                                                <SimpleContainer className={"lw-signing-spotStatus" + (spot.IsSigned ? " is-signed" : "")}>
                                                    {spot.IsSigned ? "חתום" : "בהמתנה"}
                                                </SimpleContainer>
                                            </SimpleContainer>
                                        ))
                                    )}
                                </SimpleContainer>
                            </SimpleContainer>

                            {currentSpot && !currentSpot.IsSigned && (
                                <SimpleContainer className="lw-signing-canvasSection">
                                    <TextBold14 className="lw-signing-sectionTitle">
                                        חתום כאן ({currentSpot.SignerName}):
                                    </TextBold14>
                                    <canvas
                                        ref={canvasRef}
                                        className="lw-signing-canvas"
                                        onMouseDown={handleMouseDown}
                                        onMouseMove={handleMouseMove}
                                        onMouseUp={handleMouseUp}
                                        onMouseLeave={handleMouseUp}
                                        onTouchStart={handleTouchStart}
                                        onTouchMove={handleTouchMove}
                                        onTouchEnd={handleTouchEnd}
                                    />
                                    <SimpleContainer className="lw-signing-actionsRow">
                                        <SecondaryButton onPress={clearCanvas}>נקה</SecondaryButton>
                                        <PrimaryButton onPress={saveSignature} isPerforming={saving}>
                                            {saving ? "שומר..." : "שמור חתימה"}
                                        </PrimaryButton>
                                    </SimpleContainer>
                                </SimpleContainer>
                            )}

                            {currentSpot && currentSpot.IsSigned && (
                                <SimpleContainer className="lw-signing-message is-success">
                                    מקום החתימה הזה כבר חתום על ידך
                                </SimpleContainer>
                            )}

                            {allSpotsSignedByUser && spots.length > 0 && (
                                <SimpleContainer className="lw-signing-message is-success">
                                    השלמת את כל החתימות הנדרשות
                                </SimpleContainer>
                            )}
                        </SimpleContainer>
                    </SimpleContainer>

                    <SimpleContainer className="lw-signing-modalFooter">
                        {!allSpotsSignedByUser && (
                            <SecondaryButton
                                className="lw-signing-btn is-danger"
                                onPress={rejectFile}
                                disabled={saving}
                            >
                                דחה מסמך
                            </SecondaryButton>
                        )}
                        <TertiaryButton
                            className="lw-signing-btn"
                            onPress={onClose}
                            disabled={saving}
                        >
                            סגור
                        </TertiaryButton>
                    </SimpleContainer>
                </SimpleContainer>
            </SimpleContainer>
        </SimpleContainer>
    );
};

export default SignatureCanvas;
