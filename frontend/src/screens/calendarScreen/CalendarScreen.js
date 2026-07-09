import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import heLocale from "@fullcalendar/core/locales/he";
import arLocale from "@fullcalendar/core/locales/ar";
import enGbLocale from "@fullcalendar/core/locales/en-gb";

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

import SegmentedSwitch from "../../components/styledComponents/SegmentedSwitch";

import EventFormModal from "./components/EventFormModal";
import PersonalSyncModal from "./components/PersonalSyncModal";
import { colorForKey, colorKeyForEvent, leaveColor, holidayColor, buildLawyerLegend } from "./utils/lawyerColors";
import { buildNewEventPrefill } from "./utils/eventDefaults";
import {
    defaultSchedule,
    parseScheduleFromCalendarSettings,
    getHiddenDays,
    getBusinessHours,
    getSlotRange,
} from "./utils/workingHours";

import "./CalendarScreen.scss";

export const CalendarScreenName = "/CalendarScreen";

/** FullCalendar locale must follow the website language (i18next), not the OS. */
function fullCalendarLocaleFor(lang) {
    const key = String(lang || "").toLowerCase().slice(0, 2);
    if (key === "ar") return arLocale;
    if (key === "en") return enGbLocale;
    return heLocale;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SCOPE_MINE = "mine";
const SCOPE_FIRM = "firm";

const EVENT_TYPE_ALL = "all";
const EVENT_TYPE_APPT = "appointment";
const EVENT_TYPE_LEAVE = "leave";
const EVENT_TYPE_HEARING = "hearing";
const EVENT_TYPE_REMINDER = "reminder";
const EVENT_TYPE_HOLIDAY = "holiday";

const EVENT_TYPE_FILTER_OPTIONS = [
    { v: EVENT_TYPE_ALL, labelKey: "calendar.eventTypeAll" },
    { v: EVENT_TYPE_APPT, labelKey: "calendar.eventTypeAppointment" },
    { v: EVENT_TYPE_LEAVE, labelKey: "calendar.eventTypeLeave" },
    { v: EVENT_TYPE_HEARING, labelKey: "calendar.eventTypeHearing" },
    { v: EVENT_TYPE_REMINDER, labelKey: "calendar.eventTypeReminder" },
    { v: EVENT_TYPE_HOLIDAY, labelKey: "calendar.eventTypeHoliday" },
];

function _eventTypeFilterLabel(eventType, t) {
    const hit = EVENT_TYPE_FILTER_OPTIONS.find((opt) => opt.v === eventType);
    return hit ? t(hit.labelKey) : eventType;
}

// Map a raw calendar_events row → FullCalendar EventInput. The scope drives
// whether we color by lawyer (firm view) or by event.color (personal view).

/** FullCalendar all-day end is exclusive — extend by one calendar day. */
function leaveAllDayRange(startTime, endTime) {
    const start = String(startTime || "").slice(0, 10);
    const endBase = new Date(endTime);
    if (Number.isNaN(endBase.getTime())) return { start, end: start };
    endBase.setUTCDate(endBase.getUTCDate() + 1);
    return { start, end: endBase.toISOString().slice(0, 10) };
}

function buildInternalAllDayEvent(ev, { labelPrefix, color, className }) {
    const managerLabel = ev?.managerName || ev?.ownerName || "";
    const titleCore = ev?.title || managerLabel;
    const { start, end } = leaveAllDayRange(ev.startTime, ev.endTime);
    return {
        id: String(ev.id),
        title: titleCore ? `${labelPrefix} ${titleCore}` : labelPrefix,
        start,
        end,
        allDay: true,
        backgroundColor: color,
        borderColor: color,
        textColor: "#FFFFFF",
        classNames: [className],
        extendedProps: ev,
    };
}

function buildFullCalendarEvent(ev, { scope }) {
    const isLeave = ev?.eventType === "leave";
    const isHoliday = ev?.eventType === "holiday";

    // Leave/holiday events render as muted background blocks across the day(s).
    // Must be all-day — timed background events do not span days in month view.
    if (isLeave) {
        return buildInternalAllDayEvent(ev, {
            labelPrefix: "[חופשה]",
            color: leaveColor(),
            className: "lw-fcEvent--leave",
        });
    }
    if (isHoliday) {
        return buildInternalAllDayEvent(ev, {
            labelPrefix: "[חג]",
            color: holidayColor(),
            className: "lw-fcEvent--holiday",
        });
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
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { isSmallScreen } = useScreenSize();
    const { openPopup, closePopup } = usePopup();
    const [searchParams, setSearchParams] = useSearchParams();

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
    const fetchEventsRef = useRef(null);

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

    // ── Working-hours config (per weekday) ─────────────────────────────────
    const [workingSchedule, setWorkingSchedule] = useState(() => defaultSchedule());

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

    // ── Status toasts (OAuth + save notices) ───────────────────────────────
    const [googleMsg, setGoogleMsg] = useState("");
    const [calendarMsg, setCalendarMsg] = useState("");

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

    // ── Load firm per-day working hours from platform settings ─────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await platformSettingsApi.getAll();
                const cal = res?.data?.settings?.calendar || res?.settings?.calendar || {};
                if (cancelled) return;
                setWorkingSchedule(parseScheduleFromCalendarSettings(cal));
            } catch { /* keep defaults */ }
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Filter assembly ─────────────────────────────────────────────────────
    const apiFilters = useMemo(() => {
        const f = {};
        const isFirmScope = canUseFirmView && scope === SCOPE_FIRM;
        f.scope = isFirmScope ? SCOPE_FIRM : SCOPE_MINE;
        // Lawyer pin is firm-view only — must not leak into "היומן שלי".
        if (isFirmScope && filters.lawyer_id) f.lawyer_id = filters.lawyer_id;
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

    fetchEventsRef.current = fetchEvents;

    // Re-fetch whenever filters/scope change (range is reused from the last datesSet).
    useEffect(() => { fetchEvents(null); }, [fetchEvents]);

    // Lawyer filter is firm-view only — drop it if scope is personal.
    useEffect(() => {
        if (scope !== SCOPE_MINE || !filters.lawyer_id) return;
        setFilters((prev) => ({ ...prev, lawyer_id: null }));
        setManagerFilterLabel("");
    }, [scope, filters.lawyer_id]);

    useEffect(() => {
        const googleConnected = searchParams.get("google_connected") === "1";
        const googleError = searchParams.get("google_error") === "1";
        const outlookConnected = searchParams.get("outlook_connected") === "1";
        const outlookError = searchParams.get("outlook_error") === "1";

        if (!googleConnected && !googleError && !outlookConnected && !outlookError) {
            return;
        }

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("google_connected");
        nextParams.delete("google_error");
        nextParams.delete("outlook_connected");
        nextParams.delete("outlook_error");
        setSearchParams(nextParams, { replace: true });

        if (googleConnected) {
            setGoogleMsg("Google Calendar חובר בהצלחה ✓");
            (async () => {
                try {
                    await calendarApi.syncGoogleEvents();
                } catch { /* status toast still shown */ }
                fetchEventsRef.current?.(null);
            })();
            setTimeout(() => setGoogleMsg(""), 4000);
        }
        if (googleError) {
            setGoogleMsg("חיבור Google Calendar נכשל. נסה שוב.");
            setTimeout(() => setGoogleMsg(""), 4000);
        }
        if (outlookConnected) {
            setGoogleMsg("Outlook Calendar חובר בהצלחה ✓");
            (async () => {
                try {
                    await calendarApi.syncOutlookEvents();
                } catch { /* status toast still shown */ }
                fetchEventsRef.current?.(null);
            })();
            setTimeout(() => setGoogleMsg(""), 4000);
        }
        if (outlookError) {
            setGoogleMsg("חיבור Outlook Calendar נכשל. נסה שוב.");
            setTimeout(() => setGoogleMsg(""), 4000);
        }
    }, [searchParams, setSearchParams]);

    // ── FullCalendar config ────────────────────────────────────────────────
    // Hide closed weekdays everywhere (month / week / day) per platform settings.
    const hiddenDays = useMemo(() => getHiddenDays(workingSchedule), [workingSchedule]);

    const businessHours = useMemo(() => getBusinessHours(workingSchedule), [workingSchedule]);

    const slotRange = useMemo(() => getSlotRange(workingSchedule), [workingSchedule]);

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

    const handleEventSaved = useCallback((saved, { firmOnlyNotice } = {}) => {
        upsertLocally(saved);
        fetchEvents(null);
        closePopup();
        if (firmOnlyNotice) {
            setCalendarMsg(t("calendar.savedFirmOnlyNotice"));
            setTimeout(() => setCalendarMsg(""), 8000);
        }
    }, [upsertLocally, fetchEvents, closePopup, t]);

    const openPersonalSyncModal = useCallback(() => {
        openPopup(
            <PersonalSyncModal
                closePopUpFunction={closePopup}
                onEventsChanged={() => fetchEvents(null)}
            />
        );
    }, [openPopup, closePopup, fetchEvents]);

    // Dedupe guard — a desktop mouse click fires both dateClick and select,
    // which would otherwise open the modal twice.
    const lastCreateOpenRef = useRef({ key: null, ts: 0 });

    const openCreateModal = useCallback((selectInfo) => {
        const prefill = buildNewEventPrefill(selectInfo, { workingSchedule });

        const dedupeKey = prefill.startTime;
        const now = Date.now();
        if (
            lastCreateOpenRef.current.key === dedupeKey &&
            now - lastCreateOpenRef.current.ts < 800
        ) {
            return;
        }
        lastCreateOpenRef.current = { key: dedupeKey, ts: now };

        openPopup(
            <EventFormModal
                key={_eventFormModalKey(prefill)}
                event={prefill}
                onUpdated={upsertLocally}
                onSaved={(saved, opts) => {
                    handleEventSaved(saved, opts);
                    selectInfo?.view?.calendar?.unselect?.();
                }}
                onDeleted={() => closePopup()}
                onClose={closePopup}
            />
        );
    }, [openPopup, closePopup, upsertLocally, handleEventSaved, workingSchedule]);

    const openEditModal = useCallback((clickInfo) => {
        const ev = clickInfo.event.extendedProps || {};
        const eventPayload = {
            ...ev,
            id: Number(clickInfo.event.id),
            title: ev.title || clickInfo.event.title,
            startTime: ev.startTime || clickInfo.event.startStr,
            endTime: ev.endTime || clickInfo.event.endStr,
            allDay: ev.allDay ?? clickInfo.event.allDay,
        };
        openPopup(
            <EventFormModal
                key={_eventFormModalKey(eventPayload)}
                event={eventPayload}
                onUpdated={upsertLocally}
                onSaved={handleEventSaved}
                onDeleted={(deletedId) => {
                    setEvents((prev) => prev.filter((e) => e.id !== String(deletedId)));
                    closePopup();
                }}
                onClose={closePopup}
            />
        );
    }, [openPopup, closePopup, upsertLocally, handleEventSaved]);

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
                onSaved={handleEventSaved}
                onDeleted={(deletedId) => {
                    setEvents((prev) => prev.filter((e) => e.id !== String(deletedId)));
                    closePopup();
                }}
                onClose={closePopup}
            />
        );
    }, [events, searchParams, openPopup, closePopup, upsertLocally, handleEventSaved]);

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

    const switchToMineScope = useCallback(() => {
        setScope(SCOPE_MINE);
        setFilters((prev) => (prev.lawyer_id ? { ...prev, lawyer_id: null } : prev));
        setManagerFilterLabel("");
    }, []);

    const switchToFirmScope = useCallback(() => setScope(SCOPE_FIRM), []);
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

    const handleClientFilterSelected = useCallback((selectedName, resultItem) => {
        const item = resultItem || (Array.isArray(customerResults)
            ? customerResults.find((c) => c.Name?.trim() === selectedName?.trim())
            : null);
        const id = item?.UserId ?? item?.userid ?? item?.id;
        const name = item?.Name ?? item?.name ?? selectedName ?? "";
        if (id == null) return;
        setFilter("client_id", id);
        setClientFilterLabel(name);
    }, [customerResults]);

    const handleCaseFilterSearch = useCallback((name) => {
        setCaseFilterLabel(name);
        if (!String(name || "").trim()) {
            setFilter("case_id", null);
        }
        searchCases(name);
    }, [searchCases]);

    const handleCaseFilterSelected = useCallback((selectedName, resultItem) => {
        const item = resultItem || (Array.isArray(caseResults)
            ? caseResults.find((c) => c.CaseName?.trim() === selectedName?.trim())
            : null);
        const id = item?.CaseId ?? item?.caseid ?? item?.id;
        const name = item?.CaseName ?? item?.casename ?? selectedName ?? "";
        if (id == null) return;
        setFilter("case_id", id);
        setCaseFilterLabel(name);
    }, [caseResults]);

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
                            <SegmentedSwitch
                                className="lw-calendarScreen__scopeSwitch"
                                ariaLabel={t("calendar.scopeMine")}
                                value={scope}
                                onChange={(next) => {
                                    if (next === SCOPE_FIRM) switchToFirmScope();
                                    else switchToMineScope();
                                }}
                                options={[
                                    { value: SCOPE_MINE, label: t("calendar.scopeMine") },
                                    { value: SCOPE_FIRM, label: t("calendar.scopeFirm") },
                                ]}
                            />
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

                {/* ── Status toasts (OAuth + save notices) ── */}
                {googleMsg && (
                    <SimpleContainer className="lw-calendarScreen__toast">
                        <Text14 color={googleMsg.includes("נכשל") ? "#E53E3E" : "#38A169"}>
                            {googleMsg}
                        </Text14>
                    </SimpleContainer>
                )}
                {calendarMsg && (
                    <SimpleContainer className="lw-calendarScreen__toast">
                        <Text14 color="#744210">{calendarMsg}</Text14>
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
                        className={`lw-calendarScreen__filterRow ${canUseFirmView && scope === SCOPE_FIRM ? "lw-calendarScreen__filterRow--three" : "lw-calendarScreen__filterRow--two"}`}
                    >
                        {canUseFirmView && scope === SCOPE_FIRM && (
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
                                locale={fullCalendarLocaleFor(i18n.language)}
                                direction={String(i18n.language || "he").startsWith("en") ? "ltr" : "rtl"}
                                headerToolbar={{
                                    start: "prev,next today",
                                    center: "title",
                                    end: "",
                                }}
                                events={events}
                                selectable
                                selectMirror
                                select={openCreateModal}
                                // Touch devices: a plain tap doesn't trigger `select`
                                // (that needs a long-press), so open the create modal
                                // from dateClick as well. openCreateModal dedupes the
                                // double-fire on desktop clicks.
                                dateClick={(info) => {
                                    const start = info.date;
                                    let end = null;
                                    if (!info.allDay && start instanceof Date) {
                                        end = new Date(start);
                                        end.setHours(end.getHours() + 1);
                                    }
                                    openCreateModal({ start, end, allDay: info.allDay });
                                }}
                                eventClick={openEditModal}
                                datesSet={fetchEvents}
                                longPressDelay={350}
                                selectLongPressDelay={350}
                                eventLongPressDelay={0}
                                height="auto"
                                hiddenDays={hiddenDays}
                                businessHours={businessHours}
                                slotMinTime={slotRange.min}
                                slotMaxTime={slotRange.max}
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
