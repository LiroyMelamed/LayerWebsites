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

import { Text14 } from "../../components/specializedComponents/text/AllTextKindFile";
import { images } from "../../assets/images/images";

import { AdminStackName } from "../../navigation/AdminStack";
import { uploadFileForSigningScreenName } from "./UploadFileForSigningScreen";
import "./SigningManagerScreen.scss";

export const SigningManagerScreenName = "/SigningManagerScreen";

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

    const getStatusChip = (status) => {
        const map = {
            pending: { text: "בהמתנה", className: "lw-signingManagerScreen__chip lw-signingManagerScreen__chip--pending" },
            signed: { text: "חתום", className: "lw-signingManagerScreen__chip lw-signingManagerScreen__chip--signed" },
            rejected: { text: "נדחה", className: "lw-signingManagerScreen__chip lw-signingManagerScreen__chip--rejected" },
        };
        return map[status] || map.pending;
    };

    const handleDownload = async (signingFileId, fileName) => {
        try {
            const response = await signingFilesApi.downloadSignedFile(signingFileId);
            const url = response?.data?.downloadUrl;
            if (!url) {
                alert("לא ניתן להוריד את הקובץ החתום");
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
            alert("שגיאה בהורדת הקובץ: " + (err?.message || ""));
        }
    };

    const handleSearch = (q) => setSearchQuery(q || "");
    const handleGoToUpload = () =>
        navigate(AdminStackName + uploadFileForSigningScreenName);

    if (isPerforming) return <SimpleLoader />;


    return (
        <SimpleScreen
            imageBackgroundSource={images.Backgrounds.AppBackground}
        >
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={AdminStackName}
                    GetNavBarData={getNavBarData}
                    chosenIndex={1}
                />
            )}

            <SimpleScrollView className="lw-signingManagerScreen__scroll">

                <SimpleContainer className="lw-signingManagerScreen__topRow">
                    <SimpleContainer className="lw-signingManagerScreen__searchContainer">
                        <SearchInput
                            onSearch={handleSearch}
                            title={"חיפוש מסמך / לקוח / תיק"}
                            titleFontSize={18}
                        />
                    </SimpleContainer>

                    <PrimaryButton onPress={handleGoToUpload}>
                        שליחת מסמך חדש לחתימה 📤
                    </PrimaryButton>
                </SimpleContainer>

                {/* טאבים */}
                <SimpleContainer className="lw-signingManagerScreen__tabsRow">
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
                    <SimpleContainer className="lw-signingManagerScreen__emptyState">
                        <Text14>
                            {activeTab === "pending"
                                ? "✨ אין מסמכים ממתינים או נדחים"
                                : "📭 אין מסמכים חתומים להצגה"}
                        </Text14>
                    </SimpleContainer>
                ) : (
                    filteredFiles.map((file) => {
                        const chip = getStatusChip(file.Status);
                        const isFullySigned = file.TotalSpots > 0 && file.SignedSpots === file.TotalSpots;
                        const totalSpots = Number(file.TotalSpots || 0);
                        const signedSpots = Number(file.SignedSpots || 0);
                        const progressMax = totalSpots > 0 ? totalSpots : 1;
                        const progressValue = totalSpots > 0 ? signedSpots : 0;
                        const cardClassName = `lw-signingManagerScreen__fileCard${isFullySigned ? " is-fullySigned" : ""}`;

                        return (
                            <SimpleContainer
                                key={file.SigningFileId}
                                className={cardClassName}
                            >
                                <SimpleContainer className="lw-signingManagerScreen__fileHeaderRow">
                                    <h3 className="lw-signingManagerScreen__fileName">
                                        {isFullySigned && "✅ "}{file.FileName}
                                    </h3>
                                    <SimpleContainer className={chip.className}>{chip.text}</SimpleContainer>
                                </SimpleContainer>

                                <SimpleContainer className="lw-signingManagerScreen__detailRow">
                                    <b>📁 תיק:</b> {file.CaseName}
                                </SimpleContainer>
                                <SimpleContainer className="lw-signingManagerScreen__detailRow">
                                    <b>👤 לקוח:</b> {file.ClientName}
                                </SimpleContainer>
                                <SimpleContainer className="lw-signingManagerScreen__detailRow">
                                    <b>📅 תאריך העלאה:</b>{" "}
                                    {file.CreatedAt
                                        ? new Date(file.CreatedAt).toLocaleDateString("he-IL")
                                        : "-"}
                                </SimpleContainer>

                                {(file.Status === "pending" ||
                                    file.Status === "rejected") && (
                                        <>
                                            <SimpleContainer className="lw-signingManagerScreen__detailRow">
                                                <b>✍️ חתימות:</b>{" "}
                                                {signedSpots}/{totalSpots}
                                            </SimpleContainer>

                                            <progress
                                                className="lw-signingManagerScreen__progress"
                                                max={progressMax}
                                                value={progressValue}
                                                aria-label={`חתימות: ${getProgress(file)}%`}
                                            />

                                            {file.Status === "rejected" &&
                                                file.RejectionReason && (
                                                    <SimpleContainer className="lw-signingManagerScreen__detailRow">
                                                        <b>❌ סיבת דחייה:</b>{" "}
                                                        {file.RejectionReason}
                                                    </SimpleContainer>
                                                )}
                                        </>
                                    )}

                                {file.Status === "signed" && (
                                    <SimpleContainer className="lw-signingManagerScreen__detailRow">
                                        <b>✓ חתום בתאריך:</b>{" "}
                                        {file.SignedAt
                                            ? new Date(file.SignedAt).toLocaleDateString("he-IL")
                                            : "-"}
                                    </SimpleContainer>
                                )}

                                <SimpleContainer className="lw-signingManagerScreen__actionsRow">
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
