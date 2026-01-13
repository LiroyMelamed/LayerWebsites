import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import evidenceDocumentsApi from "../../api/evidenceDocumentsApi";
import ApiUtils from "../../api/apiUtils";
import { images } from "../../assets/images/images";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleInput from "../../components/simpleComponents/SimpleInput";

import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import ErrorPopup from "../../components/styledComponents/popups/ErrorPopup";

import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";
import { usePopup } from "../../providers/PopUpProvider";
import { useScreenSize } from "../../providers/ScreenSizeProvider";

import { AdminStackName } from "../../navigation/AdminStack";
import { MainScreenName } from "../mainScreen/MainScreen";

import "./EvidenceDocumentsScreen.scss";

export const EvidenceDocumentsScreenName = "/EvidenceDocumentsScreen";

function safeToLocalDateTime(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
}

function otpLabel(item, t) {
    const requireOtp = Boolean(item?.otpPolicy?.requireOtp);
    const waivedBy = String(item?.otpPolicy?.waivedBy || "").trim();

    if (!requireOtp) return "-";
    if (waivedBy) return t("evidenceDocuments.otp.waived");
    return t("evidenceDocuments.otp.required");
}

export default function EvidenceDocumentsScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();
    const { openPopup, closePopup } = usePopup();

    const [inputQ, setInputQ] = useState("");
    const [inputCaseId, setInputCaseId] = useState("");
    const [inputFrom, setInputFrom] = useState("");
    const [inputTo, setInputTo] = useState("");
    const [otpFilter, setOtpFilter] = useState("");

    const [applied, setApplied] = useState({ q: "", caseId: "", from: "", to: "" });

    const [items, setItems] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const showError = useCallback(
        (err, messageKey) => {
            openPopup(
                <ErrorPopup
                    closePopup={closePopup}
                    errorText={err?.data?.message}
                    messageKey={err?.data?.message ? undefined : messageKey}
                />
            );
        },
        [closePopup, openPopup]
    );

    const fetchPage = useCallback(
        async ({ reset, paramsOverride } = {}) => {
            if (isLoading) return;
            setIsLoading(true);
            try {
                const cursor = reset ? null : nextCursor;
                const params = paramsOverride || applied;
                const res = await evidenceDocumentsApi.list({
                    q: params.q,
                    caseId: params.caseId,
                    from: params.from,
                    to: params.to,
                    limit: 50,
                    cursor,
                });

                if (!res?.success) {
                    showError(res, "evidenceDocuments.errors.load");
                    return;
                }

                const newItems = Array.isArray(res?.data?.items) ? res.data.items : [];
                const newCursor = res?.data?.nextCursor || null;

                setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
                setNextCursor(newCursor);
            } finally {
                setIsLoading(false);
            }
        },
        [applied, isLoading, nextCursor, showError]
    );

    useEffect(() => {
        fetchPage({ reset: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onApplySearch = () => {
        const next = {
            q: String(inputQ || "").trim(),
            caseId: String(inputCaseId || "").trim(),
            from: String(inputFrom || "").trim(),
            to: String(inputTo || "").trim(),
        };
        setApplied(next);
        setItems([]);
        setNextCursor(null);
        fetchPage({ reset: true, paramsOverride: next });
    };

    const onKeyDownSearch = (e) => {
        if (e?.key === "Enter") {
            e.preventDefault?.();
            onApplySearch();
        }
    };

    const filteredItems = useMemo(() => {
        if (!otpFilter) return items;
        return items.filter((it) => {
            const requireOtp = Boolean(it?.otpPolicy?.requireOtp);
            const waivedBy = String(it?.otpPolicy?.waivedBy || "").trim();
            if (otpFilter === "required") return requireOtp && !waivedBy;
            if (otpFilter === "waived") return requireOtp && Boolean(waivedBy);
            return true;
        });
    }, [items, otpFilter]);

    const downloadEvidenceZip = async (signingFileId) => {
        try {
            const baseUrl = ApiUtils?.defaults?.baseURL || "";
            const token = localStorage.getItem("token");
            const url = `${baseUrl}/SigningFiles/${encodeURIComponent(signingFileId)}/evidence-package`;

            const res = await fetch(url, {
                method: "GET",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });

            if (!res.ok) throw new Error(`ZIP fetch failed: ${res.status}`);
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = objectUrl;
            a.download = `evidence_${signingFileId}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        } catch (err) {
            console.error("Evidence ZIP download error:", err);
            showError(null, "evidenceDocuments.errors.downloadZip");
        }
    };

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && (
                <TopToolBarSmallScreen
                    LogoNavigate={AdminStackName + MainScreenName}
                    GetNavBarData={getNavBarData}
                    chosenIndex={2}
                />
            )}

            <SimpleScrollView className="lw-evidenceDocuments__scroll">
                <SimpleContainer className="lw-evidenceDocuments__header">
                    <TextBold24>{t("evidenceDocuments.pageTitle")}</TextBold24>
                </SimpleContainer>

                <SimpleContainer className="lw-evidenceDocuments__searchRow">
                    <SimpleContainer className="lw-evidenceDocuments__searchInput">
                        <SearchInput
                            value={inputQ}
                            onSearch={setInputQ}
                            title={t("evidenceDocuments.searchTitle")}
                            titleFontSize={18}
                            onKeyDown={onKeyDownSearch}
                        />
                    </SimpleContainer>
                    <PrimaryButton onPress={onApplySearch}>{t("common.search")}</PrimaryButton>
                </SimpleContainer>

                <SimpleContainer className="lw-evidenceDocuments__filters">
                    <SimpleInput
                        title={t("evidenceDocuments.filters.caseId")}
                        value={inputCaseId}
                        onChange={(e) => setInputCaseId(e.target.value)}
                        onKeyDown={onKeyDownSearch}
                    />

                    <SimpleInput
                        title={t("evidenceDocuments.filters.from")}
                        type="date"
                        value={inputFrom}
                        onChange={(e) => setInputFrom(e.target.value)}
                        onKeyDown={onKeyDownSearch}
                    />

                    <SimpleInput
                        title={t("evidenceDocuments.filters.to")}
                        type="date"
                        value={inputTo}
                        onChange={(e) => setInputTo(e.target.value)}
                        onKeyDown={onKeyDownSearch}
                    />

                    <label className="lw-evidenceDocuments__label">
                        {t("evidenceDocuments.filters.otp")}
                        <select
                            className="lw-evidenceDocuments__select"
                            value={otpFilter}
                            onChange={(e) => setOtpFilter(e.target.value)}
                        >
                            <option value="">{t("common.all")}</option>
                            <option value="required">{t("evidenceDocuments.otp.required")}</option>
                            <option value="waived">{t("evidenceDocuments.otp.waived")}</option>
                        </select>
                    </label>
                </SimpleContainer>

                {isLoading && items.length === 0 ? (
                    <SimpleLoader />
                ) : filteredItems.length === 0 ? (
                    <SimpleContainer className="lw-evidenceDocuments__state">
                        <Text14>{t("evidenceDocuments.empty")}</Text14>
                    </SimpleContainer>
                ) : (
                    <SimpleContainer className="lw-evidenceDocuments__table">
                        <div className="lw-evidenceDocuments__row lw-evidenceDocuments__row--header">
                            <div className="lw-evidenceDocuments__cell">{t("evidenceDocuments.columns.client")}</div>
                            <div className="lw-evidenceDocuments__cell">{t("evidenceDocuments.columns.case")}</div>
                            <div className="lw-evidenceDocuments__cell">{t("evidenceDocuments.columns.document")}</div>
                            <div className="lw-evidenceDocuments__cell">{t("evidenceDocuments.columns.signedAt")}</div>
                            <div className="lw-evidenceDocuments__cell">{t("evidenceDocuments.columns.otp")}</div>
                            <div className="lw-evidenceDocuments__cell">{t("evidenceDocuments.columns.actions")}</div>
                        </div>

                        {filteredItems.map((it) => (
                            <div key={`${it.signingFileId}_${it.signedAtUtc || ""}`} className="lw-evidenceDocuments__row">
                                <div className="lw-evidenceDocuments__cell" title={it.clientDisplayName || ""}>
                                    {it.clientDisplayName || "-"}
                                </div>
                                <div className="lw-evidenceDocuments__cell" title={it.caseDisplayName || ""}>
                                    {it.caseDisplayName || (it.caseId ? `${t("evidenceDocuments.casePrefix")}${it.caseId}` : "-")}
                                </div>
                                <div className="lw-evidenceDocuments__cell" title={it.documentDisplayName || ""}>
                                    {it.documentDisplayName || "-"}
                                </div>
                                <div className="lw-evidenceDocuments__cell">{safeToLocalDateTime(it.signedAtUtc)}</div>
                                <div className="lw-evidenceDocuments__cell">{otpLabel(it, t)}</div>
                                <div className="lw-evidenceDocuments__cell">
                                    <SecondaryButton
                                        onPress={() => downloadEvidenceZip(it.signingFileId)}
                                        disabled={!it.evidenceZipAvailable}
                                    >
                                        {t("evidenceDocuments.actions.downloadZip")}
                                    </SecondaryButton>
                                </div>
                            </div>
                        ))}
                    </SimpleContainer>
                )}

                <SimpleContainer className="lw-evidenceDocuments__footer">
                    {nextCursor ? (
                        <SecondaryButton onPress={() => fetchPage({ reset: false })} disabled={isLoading}>
                            {t("evidenceDocuments.actions.loadMore")}
                        </SecondaryButton>
                    ) : (
                        items.length > 0 && <Text14>{t("evidenceDocuments.end")}</Text14>
                    )}
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
