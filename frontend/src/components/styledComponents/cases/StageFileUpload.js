import React, { useState, useRef, useCallback } from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import SimpleButton from "../../simpleComponents/SimpleButton";
import SimpleLoader from "../../simpleComponents/SimpleLoader";
import { Text12 } from "../../specializedComponents/text/AllTextKindFile";
import { useTranslation } from "react-i18next";
import { uploadFileToR2 } from "../../../utils/fileUploadUtils";
import filesApi from "../../../api/filesApi";
import { usePopup } from "../../../providers/PopUpProvider";
import ConfirmationDialog from "../popups/ConfirmationDialog";
import { useFromApp } from "../../../providers/FromAppProvider";

import "./StageFileUpload.scss";

export default function StageFileUpload({ caseId, stage, isClient, stageFiles = [], onFilesChanged }) {
    const { t } = useTranslation();
    const { openPopup, closePopup } = usePopup();
    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeletingId, setIsDeletingId] = useState(null);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = useCallback(async (event) => {
        const file = event?.target?.files?.[0];
        if (!file || !caseId || !stage) return;

        setIsUploading(true);
        try {
            // Step 1: Upload to R2
            const uploadResult = await uploadFileToR2(file);
            if (!uploadResult.success) {
                console.error("Upload failed:", uploadResult.message);
                setIsUploading(false);
                return;
            }

            // Step 2: Register with backend
            const registerResult = await filesApi.addStageFile(caseId, stage, {
                fileKey: uploadResult.data.key,
                fileName: uploadResult.data.fileName,
                fileExt: uploadResult.data.ext,
                fileMime: uploadResult.data.mime,
                fileSize: uploadResult.data.size,
            });

            if (registerResult?.success) {
                onFilesChanged?.();
            }
        } catch (err) {
            console.error("Stage file upload error:", err);
        } finally {
            setIsUploading(false);
            // Reset input so the same file can be re-selected
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }, [caseId, stage, onFilesChanged]);

    const performDelete = useCallback(async (fileId) => {
        setIsDeletingId(fileId);
        try {
            const result = await filesApi.deleteStageFile(fileId);
            if (result?.success) {
                onFilesChanged?.();
            }
        } catch (err) {
            console.error("Stage file delete error:", err);
        } finally {
            setIsDeletingId(null);
            closePopup();
        }
    }, [onFilesChanged, closePopup]);

    const handleDelete = useCallback((fileId) => {
        openPopup(
            <ConfirmationDialog
                title={t("cases.deleteStageFile")}
                message={t("cases.deleteStageFileConfirm")}
                confirmText={t("common.delete")}
                cancelText={t("common.cancel")}
                danger
                onConfirm={() => performDelete(fileId)}
                onCancel={closePopup}
            />
        );
    }, [t, openPopup, closePopup, performDelete]);

    const { isFromApp } = useFromApp();

    const handleDownload = useCallback(async (fileId, fileName) => {
        try {
            const result = await filesApi.readStageFile(fileId);
            if (result?.success && result?.data?.readUrl) {
                const url = result.data.readUrl;
                // Inside the mobile app WebView, send a native download message
                // so the app can use expo-file-system + expo-sharing to save/share
                // the file.  On the regular web we use an <a> tag.
                if (isFromApp && window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: "DOWNLOAD_FILE",
                        payload: { url, fileName: fileName || "file.pdf" }
                    }));
                } else if (isFromApp) {
                    window.open(url, "_blank");
                } else {
                    const link = document.createElement("a");
                    link.href = url;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.download = fileName || "file";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            }
        } catch (err) {
            console.error("Stage file download error:", err);
        }
    }, [isFromApp]);

    const files = stageFiles.filter(f => f.stage === stage);

    if (files.length === 0 && isClient) return null;

    return (
        <SimpleContainer className="lw-stageFileUpload">
            {files.length > 0 && (
                <SimpleContainer className="lw-stageFileUpload__list">
                    {files.map((f) => (
                        <SimpleContainer key={f.id} className="lw-stageFileUpload__file">
                            <SimpleButton
                                className="lw-stageFileUpload__fileName"
                                onPress={() => handleDownload(f.id, f.file_name)}
                            >
                                <Text12 className="lw-stageFileUpload__fileLink">
                                    📎 {f.file_name}
                                </Text12>
                            </SimpleButton>
                            {!isClient && (
                                <SimpleButton
                                    className="lw-stageFileUpload__deleteBtn"
                                    onPress={() => handleDelete(f.id)}
                                >
                                    {isDeletingId === f.id ? (
                                        <SimpleLoader />
                                    ) : (
                                        <Text12 className="lw-stageFileUpload__deleteText">✕</Text12>
                                    )}
                                </SimpleButton>
                            )}
                        </SimpleContainer>
                    ))}
                </SimpleContainer>
            )}

            {!isClient && (
                <SimpleContainer className="lw-stageFileUpload__uploadRow">
                    <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: "none" }}
                        onChange={handleFileSelected}
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.xlsx,.xls,.txt"
                    />
                    <SimpleButton
                        className="lw-stageFileUpload__uploadBtn"
                        onPress={handleUploadClick}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <Text12>{t("cases.uploadingFile")}</Text12>
                        ) : (
                            <Text12 className="lw-stageFileUpload__uploadText">
                                + {t("cases.addStageFile")}
                            </Text12>
                        )}
                    </SimpleButton>
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
}
