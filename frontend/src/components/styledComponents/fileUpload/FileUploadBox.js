import React, { useRef, useCallback, useState } from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import SimpleLoader from "../../simpleComponents/SimpleLoader";
import { Text12, Text14 } from "../../specializedComponents/text/AllTextKindFile";
import { useTranslation } from "react-i18next";
import "./FileUploadBox.scss";

/**
 * Unified file-upload box used across the app.
 *
 * @param {string}   [accept]       – file type filter (e.g. ".pdf,.xlsx")
 * @param {boolean}  [disabled]     – disables click & drag
 * @param {boolean}  [uploading]    – shows loader instead of prompt
 * @param {string}   [fileName]     – currently-selected file name to display
 * @param {function} onFileSelected – called with the File object
 * @param {string}   [label]        – custom label text
 * @param {string}   [hint]         – hint text below the main label
 * @param {string}   [className]    – extra className
 */
export default function FileUploadBox({
    accept,
    disabled = false,
    uploading = false,
    fileName,
    onFileSelected,
    label,
    hint,
    className = "",
}) {
    const { t } = useTranslation();
    const fileInputRef = useRef(null);
    const [isDragActive, setIsDragActive] = useState(false);

    const handleClick = useCallback(() => {
        if (!disabled && !uploading) fileInputRef.current?.click();
    }, [disabled, uploading]);

    const handleChange = useCallback(
        (e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelected?.(file);
            if (fileInputRef.current) fileInputRef.current.value = "";
        },
        [onFileSelected],
    );

    const handleDragEnter = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(true); }, []);
    const handleDragLeave = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(false); }, []);
    const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
    const handleDrop = useCallback(
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragActive(false);
            if (disabled || uploading) return;
            const file = e.dataTransfer?.files?.[0];
            if (file) onFileSelected?.(file);
        },
        [disabled, uploading, onFileSelected],
    );

    const effectiveLabel = label || t("common.chooseFilePrompt");

    return (
        <SimpleContainer className={`lw-fileUploadBox ${isDragActive ? "is-dragActive" : ""} ${disabled || uploading ? "is-disabled" : ""} ${className}`}>
            <div
                className="lw-fileUploadBox__dropzone"
                onClick={handleClick}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={accept}
                    onChange={handleChange}
                    className="lw-fileUploadBox__input"
                    disabled={disabled || uploading}
                />

                {uploading ? (
                    <SimpleContainer className="lw-fileUploadBox__loader">
                        <SimpleLoader size="small" />
                        <Text12>{t("common.uploading")}</Text12>
                    </SimpleContainer>
                ) : (
                    <>
                        <Text14 className="lw-fileUploadBox__label">📎 {effectiveLabel}</Text14>
                        {hint && <Text12 className="lw-fileUploadBox__hint">{hint}</Text12>}
                    </>
                )}
            </div>

            {fileName && (
                <SimpleContainer className="lw-fileUploadBox__fileName">
                    <Text12>{fileName}</Text12>
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
}
