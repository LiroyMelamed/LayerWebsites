import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import SimpleInput from "../../components/simpleComponents/SimpleInput";

import { Text14, TextBold18, TextBold24, Text20 } from "../../components/specializedComponents/text/AllTextKindFile";
import { usePopup } from "../../providers/PopUpProvider";
import ErrorPopup from "../../components/styledComponents/popups/ErrorPopup";

import auditEventsApi from "../../api/auditEventsApi";

function safeToLocalDateTime(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
}

function shortUserAgent(ua) {
    const s = String(ua || "").trim();
    if (!s) return "-";
    if (s.length <= 42) return s;
    return `${s.slice(0, 40)}…`;
}

function prettyJson(value) {
    try {
        return JSON.stringify(value ?? {}, null, 2);
    } catch {
        return "{}";
    }
}

function EventDetailsPopup({ event, onClose }) {
    const { t } = useTranslation();

    return (
        <SimpleContainer className="lw-auditTrail__detailsPopup">
            <TextBold24>{t("audit.details.title")}</TextBold24>

            <SimpleContainer className="lw-auditTrail__kv">
                <div className="lw-auditTrail__k">id:</div>
                <div className="lw-auditTrail__v">{event?.id || "-"}</div>
            </SimpleContainer>
            <SimpleContainer className="lw-auditTrail__kv">
                <div className="lw-auditTrail__k">occurredAtUtc:</div>
                <div className="lw-auditTrail__v">{event?.occurredAtUtc || "-"}</div>
            </SimpleContainer>
            <SimpleContainer className="lw-auditTrail__kv">
                <div className="lw-auditTrail__k">eventType:</div>
                <div className="lw-auditTrail__v">{event?.eventType || "-"}</div>
            </SimpleContainer>
            <SimpleContainer className="lw-auditTrail__kv">
                <div className="lw-auditTrail__k">actor:</div>
                <div className="lw-auditTrail__v">{[event?.actorType, event?.actorLabel].filter(Boolean).join(" ") || "-"}</div>
            </SimpleContainer>
            <SimpleContainer className="lw-auditTrail__kv">
                <div className="lw-auditTrail__k">requestId:</div>
                <div className="lw-auditTrail__v">{event?.requestId || "-"}</div>
            </SimpleContainer>
            <SimpleContainer className="lw-auditTrail__kv">
                <div className="lw-auditTrail__k">ip:</div>
                <div className="lw-auditTrail__v">{event?.ip || "-"}</div>
            </SimpleContainer>

            <SimpleContainer className="lw-auditTrail__kv">
                <div className="lw-auditTrail__k">userAgent:</div>
                <div className="lw-auditTrail__v">{event?.userAgent || "-"}</div>
            </SimpleContainer>

            <SimpleContainer className="lw-auditTrail__detailsJson">
                <TextBold18>{t("audit.details.details")}</TextBold18>
                <pre className="lw-auditTrail__pre">{prettyJson(event?.details)}</pre>
            </SimpleContainer>

            <SimpleContainer className="lw-auditTrail__actions">
                <SecondaryButton onPress={onClose}>{t("common.close")}</SecondaryButton>
            </SimpleContainer>
        </SimpleContainer>
    );
}

export default function AuditTrailTab({ signingFileId }) {
    const { t } = useTranslation();
    const { openPopup, closePopup } = usePopup();

    const [items, setItems] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const [eventType, setEventType] = useState("");
    const [actorType, setActorType] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [search, setSearch] = useState("");

    const searchDebounceRef = useRef(null);

    const eventTypeOptions = useMemo(
        () => [
            { value: "", label: t("common.all") },
            { value: "PDF_VIEWED", label: t("audit.eventTypes.PDF_VIEWED") },
            { value: "OTP_SENT", label: t("audit.eventTypes.OTP_SENT") },
            { value: "OTP_VERIFIED", label: t("audit.eventTypes.OTP_VERIFIED") },
            { value: "CONSENT_ACCEPTED", label: t("audit.eventTypes.CONSENT_ACCEPTED") },
            { value: "SIGN_ATTEMPT", label: t("audit.eventTypes.SIGN_ATTEMPT") },
            { value: "SIGN_SUCCESS", label: t("audit.eventTypes.SIGN_SUCCESS") },
            { value: "SIGN_REJECTED", label: t("audit.eventTypes.SIGN_REJECTED") },
            { value: "SIGNED_PDF_GENERATED", label: t("audit.eventTypes.SIGNED_PDF_GENERATED") },
            { value: "SIGNED_PDF_DOWNLOADED", label: t("audit.eventTypes.SIGNED_PDF_DOWNLOADED") },
            { value: "EVIDENCE_ZIP_DOWNLOADED", label: t("audit.eventTypes.EVIDENCE_ZIP_DOWNLOADED") },
        ],
        [t]
    );

    const actorTypeOptions = useMemo(
        () => [
            { value: "", label: t("common.all") },
            { value: "LAWYER", label: t("audit.actorTypes.LAWYER") },
            { value: "CLIENT", label: t("audit.actorTypes.CLIENT") },
            { value: "SYSTEM", label: t("audit.actorTypes.SYSTEM") },
            { value: "PUBLIC", label: t("audit.actorTypes.PUBLIC") },
        ],
        [t]
    );

    const showError = (err) => {
        openPopup(
            <ErrorPopup
                closePopup={closePopup}
                errorText={err?.data?.message}
                messageKey={err?.data?.message ? undefined : "audit.errors.load"}
            />
        );
    };

    const fetchPage = async ({ cursor = null, append = false } = {}) => {
        if (!signingFileId) return;
        if (isLoading) return;
        setIsLoading(true);

        try {
            const res = await auditEventsApi.list({
                signingFileId,
                eventType: eventType || undefined,
                actorType: actorType || undefined,
                from: from || undefined,
                to: to || undefined,
                limit: 50,
                cursor: cursor || undefined,
                search: search || undefined,
            });

            const data = res?.data || {};
            const newItems = Array.isArray(data.items) ? data.items : [];

            setItems((prev) => (append ? [...prev, ...newItems] : newItems));
            setNextCursor(data.nextCursor || null);
        } catch (err) {
            console.error("Audit events load error:", err);
            showError(err);
        } finally {
            setIsLoading(false);
        }
    };

    // Initial load + reload on filters (debounced for search).
    useEffect(() => {
        if (!signingFileId) return;

        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }

        searchDebounceRef.current = setTimeout(() => {
            setNextCursor(null);
            fetchPage({ cursor: null, append: false });
        }, 400);

        return () => {
            if (searchDebounceRef.current) {
                clearTimeout(searchDebounceRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signingFileId, eventType, actorType, from, to, search]);

    const openDetails = (event) => {
        openPopup(<EventDetailsPopup event={event} onClose={closePopup} />);
    };

    const hasData = Array.isArray(items) && items.length > 0;

    return (
        <SimpleContainer className="lw-auditTrail">
            <SimpleContainer className="lw-auditTrail__filters">
                <SimpleContainer className="lw-auditTrail__filterGroup">
                    <label className="lw-auditTrail__label">{t("audit.filters.eventType")}</label>
                    <select
                        className="lw-auditTrail__select"
                        value={eventType}
                        onChange={(e) => setEventType(e.target.value)}
                    >
                        {eventTypeOptions.map((opt) => (
                            <option key={opt.value || "all"} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </SimpleContainer>

                <SimpleContainer className="lw-auditTrail__filterGroup">
                    <label className="lw-auditTrail__label">{t("audit.filters.actorType")}</label>
                    <select
                        className="lw-auditTrail__select"
                        value={actorType}
                        onChange={(e) => setActorType(e.target.value)}
                    >
                        {actorTypeOptions.map((opt) => (
                            <option key={opt.value || "all"} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </SimpleContainer>

                <SimpleContainer className="lw-auditTrail__filterGroup">
                    <SimpleInput
                        title={t("audit.filters.from")}
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        inputSize="Small"
                        timeToWaitInMilli={0}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-auditTrail__filterGroup">
                    <SimpleInput
                        title={t("audit.filters.to")}
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        inputSize="Small"
                        timeToWaitInMilli={0}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-auditTrail__filterGroup lw-auditTrail__filterGroup--wide">
                    <SimpleInput
                        title={t("audit.filters.search")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        inputSize="Small"
                        timeToWaitInMilli={0}
                    />
                </SimpleContainer>
            </SimpleContainer>

            {isLoading && items.length === 0 ? (
                <SimpleContainer className="lw-auditTrail__state">
                    <SimpleLoader />
                </SimpleContainer>
            ) : !hasData ? (
                <SimpleContainer className="lw-auditTrail__state">
                    <Text14>{t("audit.empty")}</Text14>
                </SimpleContainer>
            ) : (
                <>
                    <SimpleContainer className="lw-auditTrail__table">
                        <SimpleContainer className="lw-auditTrail__row lw-auditTrail__row--header">
                            <div className="lw-auditTrail__cell">{t("audit.columns.dateTime")}</div>
                            <div className="lw-auditTrail__cell">{t("audit.columns.action")}</div>
                            <div className="lw-auditTrail__cell">{t("audit.columns.actor")}</div>
                            <div className="lw-auditTrail__cell">{t("audit.columns.status")}</div>
                            <div className="lw-auditTrail__cell">{t("audit.columns.ip")}</div>
                            <div className="lw-auditTrail__cell">{t("audit.columns.device")}</div>
                            <div className="lw-auditTrail__cell">{t("audit.columns.details")}</div>
                        </SimpleContainer>

                        {items.map((ev) => {
                            const actionLabel = t(`audit.eventTypes.${ev?.eventType}`, { defaultValue: ev?.eventType || "" });
                            const actorLabel = [
                                t(`audit.actorTypes.${ev?.actorType}`, { defaultValue: ev?.actorType || "" }),
                                ev?.actorLabel,
                            ]
                                .filter(Boolean)
                                .join(" ");

                            const statusLabel = ev?.success ? t("audit.status.success") : t("audit.status.fail");

                            return (
                                <SimpleContainer key={ev.id} className="lw-auditTrail__row">
                                    <div className="lw-auditTrail__cell" title={ev?.occurredAtUtc}>{safeToLocalDateTime(ev?.occurredAtUtc)}</div>
                                    <div className="lw-auditTrail__cell" title={ev?.eventType}>{actionLabel}</div>
                                    <div className="lw-auditTrail__cell" title={actorLabel}>{actorLabel || "-"}</div>
                                    <div className="lw-auditTrail__cell">{statusLabel}</div>
                                    <div className="lw-auditTrail__cell" title={ev?.ip || ""}>{ev?.ip || "-"}</div>
                                    <div className="lw-auditTrail__cell" title={ev?.userAgent || ""}>{shortUserAgent(ev?.userAgent)}</div>
                                    <div className="lw-auditTrail__cell">
                                        <SecondaryButton onPress={() => openDetails(ev)}>
                                            {t("audit.actions.details")}
                                        </SecondaryButton>
                                    </div>
                                </SimpleContainer>
                            );
                        })}
                    </SimpleContainer>

                    <SimpleContainer className="lw-auditTrail__footer">
                        {nextCursor ? (
                            <PrimaryButton
                                onPress={() => fetchPage({ cursor: nextCursor, append: true })}
                                disabled={isLoading}
                            >
                                {t("audit.actions.loadMore")}
                            </PrimaryButton>
                        ) : (
                            <Text20 className="lw-auditTrail__end">{t("audit.end")}</Text20>
                        )}
                    </SimpleContainer>
                </>
            )}
        </SimpleContainer>
    );
}
