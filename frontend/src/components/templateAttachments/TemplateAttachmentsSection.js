import React, { useState, useEffect, useCallback, useRef } from "react";
import SimpleContainer from "../simpleComponents/SimpleContainer";
import { Text12, Text14 } from "../specializedComponents/text/AllTextKindFile";
import TertiaryButton from "../styledComponents/buttons/TertiaryButton";
import SimpleLoader from "../simpleComponents/SimpleLoader";
import templateAttachmentsApi from "../../api/templateAttachmentsApi";

import "./TemplateAttachmentsSection.scss";

function formatFileSize(bytes) {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TemplateAttachmentsSection({ templateType, templateKey }) {
    const [attachments, setAttachments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const fileInputRef = useRef(null);

    const loadAttachments = useCallback(async () => {
        if (!templateType || !templateKey) return;
        setLoading(true);
        try {
            const res = await templateAttachmentsApi.list(templateType, templateKey);
            setAttachments(res.data?.attachments || []);
        } catch {
            // ignore
        }
        setLoading(false);
    }, [templateType, templateKey]);

    useEffect(() => {
        loadAttachments();
    }, [loadAttachments]);

    const handleUpload = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setError("");
        try {
            await templateAttachmentsApi.upload(templateType, templateKey, file);
            await loadAttachments();
        } catch (err) {
            setError(err?.response?.data?.error || "שגיאה בהעלאת קובץ");
            setTimeout(() => setError(""), 4000);
        }
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [templateType, templateKey, loadAttachments]);

    const handleDelete = useCallback(async (id) => {
        try {
            await templateAttachmentsApi.delete(id);
            setAttachments(prev => prev.filter(a => a.id !== id));
        } catch {
            setError("שגיאה במחיקת קובץ");
            setTimeout(() => setError(""), 4000);
        }
    }, []);

    return (
        <SimpleContainer className="lw-templateAttachments">
            <Text12 className="lw-templateAttachments__label">קבצים מצורפים:</Text12>

            {loading ? (
                <SimpleLoader size="small" />
            ) : (
                <>
                    {attachments.length > 0 && (
                        <SimpleContainer className="lw-templateAttachments__list">
                            {attachments.map(att => (
                                <SimpleContainer key={att.id} className="lw-templateAttachments__item">
                                    <Text14 className="lw-templateAttachments__filename">
                                        📎 {att.filename}
                                    </Text14>
                                    <Text12 className="lw-templateAttachments__size">
                                        {formatFileSize(att.file_size)}
                                    </Text12>
                                    <TertiaryButton
                                        className="lw-templateAttachments__deleteBtn"
                                        onPress={() => handleDelete(att.id)}
                                    >
                                        ✕
                                    </TertiaryButton>
                                </SimpleContainer>
                            ))}
                        </SimpleContainer>
                    )}

                    <SimpleContainer className="lw-templateAttachments__uploadRow">
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleUpload}
                            className="lw-templateAttachments__fileInput"
                            disabled={uploading}
                        />
                        {uploading && <SimpleLoader size="small" />}
                    </SimpleContainer>

                    {error && <Text12 className="lw-templateAttachments__error">{error}</Text12>}
                </>
            )}
        </SimpleContainer>
    );
}
