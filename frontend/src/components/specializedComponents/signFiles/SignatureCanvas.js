// src/components/SignatureCanvas.js
import React, { useRef, useState, useEffect } from "react";
import signingFilesApi from "../../../api/signingFilesApi";

const styles = {
    modal: {
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
    },
    modalContent: {
        background: "#fff",
        borderRadius: 8,
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        width: "90%",
        maxWidth: 1000,
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    },
    modalHeader: {
        padding: 16,
        borderBottom: "1px solid #e0e0e0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
    },
    modalBody: {
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        padding: 16,
    },
    modalFooter: {
        padding: 16,
        borderTop: "1px solid #e0e0e0",
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
    },
    closeButton: {
        border: "none",
        background: "none",
        fontSize: 22,
        cursor: "pointer",
    },
    docViewer: {
        border: "1px solid #e0e0e0",
        borderRadius: 4,
        backgroundColor: "#f5f5f5",
        minHeight: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#999",
        fontSize: 14,
    },
    spotsContainer: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
    },
    spotsList: {
        border: "1px solid #e0e0e0",
        borderRadius: 4,
        maxHeight: 220,
        overflowY: "auto",
    },
    spotRow: (signed, isSelected) => ({
        padding: 10,
        borderBottom: "1px solid #f0f0f0",
        backgroundColor: signed ? "#f0f8ff" : "#fff",
        cursor: signed ? "default" : "pointer",
        transition: "all 0.2s ease",
        fontWeight: isSelected ? "bold" : "normal",
        borderLeft: isSelected ? "4px solid #1976d2" : "4px solid transparent",
    }),
    spotName: { fontWeight: 600, color: "#333", fontSize: 14 },
    spotStatus: (signed) => ({
        fontSize: 12,
        color: signed ? "#155724" : "#856404",
        marginTop: 4,
    }),
    canvas: {
        border: "2px solid #1976d2",
        borderRadius: 4,
        backgroundColor: "#fff",
        display: "block",
    },
    btn: (primary, danger) => ({
        padding: "8px 16px",
        borderRadius: 4,
        border: danger ? "none" : "1px solid #ddd",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 600,
        backgroundColor: danger
            ? "#f44336"
            : primary
                ? "#1976d2"
                : "#f5f5f5",
        color: danger || primary ? "#fff" : "#333",
    }),
    message: (type) => ({
        padding: 10,
        borderRadius: 4,
        fontSize: 13,
        marginBottom: 8,
        backgroundColor: type === "error" ? "#f8d7da" : "#d4edda",
        color: type === "error" ? "#721c24" : "#155724",
        border: `1px solid ${type === "error" ? "#f5c6cb" : "#c3e6cb"
            }`,
    }),
};

const SignatureCanvas = ({ signingFileId, onClose }) => {
    const canvasRef = useRef(null);
    const [fileDetails, setFileDetails] = useState(null);
    const [currentSpot, setCurrentSpot] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    // טעינת פרטי המסמך
    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            try {
                setLoading(true);
                const res = await signingFilesApi.getSigningFileDetails(signingFileId);
                // פה res זה אובייקט ApiUtils => { status, data, success }
                const data = res?.data;
                if (!isMounted) return;
                setFileDetails(data);

                const firstUnsigned =
                    data?.signatureSpots?.find((s) => !s.IsSigned) || null;
                setCurrentSpot(firstUnsigned || null);
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

    useEffect(() => {
        if (currentSpot && canvasRef.current) {
            const canvas = canvasRef.current;
            canvas.width = 300;
            canvas.height = 150;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = "#ccc";
            ctx.strokeRect(0, 0, canvas.width, canvas.height);
        }
    }, [currentSpot]);

    const handleMouseDown = (e) => {
        if (!canvasRef.current || !currentSpot || currentSpot.IsSigned) return;
        setIsDrawing(true);

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
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
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#ccc";
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    };

    const saveSignature = async () => {
        if (!canvasRef.current || !currentSpot || currentSpot.IsSigned) return;
        setSaving(true);
        try {
            const dataUrl = canvasRef.current.toDataURL("image/png");

            await signingFilesApi.signFile(signingFileId, {
                signatureSpotId: currentSpot.SignatureSpotId,
                signatureImage: dataUrl,
            });

            setMessage({ type: "success", text: "החתימה נשמרה בהצלחה" });

            // רענון המסמך
            const res = await signingFilesApi.getSigningFileDetails(signingFileId);
            const data = res?.data;
            setFileDetails(data);
            const nextUnsigned =
                data?.signatureSpots?.find((s) => !s.IsSigned) || null;
            setCurrentSpot(nextUnsigned);
            clearCanvas();
        } catch (err) {
            console.error("Failed to save signature", err);
            setMessage({ type: "error", text: "שגיאה בשמירת החתימה" });
        } finally {
            setSaving(false);
        }
    };

    const rejectFile = async () => {
        const reason = prompt("מה הסיבה לדחיית המסמך?");
        if (reason === null) return;

        try {
            await signingFilesApi.rejectSigning(signingFileId, {
                rejectionReason: reason,
            });
            setMessage({ type: "success", text: "המסמך נדחה ונשלחה הודעה לעורך הדין" });
            setTimeout(() => onClose(), 1200);
        } catch (err) {
            console.error("Failed to reject file", err);
            setMessage({ type: "error", text: "שגיאה בדחיית המסמך" });
        }
    };

    if (loading) {
        return (
            <div style={styles.modal} onClick={onClose}>
                <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                    <div style={styles.modalHeader}>
                        <h3>טוען מסמך...</h3>
                        <button style={styles.closeButton} onClick={onClose}>
                            ✕
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!fileDetails) {
        return (
            <div style={styles.modal} onClick={onClose}>
                <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                    <div style={styles.modalHeader}>
                        <h3>שגיאה בטעינת המסמך</h3>
                        <button style={styles.closeButton} onClick={onClose}>
                            ✕
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const spots = fileDetails.signatureSpots || [];

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div style={styles.modalHeader}>
                    <h3>חתימה על מסמך – {fileDetails.file.FileName}</h3>
                    <button style={styles.closeButton} onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div style={styles.modalBody}>
                    <div style={styles.docViewer}>
                        {/* כאן אפשר לחבר בעתיד PDF viewer לפי FileKey */}
                        תצוגה מקדימה של המסמך תתווסף בשלב הבא
                    </div>

                    <div style={styles.spotsContainer}>
                        {message && (
                            <div style={styles.message(message.type)}>
                                {message.text}
                            </div>
                        )}

                        <div>
                            <h4 style={{ margin: "0 0 8px 0", color: "#333" }}>
                                מקומות החתימה במסמך
                            </h4>
                            <div style={styles.spotsList}>
                                {spots.map((spot) => (
                                    <div
                                        key={spot.SignatureSpotId}
                                        style={styles.spotRow(
                                            spot.IsSigned,
                                            currentSpot &&
                                            spot.SignatureSpotId === currentSpot.SignatureSpotId
                                        )}
                                        onClick={() =>
                                            !spot.IsSigned && setCurrentSpot(spot)
                                        }
                                    >
                                        <div style={styles.spotName}>{spot.SignerName}</div>
                                        <div style={styles.spotStatus(spot.IsSigned)}>
                                            {spot.IsSigned ? "✓ חתום" : "○ בהמתנה"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {currentSpot && !currentSpot.IsSigned && (
                            <>
                                <label
                                    style={{
                                        fontWeight: 600,
                                        marginTop: 10,
                                        marginBottom: 4,
                                        color: "#333",
                                    }}
                                >
                                    חתום כאן ({currentSpot.SignerName}):
                                </label>
                                <canvas
                                    ref={canvasRef}
                                    style={styles.canvas}
                                    onMouseDown={handleMouseDown}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                                />
                                <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                                    <button
                                        style={styles.btn(false, false)}
                                        onClick={clearCanvas}
                                    >
                                        🗑️ נקה
                                    </button>
                                    <button
                                        style={styles.btn(true, false)}
                                        onClick={saveSignature}
                                        disabled={saving}
                                    >
                                        {saving ? "שומר..." : "💾 שמור חתימה"}
                                    </button>
                                </div>
                            </>
                        )}

                        {currentSpot && currentSpot.IsSigned && (
                            <div style={styles.message("success")}>
                                ✓ מקום החתימה הזה כבר חתום
                            </div>
                        )}
                    </div>
                </div>

                <div style={styles.modalFooter}>
                    <button
                        style={styles.btn(false, true)}
                        onClick={rejectFile}
                    >
                        👎 דחה מסמך
                    </button>
                    <button
                        style={styles.btn(false, false)}
                        onClick={onClose}
                    >
                        ✕ סגור
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SignatureCanvas;
