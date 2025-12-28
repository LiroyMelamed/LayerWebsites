// src/components/SignatureCanvas.js
import React, { useRef, useState, useEffect } from "react";
import signingFilesApi from "../../../api/signingFilesApi";
import PdfViewer from "./pdfViewer/PdfViewer";
import ApiUtils from "../../../api/apiUtils";
import "./signFiles.scss";
const SignatureCanvas = ({ signingFileId, onClose }) => {
    const canvasRef = useRef(null);
    const pdfScrollRef = useRef(null);

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

    const handleMouseDown = (e) => {
        if (!canvasRef.current || !currentSpot || currentSpot.IsSigned) return;
        setIsDrawing(true);

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        // Clear placeholder text on first stroke so it won't be included in the saved image.
        if (!hasUserDrawn) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHasUserDrawn(true);
        }
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const handleMouseMove = (e) => {
        if (!isDrawing || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const handleMouseUp = () => {
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

    const saveSignature = async () => {
        if (!canvasRef.current || !currentSpot || currentSpot.IsSigned) return;
        setSaving(true);
        try {
            if (!hasUserDrawn) {
                setMessage({ type: "error", text: "נא לחתום לפני השמירה" });
                return;
            }
            const dataUrl = canvasRef.current.toDataURL("image/png");

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
            <div className="lw-signing-scope">
                <div className="lw-signing-modal" onClick={onClose}>
                    <div className="lw-signing-modalContent" onClick={(e) => e.stopPropagation()}>
                        <div className="lw-signing-modalHeader">
                            <h3>🔄 טוען מסמך...</h3>
                            <button className="lw-signing-closeButton" onClick={onClose}>
                                ✕
                            </button>
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
                            <h3>❌ שגיאה בטעינת המסמך</h3>
                            <button className="lw-signing-closeButton" onClick={onClose}>
                                ✕
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const spots = fileDetails.signatureSpots || [];
    const allSpotsSignedByUser = spots.every((s) => s.IsSigned);

    return (
        <div className="lw-signing-scope">
            <div className="lw-signing-modal" onClick={onClose}>
                <div className="lw-signing-modalContent" onClick={(e) => e.stopPropagation()}>
                    <div className="lw-signing-modalHeader">
                        <h3>✍️ חתימה על מסמך – {fileDetails.file.FileName}</h3>
                        <button className="lw-signing-closeButton" onClick={onClose}>
                            ✕
                        </button>
                    </div>

                    <div className="lw-signing-modalBody">
                        {/* PDF Viewer Section */}
                        <div className="lw-signing-pdfContainer" ref={pdfScrollRef}>
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
                                <div className="lw-signing-inlineHint">
                                    בקרוב: תצוגה מקדימה של המסמך
                                </div>
                            )}
                        </div>

                        {/* Signature Panel */}
                        <div className="lw-signing-sidePanel">
                            {message && (
                                <div
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
                                </div>
                            )}

                            {/* Spots List */}
                            <div>
                                <h4 className="lw-signing-sectionTitle">
                                    מקומות החתימה ({spots.filter((s) => s.IsSigned).length}/{spots.length})
                                </h4>
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
                                                    {spot.IsSigned ? "✓ " : "○ "}{spot.SignerName}
                                                </div>
                                                <div className={"lw-signing-spotStatus" + (spot.IsSigned ? " is-signed" : "")}>
                                                    {spot.IsSigned ? "חתום" : "בהמתנה"}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Canvas Section */}
                            {currentSpot && !currentSpot.IsSigned && (
                                <div className="lw-signing-canvasSection">
                                    <label className="lw-signing-sectionTitle">
                                        👇 חתום כאן ({currentSpot.SignerName}):
                                    </label>
                                    <canvas
                                        ref={canvasRef}
                                        className="lw-signing-canvas"
                                        onMouseDown={handleMouseDown}
                                        onMouseMove={handleMouseMove}
                                        onMouseUp={handleMouseUp}
                                        onMouseLeave={handleMouseUp}
                                    />
                                    <div className="lw-signing-actionsRow">
                                        <button
                                            className="lw-signing-btn"
                                            onClick={clearCanvas}
                                        >
                                            🗑️ נקה
                                        </button>
                                        <button
                                            className="lw-signing-btn is-primary"
                                            onClick={saveSignature}
                                            disabled={saving}
                                        >
                                            {saving ? "🔄 שומר..." : "💾 שמור חתימה"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {currentSpot && currentSpot.IsSigned && (
                                <div className="lw-signing-message is-success">
                                    ✓ מקום החתימה הזה כבר חתום על ידך
                                </div>
                            )}

                            {allSpotsSignedByUser && spots.length > 0 && (
                                <div className="lw-signing-message is-success">
                                    🎉 השלמת את כל החתימות הנדרשות!
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="lw-signing-modalFooter">
                        {!allSpotsSignedByUser && (
                            <button
                                className="lw-signing-btn is-danger"
                                onClick={rejectFile}
                                disabled={saving}
                            >
                                👎 דחה מסמך
                            </button>
                        )}
                        <button
                            className="lw-signing-btn"
                            onClick={onClose}
                            disabled={saving}
                        >
                            ✕ סגור
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SignatureCanvas;
