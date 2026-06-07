import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import heLocale from "@fullcalendar/core/locales/he";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleButton from "../../components/simpleComponents/SimpleButton";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import { Text24, Text14, Text12, TextBold14 } from "../../components/specializedComponents/text/AllTextKindFile";
import { usePopup } from "../../providers/PopUpProvider";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { images } from "../../assets/images/images";
import { AdminStackName } from "../../navigation/AdminStack";
import { MainScreenName } from "../mainScreen/MainScreen";
import { ENABLE_CALENDAR_MODULE } from "../../featureFlags";

import calendarApi from "../../api/calendarApi";
import platformSettingsApi from "../../api/platformSettingsApi";
import { adminApi } from "../../api/adminApi";
import { customersApi } from "../../api/customersApi";
import casesApi from "../../api/casesApi";

import EventFormModal from "./components/EventFormModal";
import { colorForKey, leaveColor, buildLawyerLegend } from "./utils/lawyerColors";

import "./CalendarScreen.scss";

export const CalendarScreenName = "/CalendarScreen";

// ─── Constants ────────────────────────────────────────────────────────────────
const SCOPE_MINE = "mine";
const SCOPE_FIRM = "firm";

const EVENT_TYPE_ALL = "all";
const EVENT_TYPE_APPT = "appointment";
const EVENT_TYPE_LEAVE = "leave";

// Map a raw calendar_events row → FullCalendar EventInput. The scope drives
// whether we color by lawyer (firm view) or by event.color (personal view).
function buildFullCalendarEvent(ev, { scope }) {
    const isLeave = ev?.eventType === "leave";

    // Leave events render as muted background blocks across the day(s).
    if (isLeave) {
        const lawyerName = ev?.ownerName || "";
        const labelPrefix = "[חופשה]";
        return {
            id: String(ev.id),
            title: lawyerName ? `${labelPrefix} ${lawyerName}` : `${labelPrefix} ${ev.title || ""}`.trim(),
            start: ev.startTime,
            end: ev.endTime,
            allDay: ev.allDay,
            display: "background",
            backgroundColor: leaveColor(),
            borderColor: leaveColor(),
            textColor: "#FFFFFF",
            classNames: ["lw-fcEvent--leave"],
            extendedProps: ev,
        };
    }

    // Appointments: color by owner in firm view, otherwise honor stored color
    // (or infer from title heuristics for backwards compatibility).
    const text = `${String(ev?.title || "")} ${String(ev?.description || "")}`;
    const personalInferred =
        ev?.color ||
        (/(חופשה|vacation|pto|holiday)/i.test(text) ? "#2F855A"
            : /(דיון|court|hearing)/i.test(text) ? "#B83280"
                : "#2A4365");

    const color = scope === SCOPE_FIRM
        ? colorForKey(ev?.ownerId ?? ev?.ownerName ?? ev?.id)
        : personalInferred;

    return {
        id: String(ev.id),
        title: ev.title,
        start: ev.startTime,
        end: ev.endTime,
        allDay: ev.allDay,
        backgroundColor: color,
        borderColor: color,
        textColor: "#FFFFFF",
        extendedProps: ev,
    };
}

// Read-only role probe (Lawyer/Admin → can use firm view + lawyer filter)
function _currentRole() {
    try { return (typeof window !== "undefined" && localStorage.getItem("role")) || ""; }
    catch { return ""; }
}
function _isFirmManager(role) { return role && role !== "User"; }

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function CalendarScreen() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { isSmallScreen } = useScreenSize();
    const { openPopup, closePopup } = usePopup();
    const [searchParams] = useSearchParams();

    // Feature-flag guard: bounce to main screen if the module is disabled.
    useEffect(() => {
        if (!ENABLE_CALENDAR_MODULE) {
            navigate(AdminStackName + MainScreenName, { replace: true });
        }
    }, [navigate]);

    const role = _currentRole();
    const canUseFirmView = _isFirmManager(role);

    const calendarRef = useRef(null);
    const fetchRangeRef = useRef({ from: null, to: null });
    const hasAutoOpenedEventRef = useRef(false);

    // ── View / scope / filters ─────────────────────────────────────────────
    const [events, setEvents] = useState([]);
    const [view, setView] = useState("dayGridMonth");
    const [scope, setScope] = useState(SCOPE_MINE);
    const [filters, setFilters] = useState({
        lawyer_id: null,
        client_id: null,
        case_id: null,
        event_type: EVENT_TYPE_ALL, // 'all' is UI-only; we don't send it to the API
    });
    const [filtersPanelOpen, setFiltersPanelOpen] = useState(!isSmallScreen);

    // ── Working-hours config ───────────────────────────────────────────────
    const [workingDays, setWorkingDays] = useState([0, 1, 2, 3, 4]);
    const [workingHoursStart, setWorkingHoursStart] = useState("08:00");
    const [workingHoursEnd, setWorkingHoursEnd] = useState("18:00");

    // ── Reference data for filter panel ────────────────────────────────────
    const [lawyers, setLawyers] = useState([]);
    const [clientQuery, setClientQuery] = useState("");
    const [clientResults, setClientResults] = useState([]);
    const [allCases, setAllCases] = useState([]);
    const [caseQuery, setCaseQuery] = useState("");

    // ── Google callback toast ──────────────────────────────────────────────
    const [googleMsg, setGoogleMsg] = useState("");
    useEffect(() => {
        if (searchParams.get("google_connected") === "1") {
            setGoogleMsg("Google Calendar חובר בהצלחה ✓");
            setTimeout(() => setGoogleMsg(""), 4000);
        }
        if (searchParams.get("google_error") === "1") {
            setGoogleMsg("חיבור Google Calendar נכשל. נסה שוב.");
            setTimeout(() => setGoogleMsg(""), 4000);
        }
    }, [searchParams]);

    // ── Load lawyer list (for filter + legend) ─────────────────────────────
    useEffect(() => {
        if (!canUseFirmView) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await adminApi.getAllAdmins();
                const list = res?.data?.admins || res?.data || [];
                if (!cancelled && Array.isArray(list)) setLawyers(list);
            } catch { /* swallow — filter just stays empty */ }
        })();
        return () => { cancelled = true; };
    }, [canUseFirmView]);

    // ── Load case list once (filter dropdown) ──────────────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await casesApi.getAllCases();
                const list = res?.data?.cases || res?.data || [];
                if (!cancelled && Array.isArray(list)) setAllCases(list);
            } catch { /* swallow */ }
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Debounced client search ─────────────────────────────────────────────
    useEffect(() => {
        if (!clientQuery || clientQuery.trim().length < 2) {
            setClientResults([]);
            return undefined;
        }
        const handle = setTimeout(async () => {
            try {
                const res = await customersApi.getCustomersByName(clientQuery.trim());
                const list = res?.data?.customers || res?.data || [];
                setClientResults(Array.isArray(list) ? list.slice(0, 20) : []);
            } catch { setClientResults([]); }
        }, 250);
        return () => clearTimeout(handle);
    }, [clientQuery]);

    // ── Load firm working days/hours from platform settings ────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await platformSettingsApi.getAll();
                const cal = res?.data?.settings?.calendar || res?.settings?.calendar || {};
                if (cancelled) return;
                const daysRaw = cal?.WORKING_DAYS?.effectiveValue;
                if (typeof daysRaw === "string" && daysRaw.length) {
                    const parsed = daysRaw
                        .split(",")
                        .map((s) => parseInt(s.trim(), 10))
                        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
                    if (parsed.length) setWorkingDays(parsed);
                }
                const startRaw = cal?.WORKING_HOURS_START?.effectiveValue;
                if (typeof startRaw === "string" && /^\d{2}:\d{2}/.test(startRaw)) {
                    setWorkingHoursStart(startRaw.slice(0, 5));
                }
                const endRaw = cal?.WORKING_HOURS_END?.effectiveValue;
                if (typeof endRaw === "string" && /^\d{2}:\d{2}/.test(endRaw)) {
                    setWorkingHoursEnd(endRaw.slice(0, 5));
                }
            } catch { /* keep defaults */ }
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Filter assembly ─────────────────────────────────────────────────────
    const apiFilters = useMemo(() => {
        const f = {};
        // scope=firm is only meaningful for lawyers/admins; non-managers always get scope=mine.
        if (canUseFirmView && scope === SCOPE_FIRM) f.scope = SCOPE_FIRM;
        if (filters.lawyer_id) f.lawyer_id = filters.lawyer_id;
        if (filters.client_id) f.client_id = filters.client_id;
        if (filters.case_id) f.case_id = filters.case_id;
        if (filters.event_type && filters.event_type !== EVENT_TYPE_ALL) {
            f.event_type = filters.event_type;
        }
        return f;
    }, [scope, filters, canUseFirmView]);

    // ── Fetch events for the visible date range ────────────────────────────
    const fetchEvents = useCallback(async (range) => {
        // FullCalendar passes the full range via datesSet; we cache so filter
        // changes can re-fetch without needing FullCalendar to fire again.
        const from = range?.startStr || fetchRangeRef.current.from
            || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const to = range?.endStr || fetchRangeRef.current.to
            || new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString();
        fetchRangeRef.current = { from, to };

        try {
            const res = await calendarApi.listEvents({ from, to, limit: 500, ...apiFilters });
            const list = res?.data?.events || [];
            setEvents(list.map((ev) => buildFullCalendarEvent(ev, { scope: apiFilters.scope || SCOPE_MINE })));
        } catch {
            // leave the last successful calendar state visible
        }
    }, [apiFilters]);

    // Re-fetch whenever filters/scope change (range is reused from the last datesSet).
    useEffect(() => { fetchEvents(null); }, [fetchEvents]);

    // ── FullCalendar config ────────────────────────────────────────────────
    const hiddenDays = useMemo(() => {
        const set = new Set(workingDays);
        return [0, 1, 2, 3, 4, 5, 6].filter((d) => !set.has(d));
    }, [workingDays]);

    const businessHours = useMemo(() => ({
        daysOfWeek: workingDays,
        startTime: workingHoursStart,
        endTime: workingHoursEnd,
    }), [workingDays, workingHoursStart, workingHoursEnd]);

    // ── Modal helpers ──────────────────────────────────────────────────────
    const upsertLocally = useCallback((saved) => {
        setEvents((prev) => {
            const built = buildFullCalendarEvent(saved, { scope: apiFilters.scope || SCOPE_MINE });
            const idx = prev.findIndex((e) => e.id === built.id);
            if (idx === -1) return [...prev, built];
            const next = prev.slice();
            next[idx] = built;
            return next;
        });
    }, [apiFilters.scope]);

    const openCreateModal = useCallback((selectInfo) => {
        const prefill = selectInfo
            ? { startTime: selectInfo.startStr, endTime: selectInfo.endStr, allDay: selectInfo.allDay }
            : null;

        openPopup(
            <EventFormModal
                event={prefill ? { ...prefill } : null}
                onSaved={(saved) => {
                    upsertLocally(saved);
                    closePopup();
                    selectInfo?.view?.calendar?.unselect?.();
                }}
                onDeleted={() => closePopup()}
                onClose={closePopup}
            />
        );
    }, [openPopup, closePopup, upsertLocally]);

    const openEditModal = useCallback((clickInfo) => {
        const ev = clickInfo.event.extendedProps;
        openPopup(
            <EventFormModal
                event={{
                    id: Number(clickInfo.event.id),
                    title: clickInfo.event.title,
                    startTime: clickInfo.event.startStr,
                    endTime: clickInfo.event.endStr,
                    allDay: clickInfo.event.allDay,
                    description: ev.description,
                    location: ev.location,
                    eventType: ev.eventType,
                    clientName: ev.clientName,
                    managerName: ev.managerName,
                    clientUserId: ev.clientUserId,
                    managerUserId: ev.managerUserId,
                    caseId: ev.caseId,
                    leadName: ev.leadName,
                    leadPhone: ev.leadPhone,
                    leadEmail: ev.leadEmail,
                    color: ev.color,
                }}
                onSaved={(saved) => { upsertLocally(saved); closePopup(); }}
                onDeleted={(deletedId) => {
                    setEvents((prev) => prev.filter((e) => e.id !== String(deletedId)));
                    closePopup();
                }}
                onClose={closePopup}
            />
        );
    }, [openPopup, closePopup, upsertLocally]);

    // ── Deep-link: /CalendarScreen?eventId=<id> ────────────────────────────
    useEffect(() => {
        const targetEventId = searchParams.get("eventId") || searchParams.get("appointmentId");
        if (!targetEventId || hasAutoOpenedEventRef.current || !events.length) return;

        const matched = events.find((e) => String(e.id) === String(targetEventId));
        if (!matched) return;

        hasAutoOpenedEventRef.current = true;
        openPopup(
            <EventFormModal
                event={{
                    id: Number(matched.id),
                    title: matched.title,
                    startTime: matched.start,
                    endTime: matched.end,
                    allDay: matched.allDay,
                    ...matched.extendedProps,
                }}
                onSaved={(saved) => { upsertLocally(saved); closePopup(); }}
                onDeleted={(deletedId) => {
                    setEvents((prev) => prev.filter((e) => e.id !== String(deletedId)));
                    closePopup();
                }}
                onClose={closePopup}
            />
        );
    }, [events, searchParams, openPopup, closePopup, upsertLocally]);

    // ── View switcher ──────────────────────────────────────────────────────
    const switchView = (v) => {
        setView(v);
        calendarRef.current?.getApi().changeView(v);
    };

    // ── Filter handlers ────────────────────────────────────────────────────
    const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
    const clearAllFilters = () => {
        setFilters({ lawyer_id: null, client_id: null, case_id: null, event_type: EVENT_TYPE_ALL });
        setClientQuery("");
        setCaseQuery("");
    };
    const hasActiveFilters =
        !!filters.lawyer_id || !!filters.client_id || !!filters.case_id ||
        (filters.event_type && filters.event_type !== EVENT_TYPE_ALL);

    // ── Derived dropdown data ──────────────────────────────────────────────
    const lawyerLegend = useMemo(() => buildLawyerLegend(lawyers), [lawyers]);
    const filteredCases = useMemo(() => {
        const q = caseQuery.trim().toLowerCase();
        if (!q) return allCases.slice(0, 50);
        return allCases
            .filter((c) => String(c?.CaseName || c?.casename || "").toLowerCase().includes(q))
            .slice(0, 50);
    }, [allCases, caseQuery]);

    // ── Lookups for active-filter chips ────────────────────────────────────
    const activeLawyerName = useMemo(() => {
        if (!filters.lawyer_id) return null;
        const hit = lawyers.find((l) =>
            String(l?.UserId ?? l?.userid ?? l?.id) === String(filters.lawyer_id)
        );
        return hit?.Name || hit?.name || `#${filters.lawyer_id}`;
    }, [filters.lawyer_id, lawyers]);
    const activeClientName = useMemo(() => {
        if (!filters.client_id) return null;
        const hit = clientResults.find((c) =>
            String(c?.UserId ?? c?.userid ?? c?.id) === String(filters.client_id)
        );
        return hit?.Name || hit?.name || `#${filters.client_id}`;
    }, [filters.client_id, clientResults]);
    const activeCaseName = useMemo(() => {
        if (!filters.case_id) return null;
        const hit = allCases.find((c) =>
            String(c?.CaseId ?? c?.caseid ?? c?.id) === String(filters.case_id)
        );
        return hit?.CaseName || hit?.casename || `#${filters.case_id}`;
    }, [filters.case_id, allCases]);

    if (!ENABLE_CALENDAR_MODULE) return null;

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && (
                <TopToolBarSmallScreen LogoNavigate={AdminStackName + MainScreenName} />
            )}

            <SimpleScrollView className="lw-calendarScreen__scroll">
                {/* ── Page header ── */}
                <SimpleContainer className="lw-calendarScreen__header">
                    <Text24>{t("calendar.title")}</Text24>

                    <SimpleContainer className="lw-calendarScreen__headerActions">
                        {canUseFirmView && (
                            <div className="lw-calendarScreen__scopeToggle" role="group" aria-label={t("calendar.scopeMine")}>
                                <SimpleButton
                                    className={`lw-calendarScreen__scopeBtn ${scope === SCOPE_MINE ? "is-active" : ""}`}
                                    onPress={() => setScope(SCOPE_MINE)}
                                    aria-pressed={scope === SCOPE_MINE}
                                >
                                    {t("calendar.scopeMine")}
                                </SimpleButton>
                                <SimpleButton
                                    className={`lw-calendarScreen__scopeBtn ${scope === SCOPE_FIRM ? "is-active" : ""}`}
                                    onPress={() => setScope(SCOPE_FIRM)}
                                    aria-pressed={scope === SCOPE_FIRM}
                                >
                                    {t("calendar.scopeFirm")}
                                </SimpleButton>
                            </div>
                        )}

                        {isSmallScreen && (
                            <SecondaryButton
                                onPress={() => setFiltersPanelOpen((v) => !v)}
                                aria-label={filtersPanelOpen ? t("calendar.closeFiltersAria") : t("calendar.openFiltersAria")}
                            >
                                {t("calendar.filtersTitle")}
                            </SecondaryButton>
                        )}

                        <PrimaryButton onPress={() => openCreateModal(null)}>
                            {t("calendar.addEvent")}
                        </PrimaryButton>
                    </SimpleContainer>
                </SimpleContainer>

                {/* ── Google callback message ── */}
                {googleMsg && (
                    <SimpleContainer className="lw-calendarScreen__toast">
                        <Text14 color={googleMsg.includes("נכשל") ? "#E53E3E" : "#38A169"}>
                            {googleMsg}
                        </Text14>
                    </SimpleContainer>
                )}

                {/* ── Active filter chips ── */}
                {hasActiveFilters && (
                    <SimpleContainer className="lw-calendarScreen__chips">
                        <Text12 color="#4C6690">{t("calendar.activeFilters")}:</Text12>
                        {activeLawyerName && (
                            <button type="button" className="lw-calendarScreen__chip" onClick={() => setFilter("lawyer_id", null)}>
                                {activeLawyerName} ✕
                            </button>
                        )}
                        {activeClientName && (
                            <button type="button" className="lw-calendarScreen__chip" onClick={() => setFilter("client_id", null)}>
                                {activeClientName} ✕
                            </button>
                        )}
                        {activeCaseName && (
                            <button type="button" className="lw-calendarScreen__chip" onClick={() => setFilter("case_id", null)}>
                                {activeCaseName} ✕
                            </button>
                        )}
                        {filters.event_type && filters.event_type !== EVENT_TYPE_ALL && (
                            <button type="button" className="lw-calendarScreen__chip" onClick={() => setFilter("event_type", EVENT_TYPE_ALL)}>
                                {filters.event_type === EVENT_TYPE_LEAVE ? t("calendar.eventTypeLeave") : t("calendar.eventTypeAppointment")} ✕
                            </button>
                        )}
                        <button type="button" className="lw-calendarScreen__chip lw-calendarScreen__chip--clear" onClick={clearAllFilters}>
                            {t("calendar.clearFilters")}
                        </button>
                    </SimpleContainer>
                )}

                {/* ── Layout: sidebar + calendar ── */}
                <SimpleContainer className={`lw-calendarScreen__layout ${filtersPanelOpen ? "is-sidebarOpen" : "is-sidebarClosed"}`}>

                    {/* ── Sidebar filter panel ── */}
                    {filtersPanelOpen && (
                        <SimpleCard className="lw-calendarScreen__sidebar">
                            <SimpleContainer className="lw-calendarScreen__sidebarHeader">
                                <TextBold14 color="#2A4365">{t("calendar.filtersTitle")}</TextBold14>
                                {isSmallScreen && (
                                    <SimpleButton
                                        className="lw-calendarScreen__sidebarClose"
                                        onPress={() => setFiltersPanelOpen(false)}
                                        aria-label={t("calendar.closeFiltersAria")}
                                    >
                                        ✕
                                    </SimpleButton>
                                )}
                            </SimpleContainer>

                            {/* Lawyer filter — managers only */}
                            {canUseFirmView && (
                                <SimpleContainer className="lw-calendarScreen__filterGroup">
                                    <label className="lw-calendarScreen__filterLabel">{t("calendar.filterByLawyer")}</label>
                                    <select
                                        className="lw-calendarScreen__select"
                                        value={filters.lawyer_id || ""}
                                        onChange={(e) => setFilter("lawyer_id", e.target.value ? Number(e.target.value) : null)}
                                    >
                                        <option value="">{t("calendar.eventTypeAll")}</option>
                                        {lawyers.map((l) => {
                                            const id = l?.UserId ?? l?.userid ?? l?.id;
                                            const name = l?.Name ?? l?.name ?? `#${id}`;
                                            return id != null ? <option key={id} value={id}>{name}</option> : null;
                                        })}
                                    </select>
                                </SimpleContainer>
                            )}

                            {/* Client filter — debounced search */}
                            <SimpleContainer className="lw-calendarScreen__filterGroup">
                                <label className="lw-calendarScreen__filterLabel">{t("calendar.filterByClient")}</label>
                                <input
                                    type="text"
                                    className="lw-calendarScreen__input"
                                    placeholder={t("calendar.searchClientPlaceholder")}
                                    value={clientQuery}
                                    onChange={(e) => setClientQuery(e.target.value)}
                                />
                                {clientResults.length > 0 && (
                                    <SimpleContainer className="lw-calendarScreen__resultList">
                                        {clientResults.map((c) => {
                                            const id = c?.UserId ?? c?.userid ?? c?.id;
                                            const name = c?.Name ?? c?.name ?? "—";
                                            return (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    className={`lw-calendarScreen__resultItem ${String(filters.client_id) === String(id) ? "is-active" : ""}`}
                                                    onClick={() => setFilter("client_id", id)}
                                                >
                                                    {name}
                                                </button>
                                            );
                                        })}
                                    </SimpleContainer>
                                )}
                            </SimpleContainer>

                            {/* Case filter */}
                            <SimpleContainer className="lw-calendarScreen__filterGroup">
                                <label className="lw-calendarScreen__filterLabel">{t("calendar.filterByCase")}</label>
                                <input
                                    type="text"
                                    className="lw-calendarScreen__input"
                                    placeholder={t("calendar.searchCasePlaceholder")}
                                    value={caseQuery}
                                    onChange={(e) => setCaseQuery(e.target.value)}
                                />
                                <select
                                    className="lw-calendarScreen__select"
                                    value={filters.case_id || ""}
                                    onChange={(e) => setFilter("case_id", e.target.value ? Number(e.target.value) : null)}
                                >
                                    <option value="">{t("calendar.eventTypeAll")}</option>
                                    {filteredCases.map((c) => {
                                        const id = c?.CaseId ?? c?.caseid ?? c?.id;
                                        const name = c?.CaseName ?? c?.casename ?? `#${id}`;
                                        return id != null ? <option key={id} value={id}>{name}</option> : null;
                                    })}
                                </select>
                            </SimpleContainer>

                            {/* Event type filter */}
                            <div className="lw-calendarScreen__filterGroup">
                                <label className="lw-calendarScreen__filterLabel">{t("calendar.filterByEventType")}</label>
                                <div className="lw-calendarScreen__segmented" role="group">
                                    {[
                                        { v: EVENT_TYPE_ALL, label: t("calendar.eventTypeAll") },
                                        { v: EVENT_TYPE_APPT, label: t("calendar.eventTypeAppointment") },
                                        { v: EVENT_TYPE_LEAVE, label: t("calendar.eventTypeLeave") },
                                    ].map((opt) => (
                                        <SimpleButton
                                            key={opt.v}
                                            className={`lw-calendarScreen__segmentedBtn ${filters.event_type === opt.v ? "is-active" : ""}`}
                                            onPress={() => setFilter("event_type", opt.v)}
                                            aria-pressed={filters.event_type === opt.v}
                                        >
                                            {opt.label}
                                        </SimpleButton>
                                    ))}
                                </div>
                            </div>

                            {/* Clear-all */}
                            {hasActiveFilters && (
                                <SecondaryButton onPress={clearAllFilters} className="lw-calendarScreen__clearBtn">
                                    {t("calendar.clearFilters")}
                                </SecondaryButton>
                            )}

                            {/* Lawyer legend — visible whenever firm view is active */}
                            {canUseFirmView && scope === SCOPE_FIRM && (
                                <SimpleContainer className="lw-calendarScreen__legend">
                                    <TextBold14 color="#2A4365">{t("calendar.lawyersLegend")}</TextBold14>
                                    {lawyerLegend.length === 0 ? (
                                        <Text12 color="#718096">{t("calendar.noLawyers")}</Text12>
                                    ) : (
                                        <SimpleContainer className="lw-calendarScreen__legendList">
                                            {lawyerLegend.map((l) => (
                                                <SimpleContainer key={l.id} className="lw-calendarScreen__legendItem">
                                                    <span className="lw-calendarScreen__legendDot" style={{ backgroundColor: l.color }} />
                                                    <Text12 color="#2D3748">{l.name}</Text12>
                                                </SimpleContainer>
                                            ))}
                                        </SimpleContainer>
                                    )}

                                    {/* Leave color row */}
                                    <SimpleContainer className="lw-calendarScreen__legendItem lw-calendarScreen__legendItem--leave">
                                        <span className="lw-calendarScreen__legendDot lw-calendarScreen__legendDot--striped" style={{ backgroundColor: leaveColor() }} />
                                        <Text12 color="#2D3748">{t("calendar.leaveLabel")}</Text12>
                                    </SimpleContainer>
                                </SimpleContainer>
                            )}
                        </SimpleCard>
                    )}

                    {/* ── Calendar column ── */}
                    <SimpleContainer className="lw-calendarScreen__calendarCol">

                        {/* View switcher */}
                        <SimpleContainer className="lw-calendarScreen__viewSwitcher">
                            <SecondaryButton
                                className={view === "dayGridMonth" ? "is-active" : ""}
                                onPress={() => switchView("dayGridMonth")}
                            >
                                {t("calendar.monthView")}
                            </SecondaryButton>
                            <SecondaryButton
                                className={view === "timeGridWeek" ? "is-active" : ""}
                                onPress={() => switchView("timeGridWeek")}
                            >
                                {t("calendar.weekView")}
                            </SecondaryButton>
                            <SecondaryButton
                                className={view === "timeGridDay" ? "is-active" : ""}
                                onPress={() => switchView("timeGridDay")}
                            >
                                {t("calendar.dayView")}
                            </SecondaryButton>
                        </SimpleContainer>

                        {/* Calendar */}
                        <SimpleCard className="lw-calendarScreen__calendarCard">
                            <FullCalendar
                                ref={calendarRef}
                                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                                initialView={view}
                                locale={heLocale}
                                direction="rtl"
                                headerToolbar={{
                                    start: "prev,next today",
                                    center: "title",
                                    end: "",
                                }}
                                events={events}
                                selectable
                                selectMirror
                                select={openCreateModal}
                                eventClick={openEditModal}
                                datesSet={fetchEvents}
                                height="auto"
                                hiddenDays={hiddenDays}
                                businessHours={businessHours}
                                slotMinTime={workingHoursStart}
                                slotMaxTime={workingHoursEnd}
                                nowIndicator
                                slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
                                eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
                                noEventsText={t("calendar.noEvents")}
                            />
                        </SimpleCard>
                    </SimpleContainer>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
