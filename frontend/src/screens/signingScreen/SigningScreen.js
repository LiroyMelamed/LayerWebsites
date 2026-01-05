// src/screens/signingScreen/SigningScreen.js
import React, { useState, useCallback } from "react";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import signingFilesApi from "../../api/signingFilesApi";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import { Text14 } from "../../components/specializedComponents/text/AllTextKindFile";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import { images } from "../../assets/images/images";
import { ClientStackName } from "../../navigation/ClientStack";
import { ClientMainScreenName } from "../client/clientMainScreen/ClientMainScreen";
import { getClientNavBarData } from "../../components/navBars/data/ClientNavBarData";
import SignatureCanvas from "../../components/specializedComponents/signFiles/SignatureCanvas";
import "./SigningScreen.scss";

export const SigningScreenName = "/SigningScreen";

export default function SigningScreen() {
    const { isSmallScreen } = useScreenSize();
    const [activeTab, setActiveTab] = useState("pending");
    const [selectedFileId, setSelectedFileId] = useState(null);

    const { result: clientFilesData, isPerforming, performRequest } = useAutoHttpRequest(
        signingFilesApi.getClientSigningFiles
    );

    const handleSigningComplete = useCallback(() => {
        setSelectedFileId(null);
        // Re-fetch list so UI reflects updated signatures/status immediately.
        performRequest();
    }, [performRequest]);

    if (isPerforming) return <SimpleLoader />;

    const files = clientFilesData?.files || [];

    const pendingFiles = files.filter(
        (f) => f.Status === "pending" || f.Status === "rejected"
    );
    const signedFiles = files.filter((f) => f.Status === "signed");

    const currentList = activeTab === "pending" ? pendingFiles : signedFiles;

    const getProgress = (file) => {
        const total = file.TotalSpots || 0;
        const signed = file.SignedSpots || 0;
        if (!total) return 0;
        return Math.round((signed / total) * 100);
    };

    const getStatusChip = (status) => {
        const map = {
            pending: { text: "בהמתנה", className: "lw-signingScreen__chip lw-signingScreen__chip--pending" },
            signed: { text: "חתום", className: "lw-signingScreen__chip lw-signingScreen__chip--signed" },
            rejected: { text: "נדחה", className: "lw-signingScreen__chip lw-signingScreen__chip--rejected" },
        };
        return map[status] || map.pending;
    };

    const handleDownload = async (signingFileId, fileName) => {
        try {
            const response = await signingFilesApi.downloadSignedFile(signingFileId);
            const url = response?.data?.downloadUrl;
            if (!url) {
                alert("לא ניתן להוריד את הקובץ");
                return;
            }

            const a = document.createElement("a");
            a.href = url;
            a.download = fileName || "signed_file.pdf";
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            console.error("Download error:", err);
            alert("שגיאה בהורדת הקובץ");
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
                    chosenIndex={1}
                />
            )}

            <SimpleScrollView className="lw-signingScreen__scroll">
                <SimpleContainer className="lw-signingScreen">
                    <SimpleContainer className="lw-signingScreen__tabsRow">
                        <TabButton
                            active={activeTab === "pending"}
                            label={`בהמתנה לחתימה (${pendingFiles.length})`}
                            onPress={() => setActiveTab("pending")}
                        />
                        <TabButton
                            active={activeTab === "signed"}
                            label={`חתומים (${signedFiles.length})`}
                            onPress={() => setActiveTab("signed")}
                        />
                    </SimpleContainer>

                    {currentList.length === 0 ? (
                        <SimpleContainer className="lw-signingScreen__emptyState">
                            <Text14>
                                {activeTab === "pending"
                                    ? "✨ אין כרגע מסמכים בהמתנה לחתימתך"
                                    : "📭 אין מסמכים חתומים להצגה"}
                            </Text14>
                        </SimpleContainer>
                    ) : (
                        currentList.map((file) => {
                            const chip = getStatusChip(file.Status);
                            const totalSpots = Number(file.TotalSpots || 0);
                            const signedSpots = Number(file.SignedSpots || 0);
                            const progressMax = totalSpots > 0 ? totalSpots : 1;
                            const progressValue = totalSpots > 0 ? signedSpots : 0;

                            return (
                                <SimpleContainer key={file.SigningFileId} className="lw-signingScreen__fileCard">
                                    <SimpleContainer className="lw-signingScreen__fileHeaderRow">
                                        <h3 className="lw-signingScreen__fileName">{file.FileName}</h3>
                                        <SimpleContainer className={chip.className}>{chip.text}</SimpleContainer>
                                    </SimpleContainer>

                                    <SimpleContainer className="lw-signingScreen__detailRow">
                                        <b>תיק:</b> {file.CaseName}
                                    </SimpleContainer>

                                    <SimpleContainer className="lw-signingScreen__detailRow">
                                        <b>עורך דין:</b> {file.LawyerName}
                                    </SimpleContainer>

                                    <SimpleContainer className="lw-signingScreen__detailRow">
                                        <b>📅 תאריך העלאה:</b>{" "}
                                        {file.CreatedAt
                                            ? new Date(file.CreatedAt).toLocaleDateString("he-IL")
                                            : "-"}
                                    </SimpleContainer>

                                    {(file.Status === "pending" || file.Status === "rejected") && (
                                        <>
                                            <SimpleContainer className="lw-signingScreen__detailRow">
                                                <b>✍️ חתימות:</b> {signedSpots}/{totalSpots}
                                            </SimpleContainer>

                                            <progress
                                                className="lw-signingScreen__progress"
                                                max={progressMax}
                                                value={progressValue}
                                                aria-label={`חתימות: ${getProgress(file)}%`}
                                            />

                                            {file.Notes && (
                                                <SimpleContainer className="lw-signingScreen__detailRow">
                                                    <b>💬 הערות עו"ד:</b> {file.Notes}
                                                </SimpleContainer>
                                            )}
                                        </>
                                    )}

                                    <SimpleContainer className="lw-signingScreen__actionsRow">
                                        {activeTab === "pending" && (
                                            <PrimaryButton
                                                onPress={() => setSelectedFileId(file.SigningFileId)}
                                            >
                                                ✍️ חתום על המסמך
                                            </PrimaryButton>
                                        )}

                                        {activeTab === "signed" && (
                                            <PrimaryButton
                                                onPress={() =>
                                                    handleDownload(file.SigningFileId, file.FileName)
                                                }
                                            >
                                                ⬇️ הורד קובץ חתום
                                            </PrimaryButton>
                                        )}

                                        <SecondaryButton
                                            onPress={() => setSelectedFileId(file.SigningFileId)}
                                        >
                                            👁️ פרטים
                                        </SecondaryButton>
                                    </SimpleContainer>
                                </SimpleContainer>
                            );
                        })
                    )}
                </SimpleContainer>
            </SimpleScrollView>

            {selectedFileId && (
                <SignatureCanvas
                    signingFileId={selectedFileId}

                    onClose={() => {
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
