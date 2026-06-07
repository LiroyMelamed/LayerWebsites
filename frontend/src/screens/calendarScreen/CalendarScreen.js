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
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import { Text24, Text14, Text12, TextBold14 } from "../../components/specializedComponents/text/AllTextKindFile";
import { usePopup } from "../../providers/PopUpProvider";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
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
import PersonalSyncModal from "./components/PersonalSyncModal";
import { colorForKey, colorKeyForEvent, leaveColor, buildLawyerLegend } from "./utils/lawyerColors";
import { buildNewEventPrefill } from "./utils/eventDefaults";

import "./CalendarScreen.scss";

export const CalendarScreenName = "/CalendarScreen";

// ─── Constants ────────────────────────────────────────────────────────────────
const SCOPE_MINE = "mine";
const SCOPE_FIRM = "firm";

const EVENT_TYPE_ALL = "all";
const EVENT_TYPE_APPT = "appointment";
const EVENT_TYPE_LEAVE = "leave";
const EVENT_TYPE_HEARING = "hearing";
const EVENT_TYPE_REMINDER = "reminder";

const EVENT_TYPE_FILTER_OPTIONS = [
    { v: EVENT_TYPE_ALL, labelKey: "calendar.eventTypeAll" },
    { v: EVENT_TYPE_APPT, labelKey: "calendar.eventTypeAppointment" },
    { v: EVENT_TYPE_LEAVE, labelKey: "calendar.eventTypeLeave" },
    { v: EVENT_TYPE_HEARING, labelKey: "calendar.eventTypeHearing" },
    { v: EVENT_TYPE_REMINDER, labelKey: "calendar.eventTypeReminder" },
];

function _eventTypeFilterLabel(eventType, t) {
    const hit = EVENT_TYPE_FILTER_OPTIONS.find((opt) => opt.v === eventType);
    return hit ? t(hit.labelKey) : eventType;
}

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

    // Firm view: color by manager (מנהל) so legend matches who handles the event.
    const color = scope === SCOPE_FIRM
        ? colorForKey(colorKeyForEvent(ev))
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

/** HH:MM pill label for the FullCalendar now-indicator axis. */
function _formatNowBadgeTime(date) {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}

/** Stable React key — forces modal remount so client/case state never leaks between events. */
function _eventFormModalKey(event) {
    if (event?.id != null) return `edit-${event.id}`;
    return `create-${event?.startTime || "blank"}-${event?.endTime || "blank"}`;
}

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
    const [managerFilterLabel, setManagerFilterLabel] = useState("");
    const [clientFilterLabel, setClientFilterLabel] = useState("");
    const [caseFilterLabel, setCaseFilterLabel] = useState("");

    const {
        result: adminResults,
        isPerforming: isSearchingAdmins,
        performRequest: searchAdmins,
    } = useAutoHttpRequest(adminApi.getAdminByName, { onFailure: () => { } });

    const {
        result: customerResults,
        isPerforming: isSearchingCustomers,
        performRequest: searchCustomers,
    } = useAutoHttpRequest(customersApi.getCustomersByName, { onFailure: () => { } });

    const {
        result: caseResults,
        isPerforming: isSearchingCases,
        performRequest: searchCases,
    } = useAutoHttpRequest(casesApi.getCaseByName, { onFailure: () => { } });

    // ── Google callback toast ──────────────────────────────────────────────
    const [googleMsg, setGoogleMsg] = useState("");

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

    useEffect(() => {
        if (searchParams.get("google_connected") === "1") {
            setGoogleMsg("Google Calendar חובר בהצלחה ✓");
            (async () => {
                try {
                    await calendarApi.syncGoogleEvents();
                } catch { /* status toast still shown */ }
                fetchEvents(null);
            })();
            setTimeout(() => setGoogleMsg(""), 4000);
        }
        if (searchParams.get("google_error") === "1") {
            setGoogleMsg("חיבור Google Calendar נכשל. נסה שוב.");
            setTimeout(() => setGoogleMsg(""), 4000);
        }
    }, [searchParams, fetchEvents]);

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

    const openPersonalSyncModal = useCallback(() => {
        openPopup(
            <PersonalSyncModal
                closePopUpFunction={closePopup}
                onEventsChanged={() => fetchEvents(null)}
            />
        );
    }, [openPopup, closePopup, fetchEvents]);

    const openCreateModal = useCallback((selectInfo) => {
        const prefill = buildNewEventPrefill(selectInfo, {
            workingHoursStart,
            workingHoursEnd,
        });

        openPopup(
            <EventFormModal
                key={_eventFormModalKey(prefill)}
                event={prefill}
                onUpdated={upsertLocally}
                onSaved={(saved) => {
                    upsertLocally(saved);
                    closePopup();
                    selectInfo?.view?.calendar?.unselect?.();
                }}
                onDeleted={() => closePopup()}
                onClose={closePopup}
            />
        );
    }, [openPopup, closePopup, upsertLocally, workingHoursStart, workingHoursEnd]);

    const openEditModal = useCallback((clickInfo) => {
        const ev = clickInfo.event.extendedProps;
        const eventPayload = {
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
            caseName: ev.caseName,
            leadName: ev.leadName,
            leadPhone: ev.leadPhone,
            leadEmail: ev.leadEmail,
            leadCaseName: ev.leadCaseName,
            color: ev.color,
        };
        openPopup(
            <EventFormModal
                key={_eventFormModalKey(eventPayload)}
                event={eventPayload}
                onUpdated={upsertLocally}
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
        const eventPayload = {
            id: Number(matched.id),
            title: matched.title,
            startTime: matched.start,
            endTime: matched.end,
            allDay: matched.allDay,
            ...matched.extendedProps,
        };
        openPopup(
            <EventFormModal
                key={_eventFormModalKey(eventPayload)}
                event={eventPayload}
                onUpdated={upsertLocally}
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

    const renderNowIndicatorContent = useCallback((arg) => {
        if (!arg.isAxis) return null;
        const label = _formatNowBadgeTime(arg.date);
        return { html: `<span class="lw-fcNowBadge">${label}</span>` };
    }, []);

    // ── Filter handlers ────────────────────────────────────────────────────
    const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
    const clearAllFilters = () => {
        setFilters({ lawyer_id: null, client_id: null, case_id: null, event_type: EVENT_TYPE_ALL });
        setManagerFilterLabel("");
        setClientFilterLabel("");
        setCaseFilterLabel("");
    };
    const hasActiveFilters =
        !!filters.lawyer_id || !!filters.client_id || !!filters.case_id ||
        (filters.event_type && filters.event_type !== EVENT_TYPE_ALL);

    // ── Derived dropdown data ──────────────────────────────────────────────
    const lawyerLegend = useMemo(() => buildLawyerLegend(lawyers), [lawyers]);

    const handleManagerFilterSearch = useCallback((name) => {
        setManagerFilterLabel(name);
        if (!String(name || "").trim()) {
            setFilter("lawyer_id", null);
        }
        searchAdmins(name);
    }, [searchAdmins]);

    const handleManagerFilterSelected = useCallback((selectedName, resultItem) => {
        const selectedAdmin = resultItem || (Array.isArray(adminResults)
            ? adminResults.find((a) => a.name?.trim() === selectedName?.trim())
            : null);
        const id = selectedAdmin?.userid ?? selectedAdmin?.UserId ?? selectedAdmin?.id;
        const name = selectedAdmin?.name ?? selectedAdmin?.Name ?? selectedName ?? "";
        if (id == null) return;
        setFilter("lawyer_id", id);
        setManagerFilterLabel(name);
    }, [adminResults]);

    const handleClientFilterSearch = useCallback((name) => {
        setClientFilterLabel(name);
        if (!String(name || "").trim()) {
            setFilter("client_id", null);
        }
        searchCustomers(name);
    }, [searchCustomers]);

    const handleClientFilterSelected = useCallback((item) => {
        const id = item?.UserId ?? item?.userid ?? item?.id;
        const name = item?.Name ?? item?.name ?? "";
        if (id == null) return;
        setFilter("client_id", id);
        setClientFilterLabel(name);
    }, []);

    const handleCaseFilterSearch = useCallback((name) => {
        setCaseFilterLabel(name);
        if (!String(name || "").trim()) {
            setFilter("case_id", null);
        }
        searchCases(name);
    }, [searchCases]);

    const handleCaseFilterSelected = useCallback((item) => {
        const id = item?.CaseId ?? item?.caseid ?? item?.id;
        const name = item?.CaseName ?? item?.casename ?? "";
        if (id == null) return;
        setFilter("case_id", id);
        setCaseFilterLabel(name);
    }, []);

    // ── Lookups for active-filter chips ────────────────────────────────────
    const activeManagerName = filters.lawyer_id
        ? (managerFilterLabel || `#${filters.lawyer_id}`)
        : null;
    const activeClientName = filters.client_id
        ? (clientFilterLabel || `#${filters.client_id}`)
        : null;
    const activeCaseName = filters.case_id
        ? (caseFilterLabel || `#${filters.case_id}`)
        : null;

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

                        <SecondaryButton
                            className="lw-calendarScreen__syncBtn"
                            onPress={openPersonalSyncModal}
                            aria-label={t("calendar.openPersonalSyncAria")}
                        >
                            {t("calendar.openPersonalSync")}
                        </SecondaryButton>

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
                        {activeManagerName && (
                            <button type="button" className="lw-calendarScreen__chip" onClick={() => {
                                setFilter("lawyer_id", null);
                                setManagerFilterLabel("");
                            }}>
                                {activeManagerName} ✕
                            </button>
                        )}
                        {activeClientName && (
                            <button type="button" className="lw-calendarScreen__chip" onClick={() => {
                                setFilter("client_id", null);
                                setClientFilterLabel("");
                            }}>
                                {activeClientName} ✕
                            </button>
                        )}
                        {activeCaseName && (
                            <button type="button" className="lw-calendarScreen__chip" onClick={() => {
                                setFilter("case_id", null);
                                setCaseFilterLabel("");
                            }}>
                                {activeCaseName} ✕
                            </button>
                        )}
                        {filters.event_type && filters.event_type !== EVENT_TYPE_ALL && (
                            <button type="button" className="lw-calendarScreen__chip" onClick={() => setFilter("event_type", EVENT_TYPE_ALL)}>
                                {_eventTypeFilterLabel(filters.event_type, t)} ✕
                            </button>
                        )}
                        <button type="button" className="lw-calendarScreen__chip lw-calendarScreen__chip--clear" onClick={clearAllFilters}>
                            {t("calendar.clearFilters")}
                        </button>
                    </SimpleContainer>
                )}

                {/* ── Manager / client / case filters (one row) ── */}
                {filtersPanelOpen && (
                    <SimpleContainer
                        className={`lw-calendarScreen__filterRow ${canUseFirmView ? "lw-calendarScreen__filterRow--three" : "lw-calendarScreen__filterRow--two"}`}
                    >
                        {canUseFirmView && (
                            <SimpleContainer className="lw-calendarScreen__filterGroup">
                                <SearchInput
                                    title={t("calendar.filterByManager")}
                                    value={managerFilterLabel}
                                    onSearch={handleManagerFilterSearch}
                                    isPerforming={isSearchingAdmins}
                                    queryResult={adminResults}
                                    getButtonTextFunction={(item) => item.name}
                                    buttonPressFunction={handleManagerFilterSelected}
                                    clearOnSelect={false}
                                />
                            </SimpleContainer>
                        )}

                        <SimpleContainer className="lw-calendarScreen__filterGroup">
                            <SearchInput
                                title={t("calendar.filterByClient")}
                                value={clientFilterLabel}
                                onSearch={handleClientFilterSearch}
                                isPerforming={isSearchingCustomers}
                                queryResult={customerResults}
                                getButtonTextFunction={(item) => item.Name}
                                buttonPressFunction={handleClientFilterSelected}
                                clearOnSelect={false}
                            />
                        </SimpleContainer>

                        <SimpleContainer className="lw-calendarScreen__filterGroup">
                            <SearchInput
                                title={t("calendar.filterByCase")}
                                value={caseFilterLabel}
                                onSearch={handleCaseFilterSearch}
                                isPerforming={isSearchingCases}
                                queryResult={caseResults}
                                getButtonTextFunction={(item) => item.CaseName}
                                buttonPressFunction={handleCaseFilterSelected}
                                clearOnSelect={false}
                            />
                        </SimpleContainer>
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

                            {/* Event type filter */}
                            <div className="lw-calendarScreen__filterGroup">
                                <label className="lw-calendarScreen__filterLabel">{t("calendar.filterByEventType")}</label>
                                <div className="lw-calendarScreen__segmented lw-calendarScreen__segmented--eventTypes" role="group">
                                    {EVENT_TYPE_FILTER_OPTIONS.map((opt) => (
                                        <SimpleButton
                                            key={opt.v}
                                            className={`lw-calendarScreen__segmentedBtn ${filters.event_type === opt.v ? "is-active" : ""}`}
                                            onPress={() => setFilter("event_type", opt.v)}
                                            aria-pressed={filters.event_type === opt.v}
                                        >
                                            {t(opt.labelKey)}
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
                                nowIndicatorContent={renderNowIndicatorContent}
                                nowIndicatorClassNames="lw-fcNowIndicator"
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
