// Signing spots preview — full-page PDF + signature overlays (opened in a new tab).
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import signingFilesApi from "../../api/signingFilesApi";
import ApiUtils from "../../api/apiUtils";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import { TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import PdfViewer from "../../components/specializedComponents/signFiles/pdfViewer/PdfViewer";
import { images } from "../../assets/images/images";
import { AdminStackName } from "../../navigation/AdminStack";
import { SigningManagerScreenName } from "../../navigation/screenPaths";
import "./SigningSpotsPreviewScreen.scss";

export { SigningSpotsPreviewScreenName } from "../../navigation/screenPaths";

export default function SigningSpotsPreviewScreen() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { signingFileId } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pdfFile, setPdfFile] = useState(null);
    const [spots, setSpots] = useState([]);
    const [fileName, setFileName] = useState("");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const id = Number(signingFileId);
                if (!Number.isFinite(id) || id <= 0) throw new Error("missing id");
                const baseUrl = ApiUtils?.defaults?.baseURL || "";
                const token = localStorage.getItem("token");
                const [pdfRes, detailsRes] = await Promise.all([
                    fetch(`${baseUrl}/SigningFiles/${encodeURIComponent(id)}/pdf`, {
                        method: "GET",
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                    }),
                    signingFilesApi.getSigningFileDetails(id),
                ]);
                if (!pdfRes.ok) throw new Error(`PDF fetch failed: ${pdfRes.status}`);
                const blob = await pdfRes.blob();
                const name = detailsRes?.data?.file?.FileName || detailsRes?.data?.FileName || "document.pdf";
                const nextSpots = detailsRes?.data?.signatureSpots || detailsRes?.data?.SignatureSpots || [];
                if (cancelled) return;
                setFileName(name);
                setSpots(nextSpots);
                setPdfFile(new File([blob], name, { type: blob.type || "application/pdf" }));
            } catch (err) {
                console.error("SigningSpotsPreview load failed", err);
                if (!cancelled) setError(t("signingManager.spotsPreview.error"));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [signingFileId, t]);

    const handleClose = () => {
        if (window.opener) {
            window.close();
            return;
        }
        navigate(AdminStackName + SigningManagerScreenName);
    };

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            <SimpleContainer className="lw-signingSpotsPreview">
                <SimpleContainer className="lw-signingSpotsPreview__header">
                    <TextBold24>{t("signingManager.spotsPreview.title")}</TextBold24>
                    {fileName ? <div className="lw-signingSpotsPreview__fileName">{fileName}</div> : null}
                    <SecondaryButton onPress={handleClose}>
                        {t("signingManager.spotsPreview.close")}
                    </SecondaryButton>
                </SimpleContainer>

                {loading && (
                    <SimpleContainer className="lw-signingSpotsPreview__loading">
                        <SimpleLoader />
                    </SimpleContainer>
                )}
                {error && <div className="lw-signingSpotsPreview__error">{error}</div>}
                {!loading && !error && pdfFile && (
                    <SimpleContainer className="lw-signingSpotsPreview__body">
                        <PdfViewer pdfFile={pdfFile} spots={spots} />
                    </SimpleContainer>
                )}
            </SimpleContainer>
        </SimpleScreen>
    );
}
