// src/screens/signingScreen/UploadFileForSigningScreen.js
import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useScreenSize } from "../../providers/ScreenSizeProvider";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";

import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";

import { images } from "../../assets/images/images";
import signingFilesApi from "../../api/signingFilesApi";
import SignatureSpotMarker from "../../components/specializedComponents/signFiles/SignatureSpotMarker";

import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";
import { AdminStackName } from "../../navigation/AdminStack";
import { SigningManagerScreenName } from "./SigningManagerScreen";
import { uploadFileToR2 } from "../../utils/fileUploadUtils";

export const uploadFileForSigningScreenName = "/upload-file-for-signing";

const styles = {
    screenStyle: (isSmallScreen) => ({
        boxSizing: "border-box",
        flexDirection: "column",
        padding: isSmallScreen ? 0 : 16,
    }),
    headerRow: {
        alignItems: "center",
        marginBottom: 16,
    },
    formCard: {
        direction: 'rtl',
        flexDirection: "column",
        borderRadius: 8,
        border: "1px solid #e0e0e0",
        padding: 16,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    },
    formGroup: {
        marginBottom: 16,
        width: "100%",
    },
    label: {
        display: "block",
        marginBottom: 6,
        fontWeight: 600,
        fontSize: 14,
        color: "#333",
    },
    input: {
        width: "100%",
        padding: 8,
        borderRadius: 4,
        border: "1px solid #ddd",
        fontSize: 14,
        boxSizing: "border-box",
    },
    textarea: {
        width: "100%",
        minHeight: 80,
        padding: 8,
        borderRadius: 4,
        border: "1px solid #ddd",
        fontSize: 14,
        resize: "vertical",
        boxSizing: "border-box",
    },
    fileBox: (isDragActive) => ({
        border: "2px dashed #1976d2",
        borderRadius: 4,
        padding: 24,
        textAlign: "center",
        backgroundColor: isDragActive ? "#f0f8ff" : "#fff",
        cursor: "pointer",
    }),
    fileName: {
        marginTop: 12,
        padding: 10,
        borderRadius: 4,
        backgroundColor: "#d4edda",
        border: "1px solid #c3e6cb",
        color: "#155724",
        fontSize: 14,
    },
    spotsHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 8,
        marginBottom: 8,
    },
    spotsContainer: {
        display: "grid",
        gap: 12,
        marginTop: 8,
    },
    infoText: {
        fontSize: 13,
        color: "#777",
        marginTop: 4,
    },
    actionsRow: {
        flexDirection: "row",
        gap: 8,
        marginTop: 16,
        flexWrap: "wrap",
    },
    errorMsg: {
        padding: 10,
        marginBottom: 12,
        borderRadius: 4,
        backgroundColor: "#f8d7da",
        border: "1px solid #f5c6cb",
        color: "#721c24",
        fontSize: 14,
    },
    successMsg: {
        padding: 10,
        marginBottom: 12,
        borderRadius: 4,
        backgroundColor: "#d4edda",
        border: "1px solid #c3e6cb",
        color: "#155724",
        fontSize: 14,
    },
};

export default function UploadFileForSigningScreen() {
    const { isSmallScreen } = useScreenSize();
    const navigate = useNavigate();

    const [caseId, setCaseId] = useState("");
    const [clientId, setClientId] = useState("");
    const [notes, setNotes] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);
    const [signatureSpots, setSignatureSpots] = useState([]);
    const [isDragActive, setIsDragActive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
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
        const file = e.dataTransfer.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const handleAddSpot = () => {
        setSignatureSpots((prev) => [
            ...prev,
            {
                pageNum: 1,
                x: 50,
                y: 50,
                width: 150,
                height: 75,
                signerName: `חתימה ${prev.length + 1}`,
                isRequired: true,
            },
        ]);
    };

    const handleRemoveSpot = (index) => {
        setSignatureSpots((prev) => prev.filter((_, i) => i !== index));
    };

    const handleUpdateSpot = (index, updates) => {
        setSignatureSpots((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], ...updates };
            return next;
        });
    };

    const validateForm = () => {
        if (!caseId || !clientId || !selectedFile) {
            setMessage({
                type: "error",
                text: "נא למלא תיק, לקוח ולבחור קובץ.",
            });
            return false;
        }

        if (signatureSpots.length === 0) {
            setMessage({
                type: "error",
                text: "יש להגדיר לפחות מקום חתימה אחד במסמך.",
            });
            return false;
        }

        return true;
    };

    const handleSubmit = async () => {
        setMessage(null);

        if (!validateForm()) return;

        try {
            setLoading(true);

            // 1) העלאת הקובץ ל-R2
            const { key } = await uploadFileToR2(selectedFile);

            // 2) יצירת רשומת SigningFile + SignatureSpots
            await signingFilesApi.uploadFileForSigning({
                caseId: Number(caseId),
                clientId: Number(clientId),
                fileName: selectedFile.name,
                fileKey: key,
                signatureLocations: signatureSpots,
                notes: notes || null,
            });

            setMessage({
                type: "success",
                text: "הקובץ נשלח ללקוח לחתימה. הוא יקבל התראה באפליקציה.",
            });

            // איפוס טופס
            setCaseId("");
            setClientId("");
            setNotes("");
            setSelectedFile(null);
            setSignatureSpots([]);

            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        } catch (err) {
            console.error("upload file for signing error", err);
            setMessage({
                type: "error",
                text: "שגיאה בשליחת הקובץ לחתימה. נסה שוב.",
            });
        } finally {
            setLoading(false);
        }
    };

    const goBackToManager = () => {
        navigate(AdminStackName + SigningManagerScreenName);
    };

    return (
        <SimpleScreen
            style={styles.screenStyle(isSmallScreen)}
            imageBackgroundSource={images.Backgrounds.AppBackground}
        >
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={AdminStackName}
                    GetNavBarData={getNavBarData}
                />
            )}

            <SimpleScrollView style={{ alignItems: "center", paddingTop: 24 }}>
                <SimpleContainer style={styles.headerRow}>
                    <TextBold24>שליחת מסמך לחתימה ✍️</TextBold24>
                </SimpleContainer>

                <SimpleContainer style={styles.formCard}>
                    {message && (
                        <div
                            style={
                                message.type === "error"
                                    ? styles.errorMsg
                                    : styles.successMsg
                            }
                        >
                            {message.text}
                        </div>
                    )}

                    <SimpleContainer style={styles.formGroup}>
                        <label style={styles.label}>מספר תיק (CaseId) *</label>
                        <input
                            style={styles.input}
                            type="number"
                            value={caseId}
                            onChange={(e) => setCaseId(e.target.value)}
                            placeholder="למשל: 123"
                        />
                        <p style={styles.infoText}>
                            בשלב ראשון נזין לפי מספר תיק. בהמשך אפשר לחבר לבחירת תיק
                            מתוך רשימת התיקים.
                        </p>
                    </SimpleContainer>

                    <SimpleContainer style={styles.formGroup}>
                        <label style={styles.label}>מספר לקוח (ClientId) *</label>
                        <input
                            style={styles.input}
                            type="number"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            placeholder="למשל: 45"
                        />
                    </SimpleContainer>

                    <SimpleContainer style={styles.formGroup}>
                        <label style={styles.label}>קובץ לחתימה (PDF מומלץ) *</label>

                        <div
                            style={styles.fileBox(isDragActive)}
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div>📄 גרור קובץ לכאן או לחץ לבחירה</div>
                            <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
                                (PDF, Word, תמונה – עדיף PDF לחתימות מרובות עמודים)
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                style={{ display: "none" }}
                                onChange={handleFileChange}
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                            />
                        </div>

                        {selectedFile && (
                            <div style={styles.fileName}>
                                ✓ {selectedFile.name} (
                                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                            </div>
                        )}
                    </SimpleContainer>

                    <SimpleContainer style={styles.formGroup}>
                        <label style={styles.label}>הערות ללקוח (לא חובה)</label>
                        <textarea
                            style={styles.textarea}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="למשל: נא לחתום בעמודים 2 ו-4 בצד שמאל למטה..."
                        />
                    </SimpleContainer>

                    <SimpleContainer style={styles.formGroup}>
                        <SimpleContainer style={styles.spotsHeaderRow}>
                            <TextBold24 style={{ fontSize: 18 }}>
                                מקומות חתימה במסמך
                            </TextBold24>
                            <SecondaryButton onPress={handleAddSpot} >+ הוסף מקום חתימה</SecondaryButton>
                        </SimpleContainer>

                        {signatureSpots.length === 0 ? (
                            <Text14 style={{ color: "#777" }}>
                                עדיין לא הוגדרו מקומות חתימה. לחץ על "הוסף מקום חתימה".
                            </Text14>
                        ) : (
                            <SimpleContainer style={styles.spotsContainer}>
                                {signatureSpots.map((spot, index) => (
                                    <SignatureSpotMarker
                                        key={index}
                                        spot={spot}
                                        index={index}
                                        onUpdate={handleUpdateSpot}
                                        onRemove={handleRemoveSpot}
                                    />
                                ))}
                            </SimpleContainer>
                        )}

                        <Text14 style={styles.infoText}>
                            הערכים X/Y הם באחוזים ממיקום העמוד (0–100), כך שתוכל למקם
                            את החתימה בערך במיקום הנכון גם בלי תצוגת PDF מלאה.
                        </Text14>
                    </SimpleContainer>

                    <SimpleContainer style={styles.actionsRow}>
                        <PrimaryButton
                            onPress={handleSubmit}
                            disabled={loading}
                        >{loading ? "שולח..." : "📤 שלח מסמך לחתימה"}</PrimaryButton>
                        <SecondaryButton onPress={goBackToManager}>⬅ חזרה לרשימת המסמכים</SecondaryButton>
                    </SimpleContainer>

                    {loading && (
                        <SimpleContainer style={{ marginTop: 12 }}>
                            <SimpleLoader />
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen >
    );
}
