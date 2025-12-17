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

import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";
import { AdminStackName } from "../../navigation/AdminStack";
import { SigningManagerScreenName } from "./SigningManagerScreen";

import { uploadFileToR2 } from "../../utils/fileUploadUtils";
import PdfViewer from "../../components/specializedComponents/signFiles/pdfViewer/PdfViewer";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import casesApi from "../../api/casesApi";
import useHttpRequest from "../../hooks/useHttpRequest";

export const uploadFileForSigningScreenName = "/upload-file-for-signing";

const styles = {
    screenStyle: (isSmallScreen) => ({
        boxSizing: "border-box",
        flexDirection: "column",
        padding: isSmallScreen ? 0 : 16,
    }),
    searchInput: {
        marginTop: "12px",
        maxWidth: '500px',
    },
    headerRow: {
        alignItems: "center",
        marginBottom: 16,
    },
    formCard: {
        direction: "rtl",
        flexDirection: "column",
        borderRadius: 8,
        border: "1px solid #e0e0e0",
        padding: 16,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        width: "100%",
        maxWidth: 1000,
    },
    formGroup: {
        marginTop: 12,
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
    viewerHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 24,
        marginBottom: 12,
    },
    actionsRow: {
        flexDirection: "row",
        gap: 8,
        marginTop: 16,
        flexWrap: "wrap",
    },
    infoText: {
        fontSize: 13,
        color: "#777",
        marginTop: 8,
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

    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName, null, () => { });

    const [caseId, setCaseId] = useState("");
    const [clientId, setClientId] = useState("");
    const [notes, setNotes] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);

    const [signatureSpots, setSignatureSpots] = useState([]);
    const [isDragActive, setIsDragActive] = useState(false);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    const [uploadedFileKey, setUploadedFileKey] = useState(null);
    const [detecting, setDetecting] = useState(false);

    const fileInputRef = useRef(null);

    const handleAddSpotForPage = (pageNumber) => {
        setSignatureSpots((prev) => [
            ...prev,
            {
                pageNum: pageNumber,
                x: 120,
                y: 160,
                width: 140,
                height: 50,
                signerName: `חתימה ${prev.length + 1}`,
                isRequired: true,
            },
        ]);
    };

    const handleUpdateSpot = (index, updates) => {
        setSignatureSpots((prev) =>
            prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
        );
    };

    const handleRemoveSpot = (index) => {
        setSignatureSpots((prev) => prev.filter((_, i) => i !== index));
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
        if (!caseId || !clientId || !selectedFile) {
            setMessage({ type: "error", text: "יש למלא תיק, לקוח ולבחור קובץ." });
            return false;
        }
        if (signatureSpots.length === 0) {
            setMessage({ type: "error", text: "חייב להיות לפחות מקום חתימה אחד." });
            return false;
        }
        return true;
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

            const detectRes = await signingFilesApi.detectSignatureSpots(key);
            console.log('detectRes:', detectRes);

            const spots = detectRes?.data?.spots || detectRes?.spots || [];
            console.log('spots:', spots);


            setSignatureSpots(spots);

            if (!spots.length) {
                setMessage({
                    type: "error",
                    text: "לא נמצאו מקומות חתימה אוטומטית. אפשר להוסיף ידנית.",
                });
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: "error", text: "שגיאה בזיהוי חתימות אוטומטי." });
        } finally {
            setDetecting(false);
        }
    };

    const handleSubmit = async () => {
        setMessage(null);

        if (!validateForm()) return;

        try {
            setLoading(true);

            const key = await ensureUploadedKey();

            await signingFilesApi.uploadFileForSigning({
                caseId: Number(caseId),
                clientId: Number(clientId),
                fileName: selectedFile.name,
                fileKey: key,
                signatureLocations: signatureSpots,
                notes: notes || null,
            });

            setMessage({ type: "success", text: "הקובץ נשלח ללקוח לחתימה." });

            setCaseId("");
            setClientId("");
            setNotes("");
            setSelectedFile(null);
            setSignatureSpots([]);
            setUploadedFileKey(null);

            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (err) {
            console.error(err);
            setMessage({ type: "error", text: "שגיאה בשליחת הקובץ לחתימה." });
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (query) => {
        SearchCaseByName(query);
    };

    const handleButtonPress = (query) => {
        const foundItem = casesByName.find(caseItem => caseItem.CaseName === query);
        setCaseId(foundItem?.CaseId || "");
        setClientId(foundItem?.UserId || "");
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
                        <div style={message.type === "error" ? styles.errorMsg : styles.successMsg}>
                            {message.text}
                        </div>
                    )}

                    <SearchInput
                        onSearch={handleSearch}
                        title={"חיפוש תיק"}
                        titleFontSize={20}
                        isPerforming={isPerformingCasesById}
                        queryResult={casesByName}
                        getButtonTextFunction={(item) => item.CaseName}
                        style={styles.searchInput}
                        buttonPressFunction={handleButtonPress}
                    />

                    <SimpleContainer style={styles.formGroup}>
                        <label style={styles.label}>קובץ PDF *</label>

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
                                (PDF בלבד בשלב זה)
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                style={{ display: "none" }}
                                onChange={handleFileChange}
                                accept=".pdf"
                            />
                        </div>

                        {selectedFile && (
                            <div style={styles.fileName}>
                                ✓ {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                            </div>
                        )}
                    </SimpleContainer>

                    <SimpleContainer style={styles.formGroup}>
                        <label style={styles.label}>הערות ללקוח (לא חובה)</label>
                        <textarea
                            style={styles.textarea}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </SimpleContainer>

                    {selectedFile && (
                        <>
                            <SimpleContainer style={styles.viewerHeaderRow}>
                                <TextBold24 style={{ fontSize: 18 }}>
                                    תצוגת מסמך והגדרת חתימות
                                </TextBold24>

                                <SecondaryButton onPress={handleDetectSpots} disabled={detecting}>
                                    {detecting ? "מזהה..." : "🤖 מצא חתימות אוטומטית"}
                                </SecondaryButton>
                            </SimpleContainer>

                            <PdfViewer
                                pdfFile={selectedFile}
                                spots={signatureSpots}
                                onUpdateSpot={handleUpdateSpot}
                                onRemoveSpot={handleRemoveSpot}
                                onAddSpotForPage={handleAddSpotForPage}
                            />

                            <Text14 style={styles.infoText}>
                                בכל עמוד יש כפתור "+ הוסף חתימה". גרור את הקוביות למיקום הרצוי או מחק בעזרת ✕
                            </Text14>
                        </>
                    )}

                    <SimpleContainer style={styles.actionsRow}>
                        <PrimaryButton onPress={handleSubmit} disabled={loading}>
                            {loading ? "שולח..." : "📤 שלח ללקוח"}
                        </PrimaryButton>

                        <SecondaryButton
                            onPress={() => navigate(AdminStackName + SigningManagerScreenName)}
                        >
                            ⬅ חזרה
                        </SecondaryButton>
                    </SimpleContainer>

                    {loading && (
                        <SimpleContainer style={{ marginTop: 12 }}>
                            <SimpleLoader />
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
