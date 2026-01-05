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
import { customersApi } from "../../api/customersApi";
import { usePopup } from "../../providers/PopUpProvider";
import ClientPopup from "../mainScreen/components/ClientPopUp";

import "./UploadFileForSigningScreen.scss";
import { MainScreenName } from "../mainScreen/MainScreen";

export const uploadFileForSigningScreenName = "/upload-file-for-signing";

export default function UploadFileForSigningScreen() {
    const { isSmallScreen } = useScreenSize();
    const navigate = useNavigate();
    const { openPopup, closePopup } = usePopup();

    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName, null, () => { });
    const { result: customersByName, isPerforming: isPerformingCustomersByName, performRequest: SearchCustomersByName } = useHttpRequest(customersApi.getCustomersByName, null, () => { });

    const [caseId, setCaseId] = useState("");
    const [clientId, setClientId] = useState("");
    const [selectedSigners, setSelectedSigners] = useState([]);
    const [notes, setNotes] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);

    const [signatureSpots, setSignatureSpots] = useState([]);
    const [isDragActive, setIsDragActive] = useState(false);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    const [uploadedFileKey, setUploadedFileKey] = useState(null);
    const [detecting, setDetecting] = useState(false);

    const fileInputRef = useRef(null);

    const handleAddSpotForPage = (pageNumber, signerIdx = 0) => {
        const signer = selectedSigners?.[signerIdx] || null;
        const signerName = signer?.Name || `חותם ${Number(signerIdx) + 1}`;

        setSignatureSpots((prev) => [
            ...prev,
            {
                pageNum: pageNumber,
                x: 120,
                y: 160,
                width: 160,
                height: 60,
                signerIndex: signerIdx,
                signerUserId: signer?.UserId,
                signerName,
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
        if (!selectedFile) {
            setMessage({ type: "error", text: "יש לבחור קובץ." });
            return false;
        }
        if (!selectedSigners || selectedSigners.length === 0) {
            setMessage({ type: "error", text: "יש לבחור לפחות חותם אחד." });
            return false;
        }
        if (signatureSpots.length === 0) {
            setMessage({ type: "error", text: "חייב להיות לפחות מקום חתימה אחד." });
            return false;
        }
        return true;
    };

    const addSigner = (customer) => {
        if (!customer?.UserId) return;

        setSelectedSigners((prev) => {
            const exists = prev.some((s) => Number(s?.UserId) === Number(customer.UserId));
            if (exists) return prev;
            return [...prev, { UserId: customer.UserId, Name: customer.Name || `חותם ${prev.length + 1}` }];
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

            const signersPayload = (selectedSigners || []).map((s) => ({
                userId: Number(s.UserId),
                name: s.Name,
            }));

            const primaryClientId = signersPayload?.[0]?.userId || Number(clientId) || null;

            const normalizedCaseId = caseId ? Number(caseId) : null;

            await signingFilesApi.uploadFileForSigning({
                caseId: normalizedCaseId,
                clientId: primaryClientId,
                fileName: selectedFile.name,
                fileKey: key,
                signatureLocations: signatureSpots,
                notes: notes || null,
                signers: signersPayload,
            });

            setMessage({ type: "success", text: "הקובץ נשלח ללקוח לחתימה." });

            setCaseId("");
            setClientId("");
            setSelectedSigners([]);
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

        // If no signers selected yet, default to the case's client
        if (foundItem?.UserId) {
            setSelectedSigners((prev) => {
                if (prev && prev.length) return prev;
                return [{
                    UserId: foundItem.UserId,
                    Name: foundItem.CustomerName || "חותם 1",
                }];
            });
        }
    };

    const handleSearchSigner = (query) => {
        SearchCustomersByName(query);
    };

    const handleAddSignerFromSearch = (text, customer) => {
        addSigner(customer);
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
                        <TextBold24>שליחת מסמך לחתימה ✍️</TextBold24>
                    </SimpleContainer>

                    <SimpleContainer className="lw-uploadSigningScreen__formCard">
                        {message && (
                            <SimpleContainer
                                className={`lw-uploadSigningScreen__message ${message.type === "error" ? "is-error" : "is-success"}`}
                            >
                                {message.text}
                            </SimpleContainer>
                        )}

                        <SimpleContainer className="lw-uploadSigningScreen__searchRow">
                            <SearchInput
                                onSearch={handleSearch}
                                title={"חיפוש תיק"}
                                titleFontSize={20}
                                isPerforming={isPerformingCasesById}
                                queryResult={casesByName}
                                getButtonTextFunction={(item) => item.CaseName}
                                className="lw-uploadSigningScreen__search"
                                buttonPressFunction={handleButtonPress}
                            />

                            <SearchInput
                                onSearch={handleSearchSigner}
                                title={"חיפוש חותם (לקוח)"}
                                titleFontSize={20}
                                isPerforming={isPerformingCustomersByName}
                                queryResult={customersByName}
                                getButtonTextFunction={(item) => `${item.Name}`}
                                className="lw-uploadSigningScreen__search"
                                buttonPressFunction={handleAddSignerFromSearch}
                                emptyActionText={"הוסף לקוח"}
                                onEmptyAction={handleOpenAddCustomerPopup}
                            />
                        </SimpleContainer>

                        {selectedSigners?.length > 0 && (
                            <SimpleContainer className="lw-uploadSigningScreen__formGroup">
                                <label className="lw-uploadSigningScreen__label">חותמים שנבחרו *</label>
                                <SimpleContainer className="lw-uploadSigningScreen__selectedSignersRow">
                                    {selectedSigners.map((s) => (
                                        <SecondaryButton
                                            key={s.UserId}
                                            onPress={() => removeSigner(s.UserId)}
                                        >
                                            ✕ {s.Name} ({s.UserId})
                                        </SecondaryButton>
                                    ))}
                                </SimpleContainer>
                            </SimpleContainer>
                        )}

                        <SimpleContainer className="lw-uploadSigningScreen__formGroup lw-uploadSigningScreen__fileGroup">
                            <SimpleContainer
                                className={`lw-uploadSigningScreen__fileBox${isDragActive ? " is-dragActive" : ""}`}
                                onDragEnter={handleDragEnter}
                                onDragLeave={handleDragLeave}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onPress={() => fileInputRef.current?.click()}
                            >
                                <SimpleContainer className="lw-uploadSigningScreen__filePrompt">📄 גרור קובץ לכאן או לחץ לבחירה</SimpleContainer>
                                <SimpleContainer className="lw-uploadSigningScreen__fileHint">
                                    (PDF בלבד בשלב זה)
                                </SimpleContainer>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="lw-uploadSigningScreen__fileInput"
                                    onChange={handleFileChange}
                                    accept=".pdf"
                                />
                            </SimpleContainer>

                            {selectedFile && (
                                <SimpleContainer className="lw-uploadSigningScreen__fileName">
                                    ✓ {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                                </SimpleContainer>
                            )}
                        </SimpleContainer>

                        <SimpleContainer className="lw-uploadSigningScreen__formGroup lw-uploadSigningScreen__notesGroup">
                            <SimpleContainer className="lw-uploadSigningScreen__notesTitle">הערות ללקוח (לא חובה)</SimpleContainer>
                            <textarea
                                className="lw-uploadSigningScreen__textarea"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </SimpleContainer>

                        {selectedFile && (
                            <>
                                <SimpleContainer className="lw-uploadSigningScreen__viewerHeaderRow">
                                    <h3 className="lw-uploadSigningScreen__viewerTitle">
                                        תצוגת מסמך והגדרת חתימות
                                    </h3>

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
                                    signers={selectedSigners}
                                />

                                <SimpleContainer className="lw-uploadSigningScreen__infoText">
                                    <Text14>
                                        בכל עמוד יש כפתור "+ הוסף חתימה". גרור את הקוביות למיקום הרצוי או מחק בעזרת ✕
                                    </Text14>
                                </SimpleContainer>
                            </>
                        )}

                        <SimpleContainer className="lw-uploadSigningScreen__actionsRow">
                            <SecondaryButton
                                onPress={() => navigate(AdminStackName + SigningManagerScreenName)}
                            >
                                ⬅ חזרה
                            </SecondaryButton>
                            <PrimaryButton onPress={handleSubmit} disabled={loading}>
                                {loading ? "שולח..." : "📤 שלח ללקוח"}
                            </PrimaryButton>
                        </SimpleContainer>

                        {loading && (
                            <SimpleContainer className="lw-uploadSigningScreen__loading">
                                <SimpleLoader />
                            </SimpleContainer>
                        )}
                    </SimpleContainer>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
