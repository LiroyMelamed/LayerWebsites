// src/screens/signingScreen/SigningScreen.js
import React, { useState, useCallback, useEffect } from "react";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import Skeleton from "../../components/simpleComponents/Skeleton";
import signingFilesApi from "../../api/signingFilesApi";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import { images } from "../../assets/images/images";
import { ClientStackName } from "../../navigation/ClientStack";
import { ClientMainScreenName } from "../client/clientMainScreen/ClientMainScreen";
import { getClientNavBarData } from "../../components/navBars/data/ClientNavBarData";
import SignatureCanvas from "../../components/specializedComponents/signFiles/SignatureCanvas";
import { useLocation, useNavigate } from "react-router-dom";
import { LoginStackName } from "../../navigation/LoginStack";
import { LoginScreenName } from "../loginScreen/LoginScreen";
import { useTranslation } from "react-i18next";
import { useFromApp } from "../../providers/FromAppProvider";
import { usePopup } from "../../providers/PopUpProvider";
import { toastError } from "../../components/ui/toast";
import "./SigningScreen.scss";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import Separator from "../../components/styledComponents/separators/Separator";
import { PublicSignScreenName } from "../../navigation/screenPaths";

export const SigningScreenName = "/SigningScreen";

export default function SigningScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();
    const location = useLocation();
    const navigate = useNavigate();
    const { isFromApp } = useFromApp();
    const { openPopup, closePopup } = usePopup();
    const [activeTab, setActiveTab] = useState("pending");
    const [selectedFileId, setSelectedFileId] = useState(null);
    const [isPublicSigningSession, setIsPublicSigningSession] = useState(false);

    const { result: clientFilesData, isPerforming, performRequest } = useAutoHttpRequest(
        signingFilesApi.getClientSigningFiles
    );

    const handleSigningComplete = useCallback(() => {
        setSelectedFileId(null);
        // Re-fetch list so UI reflects updated signatures/status immediately.
        performRequest();
    }, [performRequest]);

    useEffect(() => {
        const stateOpen = location?.state?.openSigningFileId;
        const statePublic = Boolean(location?.state?.publicSigning);

        const storedFileId = sessionStorage.getItem("lw_signing_deeplink_fileId");
        const storedPublic = sessionStorage.getItem("lw_signing_deeplink_public") === "1";

        const openId = stateOpen || storedFileId;
        const isPublic = statePublic || storedPublic;

        if (openId) {
            setSelectedFileId(String(openId));
            setIsPublicSigningSession(isPublic);
            sessionStorage.removeItem("lw_signing_deeplink_fileId");
            sessionStorage.removeItem("lw_signing_deeplink_public");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const files = clientFilesData?.files || [];

    const pendingFiles = files.filter(
        (f) => f.Status === "pending" || f.Status === "rejected"
    );
    const signedFiles = files.filter((f) => f.Status === "signed");

    const currentList = activeTab === "pending" ? pendingFiles : signedFiles;

    const formatDotDate = (dateLike) => {
        if (!dateLike) return "-";
        const d = new Date(dateLike);
        if (Number.isNaN(d.getTime())) return "-";
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = String(d.getFullYear());
        return `${dd}.${mm}.${yyyy}`;
    };

    const getStatusChip = (status) => {
        const map = {
            pending: { text: t('signing.status.pending'), className: "lw-signingScreen__chip lw-signingScreen__chip--pending" },
            signed: { text: t('signing.status.signed'), className: "lw-signingScreen__chip lw-signingScreen__chip--signed" },
            rejected: { text: t('signing.status.rejected'), className: "lw-signingScreen__chip lw-signingScreen__chip--rejected" },
        };
        return map[status] || map.pending;
    };

    const openSigningPad = (file) => {
        closePopup();
        setSelectedFileId(file.SigningFileId);
        setIsPublicSigningSession(false);
    };

    const openSigning = async (file) => {
        if (!file?.SigningFileId) return;
        if (isFromApp && window.ReactNativeWebView) {
            try {
                const res = await signingFilesApi.createPublicSigningLink(file.SigningFileId);
                const token = res?.data?.token || res?.token;
                if (token) {
                    const nativeUrl = `${window.location.origin}${PublicSignScreenName}?token=${encodeURIComponent(token)}`;
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: "OPEN_URL",
                        payload: { url: nativeUrl },
                    }));
                    closePopup();
                    return;
                }
            } catch (err) {
                console.warn("Native public-sign open failed, falling back to in-app pad", err);
            }
        }
        openSigningPad(file);
    };

    const handleOpenDetails = (file) => {
        if (!file) return;
        openPopup(
            <ClientSigningFileDetails
                file={file}
                formatDotDate={formatDotDate}
                onClose={closePopup}
                onSign={() => openSigning(file)}
                onDownload={() => handleDownload(file.SigningFileId, file.FileName)}
            />
        );
    };

    const handleDownload = async (signingFileId, fileName) => {
        try {
            const response = await signingFilesApi.downloadSignedFile(signingFileId);
            const url = response?.data?.downloadUrl;
            if (!url) {
                toastError(t('signing.screen.downloadMissingUrl'));
                return;
            }

            const safeName = fileName || "signed_file.pdf";

            if (isFromApp && window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: "DOWNLOAD_FILE",
                    payload: { url, fileName: safeName }
                }));
            } else {
                const a = document.createElement("a");
                a.href = url;
                a.download = safeName;
                document.body.appendChild(a);
                try {
                    a.click();
                } finally {
                    a.remove();
                }
            }
        } catch (err) {
            console.error("Download error:", err);
            toastError(t('signing.screen.downloadError'));
        }
    };

    return (
        <SimpleScreen
            imageBackgroundSource={images.Backgrounds.AppBackground}
        >
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={ClientStackName + ClientMainScreenName}
                    GetNavBarData={getClientNavBarData}
                    chosenNavKey="signingFiles"
                />
            )}

            <SimpleScrollView className="lw-signingScreen__scroll">
                <SimpleContainer className="lw-signingScreen">
                    <SimpleContainer className="lw-signingScreen__tabsRow">
                        <TabButton
                            active={activeTab === "pending"}
                            label={t('signing.screen.tabPending', { count: pendingFiles.length })}
                            onPress={() => setActiveTab("pending")}
                        />
                        <TabButton
                            active={activeTab === "signed"}
                            label={t('signing.screen.tabSigned', { count: signedFiles.length })}
                            onPress={() => setActiveTab("signed")}
                        />
                    </SimpleContainer>

                    <Separator />

                    {isPerforming ? (
                        <SimpleCard>
                            {[1, 2, 3].map(i => (
                                <SimpleContainer key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0' }}>
                                    <Skeleton width="40%" height={14} />
                                    <Skeleton width="20%" height={14} />
                                </SimpleContainer>
                            ))}
                        </SimpleCard>
                    ) : currentList.length === 0 ? (
                        <SimpleContainer className="lw-signingScreen__emptyState">
                            <Text14>
                                {activeTab === "pending"
                                    ? t('signing.screen.emptyPending')
                                    : t('signing.screen.emptySigned')}
                            </Text14>
                        </SimpleContainer>
                    ) : (
                        currentList.map((file) => {
                            const chip = getStatusChip(file.Status);
                            return (
                                <button
                                    type="button"
                                    key={file.SigningFileId}
                                    className="lw-signingScreen__fileRow"
                                    onClick={() => handleOpenDetails(file)}
                                >
                                    <span className="lw-signingScreen__fileRowName">{file.FileName}</span>
                                    <span className={chip.className}>{chip.text}</span>
                                    <span className="lw-signingScreen__fileRowDate">
                                        {formatDotDate(file.Status === "signed" ? file.SignedAt : file.CreatedAt)}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </SimpleContainer>
            </SimpleScrollView>

            {selectedFileId && (
                <SignatureCanvas
                    signingFileId={selectedFileId}
                    onClose={() => {
                        if (isPublicSigningSession) {
                            localStorage.removeItem("token");
                            localStorage.removeItem("role");
                            setSelectedFileId(null);
                            navigate(LoginStackName + LoginScreenName, { replace: true });
                            return;
                        }

                        handleSigningComplete();
                    }}
                />
            )}
        </SimpleScreen>
    );
}

const TabButton = ({ active, label, onPress }) => {
    return active ? (
        <PrimaryButton onPress={onPress}>{label}</PrimaryButton>
    ) : (
        <SecondaryButton onPress={onPress}>{label}</SecondaryButton>
    );
};

function ClientSigningFileDetails({ file, formatDotDate, onClose, onSign, onDownload }) {
    const { t } = useTranslation();
    const status = String(file?.Status || "pending").toLowerCase();
    const isPending = status === "pending" || status === "rejected";
    const isSigned = status === "signed";
    const totalSpots = Number(file?.TotalSpots || 0);
    const signedSpots = Number(file?.SignedSpots || 0);
    const chipMap = {
        pending: { text: t("signing.status.pending"), className: "lw-signingScreen__chip lw-signingScreen__chip--pending" },
        signed: { text: t("signing.status.signed"), className: "lw-signingScreen__chip lw-signingScreen__chip--signed" },
        rejected: { text: t("signing.status.rejected"), className: "lw-signingScreen__chip lw-signingScreen__chip--rejected" },
    };
    const chip = chipMap[status] || chipMap.pending;

    return (
        <SimpleContainer className="lw-signingScreen__detailsPopup">
            <SimpleContainer className="lw-signingScreen__detailsHeader">
                <TextBold24>{t("signing.screen.details")}</TextBold24>
                <span className={chip.className}>{chip.text}</span>
            </SimpleContainer>
            <SimpleContainer className="lw-signingScreen__detailRow">
                <div className="lw-signingScreen__detailLabel">{t("signing.screen.documentLabel")}</div>
                <div className="lw-signingScreen__detailValue">{file?.FileName || "-"}</div>
            </SimpleContainer>
            <SimpleContainer className="lw-signingScreen__detailRow">
                <div className="lw-signingScreen__detailLabel">{t("signing.screen.caseLabel")}</div>
                <div className="lw-signingScreen__detailValue">{file?.CaseName || "-"}</div>
            </SimpleContainer>
            <SimpleContainer className="lw-signingScreen__detailRow">
                <div className="lw-signingScreen__detailLabel">{t("signing.screen.lawyerLabel")}</div>
                <div className="lw-signingScreen__detailValue">{file?.LawyerName || "-"}</div>
            </SimpleContainer>
            <SimpleContainer className="lw-signingScreen__detailRow">
                <div className="lw-signingScreen__detailLabel">{t("signing.screen.uploadedAtLabel")}</div>
                <div className="lw-signingScreen__detailValue">{formatDotDate?.(file?.CreatedAt)}</div>
            </SimpleContainer>
            {isPending && (
                <SimpleContainer className="lw-signingScreen__detailRow">
                    <div className="lw-signingScreen__detailLabel">{t("signing.screen.signaturesLabel")}</div>
                    <div className="lw-signingScreen__detailValue">{signedSpots}/{totalSpots}</div>
                </SimpleContainer>
            )}
            {file?.Notes && (
                <SimpleContainer className="lw-signingScreen__detailRow">
                    <div className="lw-signingScreen__detailLabel">{t("signing.screen.notesLabel")}</div>
                    <div className="lw-signingScreen__detailValue">{file.Notes}</div>
                </SimpleContainer>
            )}
            <SimpleContainer className="lw-signingScreen__actionsRow">
                {isPending && (
                    <PrimaryButton onPress={onSign}>{t("signing.screen.signDocument")}</PrimaryButton>
                )}
                {isSigned && (
                    <PrimaryButton onPress={onDownload}>{t("signing.screen.downloadSigned")}</PrimaryButton>
                )}
                <SecondaryButton onPress={onClose}>{t("common.close")}</SecondaryButton>
            </SimpleContainer>
        </SimpleContainer>
    );
}
