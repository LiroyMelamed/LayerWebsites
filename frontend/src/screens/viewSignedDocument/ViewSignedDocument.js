import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import signingFilesApi from "../../api/signingFilesApi";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import "./ViewSignedDocument.scss";

export const ViewSignedDocumentName = "/ViewSignedDocument";

export default function ViewSignedDocument() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token") || "";

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [docInfo, setDocInfo] = useState(null);

    const loadDocument = useCallback(async () => {
        if (!token) {
            setError(t("viewSignedDoc.invalidLink", "קישור לא תקין"));
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            setError(null);
            const res = await signingFilesApi.getPublicSignedDocumentView(token);
            const data = res?.data || res;
            if (!data?.viewUrl) {
                throw new Error("missing viewUrl");
            }
            setDocInfo(data);
        } catch (err) {
            const code = err?.response?.data?.errorCode || err?.response?.data?.code;
            if (code === "TOKEN_EXPIRED") {
                setError(t("viewSignedDoc.expired", "תוקף הקישור פג"));
            } else if (code === "DOCUMENT_NOT_SIGNED") {
                setError(t("viewSignedDoc.notSigned", "המסמך טרם נחתם"));
            } else {
                setError(t("viewSignedDoc.loadError", "שגיאה בטעינת המסמך"));
            }
        } finally {
            setLoading(false);
        }
    }, [token, t]);

    useEffect(() => {
        loadDocument();
    }, [loadDocument]);

    // Allow pinch-to-zoom only on this page
    useEffect(() => {
        const meta = document.querySelector('meta[name="viewport"]');
        const original = meta?.getAttribute('content') || '';
        if (meta) {
            meta.setAttribute('content', 'width=device-width, initial-scale=1.0');
        }
        return () => {
            if (meta) meta.setAttribute('content', original);
        };
    }, []);

    const handleDownload = () => {
        if (docInfo?.downloadUrl) {
            window.open(docInfo.downloadUrl, "_blank");
        }
    };

    const formattedDate = docInfo?.signedAt
        ? new Date(docInfo.signedAt).toLocaleDateString("he-IL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        })
        : "";

    return (
        <SimpleScreen className="lw-viewSignedDoc">
            <SimpleContainer className="lw-viewSignedDoc__card">
                {loading && (
                    <SimpleContainer className="lw-viewSignedDoc__center">
                        <Text14>{t("viewSignedDoc.loading", "טוען מסמך...")}</Text14>
                    </SimpleContainer>
                )}

                {!loading && error && (
                    <SimpleContainer className="lw-viewSignedDoc__center">
                        <TextBold24 className="lw-viewSignedDoc__errorTitle">
                            {error}
                        </TextBold24>
                    </SimpleContainer>
                )}

                {!loading && !error && docInfo && (
                    <>
                        <SimpleContainer className="lw-viewSignedDoc__header">
                            <TextBold24>{docInfo.fileName}</TextBold24>
                            {formattedDate && (
                                <Text14 className="lw-viewSignedDoc__date">
                                    {t("viewSignedDoc.signedAt", "נחתם בתאריך")}: {formattedDate}
                                </Text14>
                            )}
                        </SimpleContainer>

                        <SimpleContainer className="lw-viewSignedDoc__pdfWrapper">
                            <iframe
                                src={docInfo.viewUrl}
                                title={docInfo.fileName}
                                className="lw-viewSignedDoc__iframe"
                            />
                        </SimpleContainer>

                        <SimpleContainer className="lw-viewSignedDoc__actions">
                            <PrimaryButton onPress={handleDownload}>
                                {t("viewSignedDoc.download", "הורד מסמך חתום")}
                            </PrimaryButton>
                        </SimpleContainer>
                    </>
                )}
            </SimpleContainer>
        </SimpleScreen>
    );
}
