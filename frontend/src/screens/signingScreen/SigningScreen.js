// src/screens/signingScreen/SigningScreen.js
import React, { useState } from "react";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import signingFilesApi from "../../api/signingFilesApi";

import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getClientNavBarData } from "../../components/navBars/data/ClientNavBarData";
import { ClientStackName } from "../../navigation/ClientStack";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";

import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";

import SignatureCanvas from "../../components/specializedComponents/signFiles/SignatureCanvas";
import { images } from "../../assets/images/images";
import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import { ClientMainScreenName } from "../client/clientMainScreen/ClientMainScreen";

export const SigningScreenName = "/SigningScreen";

const styles = {
    screenStyle: () => ({
        boxSizing: "border-box",
        flexDirection: "column",
    }),
    headerRow: {
        alignItems: "center",
    },
    tabsRow: {
        marginTop: "1.5rem",
        flexDirection: "row",
        justifyContent: "center",
        gap: "2rem",
        marginBottom: 16,
        borderBottom: "2px solid #e0e0e0",
        paddingBottom: 8,
    },
    fileCard: {
        borderRadius: 8,
        border: "1px solid #e0e0e0",
        padding: 16,
        backgroundColor: "#fff",
        marginBottom: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        flexDirection: "column",
        width: "100%",
        maxWidth: 900,
    },
    fileHeaderRow: {
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
        width: "100%",
    },
    fileName: {
        fontSize: 16,
        fontWeight: 600,
        color: "#333",
        margin: 0,
    },
    detailRow: {
        fontSize: 13,
        color: "#555",
        marginBottom: 4,
    },
    progressBarOuter: {
        width: "100%",
        height: 6,
        backgroundColor: "#e0e0e0",
        borderRadius: 4,
        overflow: "hidden",
        marginTop: 6,
        marginBottom: 6,
    },
    progressBarInner: (percent) => ({
        width: `${percent}%`,
        height: "100%",
        backgroundColor: "#1976d2",
        transition: "width 0.3s ease",
    }),
    actionsRow: {
        gap: 8,
        marginTop: 10,
        flexWrap: "wrap",
    },
    emptyState: {
        textAlign: "center",
    },
    chip: (status) => {
        const map = {
            pending: { bg: "#fff3cd", color: "#856404", text: "בהמתנה" },
            signed: { bg: "#d4edda", color: "#155724", text: "חתום" },
            rejected: { bg: "#f8d7da", color: "#721c24", text: "נדחה" },
        };
        const s = map[status] || map.pending;

        return {
            style: {
                padding: "4px 10px",
                borderRadius: 16,
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: s.bg,
                color: s.color,
            },
            text: s.text,
        };
    },
};

export default function SigningScreen() {
    const { isSmallScreen } = useScreenSize();
    const [activeTab, setActiveTab] = useState("pending");
    const [selectedFileId, setSelectedFileId] = useState(null);

    const { result: clientFilesData, isPerforming } = useAutoHttpRequest(
        signingFilesApi.getClientSigningFiles
    );

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

    const handleDownload = async (signingFileId, fileName) => {
        const response = await signingFilesApi.downloadSignedFile(signingFileId);
        const url = response?.data?.downloadUrl;
        if (!url) return;

        const a = document.createElement("a");
        a.href = url;
        a.download = fileName || "signed_file.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    return (
        <SimpleScreen
            style={styles.screenStyle(isSmallScreen)}
            imageBackgroundSource={images.Backgrounds.AppBackground}
        >
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={ClientStackName + ClientMainScreenName}
                    GetNavBarData={getClientNavBarData}
                />
            )}

            <SimpleScrollView style={{ marginTop: 40, alignItems: "center" }}>
                <TextBold24 style={styles.headerRow}>מסמכים לחתימה 📄</TextBold24>

                <SimpleContainer style={styles.tabsRow}>
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
                    <Text14 style={styles.emptyState}>
                        {activeTab === "pending"
                            ? "אין כרגע מסמכים בהמתנה לחתימתך"
                            : "אין מסמכים חתומים להצגה"}
                    </Text14>
                ) : (
                    currentList.map((file) => {
                        const chip = styles.chip(file.Status);

                        return (
                            <SimpleContainer key={file.SigningFileId} style={styles.fileCard}>
                                <SimpleContainer style={styles.fileHeaderRow}>
                                    <h3 style={styles.fileName}>{file.FileName}</h3>
                                    <span style={chip.style}>{chip.text}</span>
                                </SimpleContainer>

                                <SimpleContainer style={styles.detailRow}>
                                    <b>תיק:</b> {file.CaseName}
                                </SimpleContainer>

                                <SimpleContainer style={styles.detailRow}>
                                    <b>עורך דין:</b> {file.LawyerName}
                                </SimpleContainer>

                                <SimpleContainer style={styles.detailRow}>
                                    <b>תאריך העלאה:</b>{" "}
                                    {file.CreatedAt
                                        ? new Date(file.CreatedAt).toLocaleDateString("he-IL")
                                        : "-"}
                                </SimpleContainer>

                                {(file.Status === "pending" || file.Status === "rejected") && (
                                    <>
                                        <SimpleContainer style={styles.detailRow}>
                                            <b>חתימות:</b> {file.SignedSpots}/{file.TotalSpots}
                                        </SimpleContainer>

                                        <SimpleContainer style={styles.progressBarOuter}>
                                            <SimpleContainer
                                                style={styles.progressBarInner(getProgress(file))}
                                            />
                                        </SimpleContainer>

                                        {file.Notes && (
                                            <SimpleContainer style={styles.detailRow}>
                                                <b>הערות עו"ד:</b> {file.Notes}
                                            </SimpleContainer>
                                        )}
                                    </>
                                )}

                                <SimpleContainer style={styles.actionsRow}>
                                    {activeTab === "pending" && (
                                        <PrimaryButton onPress={() => setSelectedFileId(file.SigningFileId)}>
                                            ✍️ חתום על המסמך
                                        </PrimaryButton>
                                    )}

                                    {activeTab === "signed" && (
                                        <PrimaryButton
                                            onPress={() => handleDownload(file.SigningFileId, file.FileName)}
                                        >
                                            ⬇️ הורד קובץ חתום
                                        </PrimaryButton>
                                    )}

                                    <SecondaryButton onPress={() => setSelectedFileId(file.SigningFileId)}>
                                        👁️ פרטים
                                    </SecondaryButton>
                                </SimpleContainer>
                            </SimpleContainer>
                        );
                    })
                )}
            </SimpleScrollView>

            {selectedFileId && (
                <SignatureCanvas
                    signingFileId={selectedFileId}
                    onClose={() => setSelectedFileId(null)}
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
