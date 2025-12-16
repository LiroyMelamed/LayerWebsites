// src/screens/signingScreen/SigningManagerScreen.js
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import signingFilesApi from "../../api/signingFilesApi";

import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";

import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";

import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";

import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import { images } from "../../assets/images/images";

import { AdminStackName } from "../../navigation/AdminStack";
import { uploadFileForSigningScreenName } from "./UploadFileForSigningScreen";

export const SigningManagerScreenName = "/SigningManagerScreen";

const styles = {
    screenStyle: (isSmallScreen) => ({
        boxSizing: "border-box",
        flexDirection: "column",
        padding: isSmallScreen ? 0 : 16,
    }),
    headerRow: {
        alignItems: "center",
        marginBottom: 16,
    },
    tabsRow: {
        marginTop: "1.5rem",
        flexDirection: "row",
        justifyContent: "center",
        gap: "1rem",
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
    },
    fileHeaderRow: {
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    fileName: {
        fontSize: 16,
        fontWeight: 600,
        color: "#333",
        margin: 0,
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
        display: "flex",
        gap: 8,
        marginTop: 10,
        flexWrap: "wrap",
    },
    topRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        marginTop: 16,
        flexWrap: "wrap",
    },
    searchContainer: {
        flex: 1,
        minWidth: 260,
    },
    emptyState: {
        textAlign: "center",
        marginTop: 24,
    },
};

export default function SigningManagerScreen() {
    const { isSmallScreen } = useScreenSize();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState("pending");
    const [searchQuery, setSearchQuery] = useState("");

    const { result: lawyerFilesData, isPerforming } = useAutoHttpRequest(
        signingFilesApi.getLawyerSigningFiles
    );

    const files = lawyerFilesData?.files || [];

    const filteredFiles = useMemo(() => {
        const query = (searchQuery || "").toLowerCase();
        let list = files.filter((f) =>
            activeTab === "pending"
                ? f.Status === "pending" || f.Status === "rejected"
                : f.Status === "signed"
        );
        if (!query) return list;

        return list.filter((f) => {
            const text = [f.FileName, f.CaseName, f.ClientName, f.RejectionReason]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return text.includes(query);
        });
    }, [files, activeTab, searchQuery]);

    const pendingCount = files.filter(
        (f) => f.Status === "pending" || f.Status === "rejected"
    ).length;
    const signedCount = files.filter((f) => f.Status === "signed").length;

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

    const handleSearch = (q) => setSearchQuery(q || "");
    const handleGoToUpload = () =>
        navigate(AdminStackName + uploadFileForSigningScreenName);

    if (isPerforming) return <SimpleLoader />;


    return (
        <SimpleScreen
            style={styles.screenStyle(isSmallScreen)}
            imageBackgroundSource={images.Backgrounds.AppBackground}
        >
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={AdminStackName}
                    GetNavBarData={getNavBarData}
                />
            )}

            <SimpleScrollView>
                <SimpleContainer style={styles.headerRow}>
                    <TextBold24>מסמכים לחתימה 📄</TextBold24>
                </SimpleContainer>

                {/* חיפוש + העלאת קובץ */}
                <SimpleContainer style={styles.topRow}>
                    <SimpleContainer style={styles.searchContainer}>
                        <SearchInput
                            onSearch={handleSearch}
                            title={"חיפוש מסמך / לקוח / תיק"}
                            titleFontSize={18}
                            style={{ width: "100%" }}
                        />
                    </SimpleContainer>

                    <PrimaryButton onPress={handleGoToUpload}>
                        שליחת מסמך חדש לחתימה 📤
                    </PrimaryButton>
                </SimpleContainer>

                {/* טאבים */}
                <SimpleContainer style={styles.tabsRow}>
                    <TabButton
                        active={activeTab === "pending"}
                        label={`בהמתנה / נדחו (${pendingCount})`}
                        onPress={() => setActiveTab("pending")}
                    />
                    <TabButton
                        active={activeTab === "signed"}
                        label={`חתומים (${signedCount})`}
                        onPress={() => setActiveTab("signed")}
                    />
                </SimpleContainer>

                {/* רשימה */}
                {filteredFiles.length === 0 ? (
                    <Text14 style={styles.emptyState}>
                        {activeTab === "pending"
                            ? "אין מסמכים ממתינים או נדחים"
                            : "אין מסמכים חתומים להצגה"}
                    </Text14>
                ) : (
                    filteredFiles.map((file) => {
                        const chip = styles.chip(file.Status);

                        return (
                            <SimpleContainer
                                key={file.SigningFileId}
                                style={styles.fileCard}
                            >
                                <SimpleContainer style={styles.fileHeaderRow}>
                                    <h3 style={styles.fileName}>{file.FileName}</h3>
                                    <span style={chip.style}>{chip.text}</span>
                                </SimpleContainer>

                                <SimpleContainer style={styles.detailRow}>
                                    <b>תיק:</b> {file.CaseName}
                                </SimpleContainer>
                                <SimpleContainer style={styles.detailRow}>
                                    <b>לקוח:</b> {file.ClientName}
                                </SimpleContainer>
                                <SimpleContainer style={styles.detailRow}>
                                    <b>תאריך העלאה:</b>{" "}
                                    {file.CreatedAt
                                        ? new Date(file.CreatedAt).toLocaleDateString("he-IL")
                                        : "-"}
                                </SimpleContainer>

                                {(file.Status === "pending" ||
                                    file.Status === "rejected") && (
                                        <>
                                            <SimpleContainer style={styles.detailRow}>
                                                <b>חתימות:</b>{" "}
                                                {file.SignedSpots}/{file.TotalSpots}
                                            </SimpleContainer>
                                            <SimpleContainer style={styles.progressBarOuter}>
                                                <SimpleContainer
                                                    style={styles.progressBarInner(getProgress(file))}
                                                />
                                            </SimpleContainer>

                                            {file.Status === "rejected" &&
                                                file.RejectionReason && (
                                                    <SimpleContainer style={styles.detailRow}>
                                                        <b>סיבת דחייה:</b>{" "}
                                                        {file.RejectionReason}
                                                    </SimpleContainer>
                                                )}
                                        </>
                                    )}

                                <SimpleContainer style={styles.actionsRow}>
                                    {file.Status === "signed" && (
                                        <PrimaryButton
                                            onPress={() =>
                                                handleDownload(file.SigningFileId, file.FileName)
                                            }
                                        >
                                            ⬇️ הורד קובץ חתום
                                        </PrimaryButton>
                                    )}
                                    <SecondaryButton
                                        onPress={() =>
                                            console.log("פרטים על", file.SigningFileId)
                                        }
                                    >
                                        👁️ פרטי מסמך
                                    </SecondaryButton>
                                </SimpleContainer>
                            </SimpleContainer>
                        );
                    })
                )}
            </SimpleScrollView>
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
