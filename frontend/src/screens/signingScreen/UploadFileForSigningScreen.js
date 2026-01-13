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
import FieldTypeNavbar from "../../components/specializedComponents/signFiles/fieldToolbar/FieldTypeNavbar";
import FloatingAddField from "../../components/specializedComponents/signFiles/fieldToolbar/FloatingAddField";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import casesApi from "../../api/casesApi";
import useHttpRequest from "../../hooks/useHttpRequest";
import { customersApi } from "../../api/customersApi";
import { usePopup } from "../../providers/PopUpProvider";
import ClientPopup from "../mainScreen/components/ClientPopUp";
import SignatureSpotMarker from "../../components/specializedComponents/signFiles/SignatureSpotMarker";

import "./UploadFileForSigningScreen.scss";
import { MainScreenName } from "../mainScreen/MainScreen";
import { useTranslation } from "react-i18next";

export const uploadFileForSigningScreenName = "/upload-file-for-signing";

export default function UploadFileForSigningScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();
    const navigate = useNavigate();
    const { openPopup, closePopup } = usePopup();

    const openFieldEditor = (index) => {
        const spot = signatureSpots[index];
        if (!spot) return;

        const onUpdate = (i, updates) => {
            handleUpdateSpot(i, updates);
        };

        const onRemove = (i) => {
            const ok = window.confirm(t('signing.spotMarker.confirmDelete') || 'Delete this field?');
            if (ok) {
                handleRemoveSpot(i);
                closePopup();
            }
        };

        openPopup(
            <SimpleContainer>
                <SignatureSpotMarker spot={spot} index={index} onUpdate={onUpdate} onRemove={onRemove} />
            </SimpleContainer>
        );
    };

    const { result: casesByName, isPerforming: isPerformingCasesById, performRequest: SearchCaseByName } = useHttpRequest(casesApi.getCaseByName, null, () => { });
    const { result: customersByName, isPerforming: isPerformingCustomersByName, performRequest: SearchCustomersByName } = useHttpRequest(customersApi.getCustomersByName, null, () => { });

    const [caseId, setCaseId] = useState("");
    const [clientId, setClientId] = useState("");
    const [selectedSigners, setSelectedSigners] = useState([]);
    const [notes, setNotes] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);

    const [signatureSpots, setSignatureSpots] = useState([]);
    const [selectedFieldType, setSelectedFieldType] = useState('signature');
    const [isDragActive, setIsDragActive] = useState(false);

    // Court-ready policy: OTP is required by default; waiver must be explicit + acknowledged.
    const [otpPolicy, setOtpPolicy] = useState("require"); // 'waive' | 'require'
    const [otpWaiverAck, setOtpWaiverAck] = useState(false);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    const [uploadedFileKey, setUploadedFileKey] = useState(null);
    const [detecting, setDetecting] = useState(false);

    const fileInputRef = useRef(null);

    const handleAddSpotForPage = (pageNumber, signerIdx = 0, fieldType = 'signature') => {
        const signer = selectedSigners?.[signerIdx] || null;
        const signerName = signer?.Name || t('signing.signerFallback', { index: Number(signerIdx) + 1 });

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
                type: fieldType,
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

        if (otpPolicy !== "waive" && otpPolicy !== "require") {
            setMessage({ type: "error", text: t('signing.upload.validation.selectOtpPolicy') });
            return false;
        }

        if (otpPolicy === "waive" && !otpWaiverAck) {
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
            console.log('detectRes:', detectRes);

            const spots = detectRes?.data?.spots || detectRes?.spots || [];
            console.log('spots:', spots);


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
                requireOtp: otpPolicy === "require",
                otpWaiverAcknowledged: otpPolicy === "waive" ? Boolean(otpWaiverAck) : false,
            });

            setMessage({ type: "success", text: t('signing.upload.successSent') });

            setCaseId("");
            setClientId("");
            setSelectedSigners([]);
            setNotes("");
            setSelectedFile(null);
            setSignatureSpots([]);
            setUploadedFileKey(null);
            setOtpPolicy("require");
            setOtpWaiverAck(false);

            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (err) {
            console.error(err);
            setMessage({ type: "error", text: t('signing.upload.errorSending') });
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
                    Name: foundItem.CustomerName || t('signing.signerFallback', { index: 1 }),
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
                        <TextBold24>{t('signing.upload.title')}</TextBold24>
                    </SimpleContainer>

                    <SimpleContainer className="lw-uploadSigningScreen__formCard">
                        {message && (
                            <div
                                className={`lw-uploadSigningScreen__message ${message.type === "error" ? "is-error" : "is-success"}`}
                            >
                                {message.text}
                            </div>
                        )}

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
                            />
                        </SimpleContainer>

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
                                            <span
                                                onClick={() => removeSigner(s.UserId)}
                                                className="lw-signing-spotRemove"
                                            >
                                                X
                                            </span>
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
                                    <FieldTypeNavbar selected={selectedFieldType} onSelect={setSelectedFieldType} />
                                    <PdfViewer
                                        pdfFile={selectedFile}
                                        spots={signatureSpots}
                                        onUpdateSpot={handleUpdateSpot}
                                        onRemoveSpot={handleRemoveSpot}
                                        onRequestRemove={(i) => {
                                            const ok = window.confirm(t('signing.spotMarker.confirmDelete') || 'Delete this field?');
                                            if (ok) handleRemoveSpot(i);
                                        }}
                                        onSelectSpot={openFieldEditor}
                                        onAddSpotForPage={handleAddSpotForPage}
                                        signers={selectedSigners}
                                    />
                                    <FloatingAddField
                                        onAdd={(page) => handleAddSpotForPage(page, 0, selectedFieldType)}
                                        containerSelector=".lw-signing-pdfViewer"
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
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
