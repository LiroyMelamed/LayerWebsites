import React, { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import evidenceDocumentsApi from "../../api/evidenceDocumentsApi";
import ApiUtils from "../../api/apiUtils";
import { isDemoModeEnabled } from "../../utils/demoMode";
import { demoGetEvidencePackage } from "../../demo/demoStore";
import { images } from "../../assets/images/images";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleInput from "../../components/simpleComponents/SimpleInput";

import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import { Text14, TextBold14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import ChooseButton from "../../components/styledComponents/buttons/ChooseButton";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import TertiaryButton from "../../components/styledComponents/buttons/TertiaryButton";
import ErrorPopup from "../../components/styledComponents/popups/ErrorPopup";
import { buttonSizes } from "../../styles/buttons/buttonSizes";
import { icons } from "../../assets/icons/icons";

import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";
import { usePopup } from "../../providers/PopUpProvider";
import { useScreenSize } from "../../providers/ScreenSizeProvider";

import { AdminStackName } from "../../navigation/AdminStack";
import { MainScreenName } from "../mainScreen/MainScreen";

import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";

import { SIGNING_OTP_ENABLED } from "../../featureFlags";

import "./EvidenceDocumentsScreen.scss";

export const EvidenceDocumentsScreenName = "/EvidenceDocumentsScreen";

function clientNameOnly(displayName) {
    const raw = String(displayName || "").trim();
    if (!raw) return null;
    // Backend formats as: "Name (XXX-XXX-1234)" when phone exists.
    const stripped = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
    return stripped || raw;
}

function formatDateDdMmYy(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
}

function otpLabel(item, t) {
    if (!SIGNING_OTP_ENABLED) return "-";
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

    const showOtpUi = SIGNING_OTP_ENABLED;

    const tableRowClassName = useMemo(() => {
        return [
            "lw-evidenceDocuments__tableRow",
            isSmallScreen ? "lw-evidenceDocuments__tableRow--noCase" : null,
            showOtpUi ? null : "lw-evidenceDocuments__tableRow--noOtp",
        ]
            .filter(Boolean)
            .join(" ");
    }, [isSmallScreen, showOtpUi]);

    const [inputQ, setInputQ] = useState("");
    const [inputCaseId, setInputCaseId] = useState("");
    const [inputFrom, setInputFrom] = useState("");
    const [inputTo, setInputTo] = useState("");
    const [otpFilter, setOtpFilter] = useState("");

    const [applied, setApplied] = useState({ q: "", caseId: "", from: "", to: "" });

    const [items, setItems] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [hasLoadError, setHasLoadError] = useState(false);

    const requestModeRef = useRef({ reset: true });

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

    const handleListSuccess = useCallback(
        (payload) => {
            // Backend response is: { items: [], nextCursor }
            // Tolerate a wrapped shape too (older callers): { success: true, data: { items, nextCursor } }
            const normalized = payload?.data && (payload?.success === true || payload?.success === false)
                ? payload.data
                : payload;

            const hasItemsField = normalized && Object.prototype.hasOwnProperty.call(normalized, 'items');
            const newItems = Array.isArray(normalized?.items) ? normalized.items : [];
            const newCursor = normalized?.nextCursor || null;

            if (!hasItemsField) {
                setHasLoadError(true);
                showError(payload, "evidenceDocuments.errors.load");
                return;
            }

            setItems((prev) => (requestModeRef.current.reset ? newItems : [...prev, ...newItems]));
            setNextCursor(newCursor);
            setHasLoadError(false);
        },
        [showError]
    );

    const handleListFailure = useCallback(
        (err) => {
            setHasLoadError(true);
            showError(err, "evidenceDocuments.errors.load");
        },
        [showError]
    );

    const requestEvidenceDocuments = useCallback(async (params) => {
        return await evidenceDocumentsApi.list(params);
    }, []);

    const { isPerforming: isLoading, performRequest: fetchPage } = useAutoHttpRequest(requestEvidenceDocuments, {
        body: {
            q: "",
            caseId: "",
            from: "",
            to: "",
            limit: 50,
            cursor: null,
        },
        onSuccess: handleListSuccess,
        onFailure: handleListFailure,
    });

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

        requestModeRef.current.reset = true;
        fetchPage({
            q: next.q,
            caseId: next.caseId,
            from: next.from,
            to: next.to,
            limit: 50,
            cursor: null,
        });
    };

    const onKeyDownSearch = (e) => {
        if (e?.key === "Enter") {
            e.preventDefault?.();
            onApplySearch();
        }
    };

    const filteredItems = useMemo(() => {
        if (!showOtpUi || !otpFilter) return items;
        return items.filter((it) => {
            const requireOtp = Boolean(it?.otpPolicy?.requireOtp);
            const waivedBy = String(it?.otpPolicy?.waivedBy || "").trim();
            if (otpFilter === "required") return requireOtp && !waivedBy;
            if (otpFilter === "waived") return requireOtp && Boolean(waivedBy);
            return true;
        });
    }, [items, otpFilter, showOtpUi]);

    const searchDropdownItems = useMemo(() => {
        const q = String(inputQ || "").trim().toLowerCase();
        const base = filteredItems || [];
        if (!q) return base;

        return base.filter((it) => {
            const text = [it.clientDisplayName, it.caseDisplayName, it.documentDisplayName, it.caseId]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return text.includes(q);
        });
    }, [filteredItems, inputQ]);

    const otpFilterItems = useMemo(
        () => [
            { value: "required", label: t("evidenceDocuments.otp.required") },
            { value: "waived", label: t("evidenceDocuments.otp.waived") },
        ],
        [t]
    );

    const handleLoadMore = () => {
        if (!nextCursor) return;
        requestModeRef.current.reset = false;
        fetchPage({
            q: applied.q,
            caseId: applied.caseId,
            from: applied.from,
            to: applied.to,
            limit: 50,
            cursor: nextCursor,
        });
    };

    const downloadEvidenceZip = async (signingFileId) => {
        try {
            if (isDemoModeEnabled()) {
                const pkg = demoGetEvidencePackage(signingFileId);
                const blob = pkg?.evidenceZipBlob;
                if (!blob) throw new Error("missing demo evidence zip");

                const objectUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = objectUrl;
                a.download = `evidence_${signingFileId}.zip`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
                return;
            }

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

                <SimpleContainer className="lw-evidenceDocuments__row">
                    <SearchInput
                        value={inputQ}
                        onSearch={setInputQ}
                        title={t("evidenceDocuments.searchTitle")}
                        titleFontSize={20}
                        onKeyDown={onKeyDownSearch}
                        className="lw-evidenceDocuments__search"
                        queryResult={searchDropdownItems}
                        isPerforming={isLoading && items.length === 0}
                        getButtonTextFunction={(it) => {
                            const client = clientNameOnly(it?.clientDisplayName) || "-";
                            const cs = it?.caseId ? String(it.caseId) : "-";
                            const doc = it?.documentDisplayName || "-";
                            return `${client} | ${cs} | ${doc}`;
                        }}
                        buttonPressFunction={(_, it) => {
                            const next = String(it?.documentDisplayName || it?.clientDisplayName || it?.caseDisplayName || "");
                            setInputQ(next);
                        }}
                    />
                    <PrimaryButton onPress={onApplySearch} isPerforming={isLoading}>
                        {t("common.search")}
                    </PrimaryButton>
                </SimpleContainer>

                <SimpleContainer className="lw-evidenceDocuments__row">
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

                    {showOtpUi && (
                        <SimpleContainer className="lw-evidenceDocuments__choose">
                            <ChooseButton
                                buttonText={t("evidenceDocuments.filters.otp")}
                                items={otpFilterItems}
                                OnPressChoiceFunction={(val) => setOtpFilter(val ?? "")}
                            />
                        </SimpleContainer>
                    )}
                </SimpleContainer>

                {isLoading && items.length === 0 ? (
                    <SimpleLoader />
                ) : hasLoadError && items.length === 0 ? (
                    <SimpleContainer className="lw-evidenceDocuments__state">
                        <Text14>{t("evidenceDocuments.errors.load")}</Text14>
                    </SimpleContainer>
                ) : filteredItems.length === 0 ? (
                    <SimpleContainer className="lw-evidenceDocuments__state">
                        <Text14>{t("evidenceDocuments.empty")}</Text14>
                    </SimpleContainer>
                ) : (
                    <SimpleContainer className="lw-evidenceDocuments__table">
                        <SimpleContainer className={`${tableRowClassName} lw-evidenceDocuments__tableRow--header`}>
                            <SimpleContainer className="lw-evidenceDocuments__cell">
                                <TextBold14>{t("evidenceDocuments.columns.client")}</TextBold14>
                            </SimpleContainer>
                            {!isSmallScreen && (
                                <SimpleContainer className="lw-evidenceDocuments__cell lw-evidenceDocuments__cell--case">
                                    <TextBold14>{t("evidenceDocuments.columns.case")}</TextBold14>
                                </SimpleContainer>
                            )}
                            <SimpleContainer className="lw-evidenceDocuments__cell">
                                <TextBold14>{t("evidenceDocuments.columns.document")}</TextBold14>
                            </SimpleContainer>
                            <SimpleContainer className="lw-evidenceDocuments__cell">
                                <TextBold14>{t("evidenceDocuments.columns.signedAt")}</TextBold14>
                            </SimpleContainer>
                            {showOtpUi && (
                                <SimpleContainer className="lw-evidenceDocuments__cell">
                                    <TextBold14>{t("evidenceDocuments.columns.otp")}</TextBold14>
                                </SimpleContainer>
                            )}
                            <SimpleContainer className="lw-evidenceDocuments__cell">
                                <TextBold14>{t("evidenceDocuments.columns.actions")}</TextBold14>
                            </SimpleContainer>
                        </SimpleContainer>

                        {filteredItems.map((it) => (
                            <SimpleContainer
                                key={`${it.signingFileId}_${it.signedAtUtc || ""}`}
                                className={tableRowClassName}
                            >
                                <SimpleContainer className="lw-evidenceDocuments__cell" title={it.clientDisplayName || ""}>
                                    <Text14>{clientNameOnly(it.clientDisplayName) || "-"}</Text14>
                                </SimpleContainer>
                                {!isSmallScreen && (
                                    <SimpleContainer className="lw-evidenceDocuments__cell lw-evidenceDocuments__cell--case" title={String(it.caseId || "")}>
                                        <Text14>{it.caseId ? String(it.caseId) : "-"}</Text14>
                                    </SimpleContainer>
                                )}
                                <SimpleContainer className="lw-evidenceDocuments__cell" title={it.documentDisplayName || ""}>
                                    <Text14>{it.documentDisplayName || "-"}</Text14>
                                </SimpleContainer>
                                <SimpleContainer className="lw-evidenceDocuments__cell">
                                    <Text14>{formatDateDdMmYy(it.signedAtUtc)}</Text14>
                                </SimpleContainer>
                                {showOtpUi && (
                                    <SimpleContainer className="lw-evidenceDocuments__cell">
                                        <Text14>{otpLabel(it, t)}</Text14>
                                    </SimpleContainer>
                                )}
                                <SimpleContainer className="lw-evidenceDocuments__cell lw-evidenceDocuments__cell--actions">
                                    <TertiaryButton
                                        onPress={() => downloadEvidenceZip(it.signingFileId)}
                                        disabled={!it.evidenceZipAvailable}
                                        title={t("evidenceDocuments.actions.downloadZip")}
                                        size={buttonSizes.SMALL}
                                        rightIcon={icons.Button.DownArrow}
                                        style={{ padding: '0.35rem 0.45rem', minWidth: 'unset' }}
                                    >
                                        {""}
                                    </TertiaryButton>
                                </SimpleContainer>
                            </SimpleContainer>
                        ))}
                    </SimpleContainer>
                )}

                <SimpleContainer className="lw-evidenceDocuments__footer">
                    {nextCursor ? (
                        <SecondaryButton onPress={handleLoadMore} disabled={isLoading}>
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
