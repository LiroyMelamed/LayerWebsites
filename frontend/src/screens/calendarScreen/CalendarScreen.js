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
import { useCalendarModuleEnabled } from "../../services/firmSettings";

import calendarApi from "../../api/calendarApi";
import platformSettingsApi from "../../api/platformSettingsApi";
import { adminApi } from "../../api/adminApi";
import { customersApi } from "../../api/customersApi";
import casesApi from "../../api/casesApi";

import SegmentedSwitch from "../../components/styledComponents/SegmentedSwitch";

import EventFormModal from "./components/EventFormModal";
import PersonalSyncModal from "./components/PersonalSyncModal";
import { colorForKey, colorKeyForEvent, leaveColor, holidayColor, buildLawyerLegend, getEventTypeDefaultColor, isStockEventColor } from "./utils/lawyerColors";
import { toastError, toastSuccess, toastWarning } from "../../components/ui/toast";
import { buildNewEventPrefill } from "./utils/eventDefaults";
import { parseDatetimeLocal } from "../../functions/date/datetimeLocal";
import {
    defaultSchedule,
    parseScheduleFromCalendarSettings,
    parseVisibleSlotRangeFromSettings,
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

/** FullCalendar all-day end is exclusive — extend inclusive DB end by one local day. */
function toLocalYmd(value) {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0, 10);
    }
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function addLocalDaysYmd(ymd, days) {
    const base = String(ymd || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return base;
    const d = new Date(`${base}T12:00:00`);
    d.setDate(d.getDate() + days);
    return toLocalYmd(d);
}

function normalizeAllDayEndInclusive(startTime, endTime) {
    const start = toLocalYmd(startTime) || String(startTime || "").slice(0, 10);
    let endInclusive = toLocalYmd(endTime) || start;
    try {
        const endLocal = parseDatetimeLocal(endTime)
            || (endTime instanceof Date ? endTime : new Date(endTime));
        if (endLocal && !Number.isNaN(endLocal.getTime())
            && endLocal.getHours() === 0
            && endLocal.getMinutes() === 0
            && endInclusive > start) {
            const pulled = new Date(endLocal);
            pulled.setDate(pulled.getDate() - 1);
            endInclusive = toLocalYmd(pulled) || endInclusive;
        }
    } catch { /* ignore */ }
    if (endInclusive < start) endInclusive = start;
    return { start, endInclusive };
}

function leaveAllDayRange(startTime, endTime) {
    const { start, endInclusive } = normalizeAllDayEndInclusive(startTime, endTime);
    return { start, end: addLocalDaysYmd(endInclusive, 1) };
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

function buildHolidayHintEvent(h, t) {
    const date = String(h?.date || "").slice(0, 10);
    if (!date) return null;
    const title = h?.title || h?.titleEn || t?.("calendar.holidayHintPrefix") || "חג";
    // FullCalendar exclusive end for all-day (local calendar day)
    const end = addLocalDaysYmd(date, 1);
    return {
        id: `holiday-hint-${h.id || date}-${title}`,
        title: `[חג] ${title}`,
        start: date,
        end,
        allDay: true,
        display: "background",
        backgroundColor: holidayColor(),
        borderColor: holidayColor(),
        classNames: ["lw-fcEvent--holiday", "lw-fcEvent--holidayHint"],
        editable: false,
        startEditable: false,
        durationEditable: false,
        extendedProps: { hint: true, holiday: true, ...h },
    };
}

/** Aggregate multi-client RSVP: any accepted → accepted; else any pending → pending; else declined. */
function aggregateInviteStatus(ev) {
    const clients = Array.isArray(ev?.clients) ? ev.clients : null;
    if (clients?.length) {
        const statuses = clients
            .map((c) => c.inviteStatus || c.invite_status)
            .filter((s) => s && s !== "none");
        if (!statuses.length) {
            const legacy = ev?.inviteStatus;
            return legacy && legacy !== "none" ? legacy : null;
        }
        if (statuses.some((s) => s === "accepted")) return "accepted";
        if (statuses.some((s) => s === "pending")) return "pending";
        if (statuses.some((s) => s === "declined")) return "declined";
        return null;
    }
    const legacy = ev?.inviteStatus;
    return legacy && legacy !== "none" ? legacy : null;
}

function clientPhoneTooltip(ev) {
    const parts = [];
    const statusLabel = (s) => {
        if (s === "accepted") return "אישר הגעה ✓";
        if (s === "declined") return "דחה הגעה";
        if (s === "pending") return "ממתין לאישור ⏳";
        return "";
    };
    if (Array.isArray(ev?.clients) && ev.clients.length) {
        ev.clients.forEach((c) => {
            const name = String(c.name || "").trim() || "לקוח";
            const phone = String(c.phone || "").trim();
            const st = statusLabel(c.inviteStatus || c.invite_status);
            const bits = [name];
            if (phone) bits.push(phone);
            if (st) bits.push(st);
            parts.push(bits.join(" · "));
        });
    } else {
        const name = String(ev?.clientName || ev?.clientDisplayName || "").trim();
        const phone = String(ev?.clientPhone || "").trim();
        const st = statusLabel(aggregateInviteStatus(ev) || ev?.inviteStatus);
        const bits = [];
        if (name) bits.push(name);
        if (phone) bits.push(phone);
        if (st) bits.push(st);
        if (bits.length) parts.push(bits.join(" · "));
    }
    if (!parts.length && ev?.leadPhone) {
        const lead = String(ev.leadName || "").trim();
        parts.push(lead ? `${lead} · ${ev.leadPhone}` : String(ev.leadPhone));
    }
    return parts.join("\n");
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

    if (isHoliday) {
        return buildInternalAllDayEvent(ev, {
            labelPrefix: "[חג]",
            color: holidayColor(),
            className: "lw-fcEvent--holiday",
        });
    }

    const typeDefault = getEventTypeDefaultColor(ev?.eventType);
    const hasCustomColor = !isStockEventColor(ev?.color, ev?.eventType);
    const personalInferred = hasCustomColor
        ? String(ev.color).trim().toUpperCase()
        : typeDefault;

    if (ev.allDay) {
        const { start, endInclusive } = normalizeAllDayEndInclusive(ev.startTime, ev.endTime);
        const end = addLocalDaysYmd(endInclusive, 1);
        const color = scope === SCOPE_FIRM
            ? (hasCustomColor ? personalInferred : colorForKey(colorKeyForEvent(ev)))
            : personalInferred;
        const inviteStatus = aggregateInviteStatus(ev);
        const inviteClass =
            inviteStatus === "accepted" ? "lw-fcEvent--inviteAccepted"
                : inviteStatus === "declined" ? "lw-fcEvent--inviteDeclined"
                    : inviteStatus === "pending" ? "lw-fcEvent--invitePending"
                        : null;
        return {
            id: String(ev.id),
            title: ev.title || "",
            start,
            end,
            allDay: true,
            backgroundColor: color,
            borderColor: color,
            textColor: "#FFFFFF",
            classNames: inviteClass ? [inviteClass] : undefined,
            editable: ev?.eventType !== "leave" && ev?.eventType !== "holiday",
            startEditable: ev?.eventType !== "leave" && ev?.eventType !== "holiday",
            durationEditable: false,
            extendedProps: { ...ev, inviteStatus: inviteStatus || ev?.inviteStatus || "none", _phoneTip: clientPhoneTooltip(ev) },
        };
    }

    // Appointments: honor a *custom* stored color when set. Stock / empty colors
    // follow platform type defaults (personal) or lawyer palette (firm).
    const color = scope === SCOPE_FIRM
        ? (hasCustomColor ? personalInferred : colorForKey(colorKeyForEvent(ev)))
        : personalInferred;

    const inviteStatus = aggregateInviteStatus(ev);
    const inviteClass =
        inviteStatus === "accepted" ? "lw-fcEvent--inviteAccepted"
            : inviteStatus === "declined" ? "lw-fcEvent--inviteDeclined"
                : inviteStatus === "pending" ? "lw-fcEvent--invitePending"
                    : null;
    const phoneTip = clientPhoneTooltip(ev);

    return {
        id: String(ev.id),
        title: ev.title || "",
        start: ev.startTime,
        end: ev.endTime,
        allDay: ev.allDay,
        backgroundColor: color,
        borderColor: color,
        textColor: "#FFFFFF",
        classNames: inviteClass ? [inviteClass] : undefined,
        editable: ev?.eventType !== "leave" && ev?.eventType !== "holiday",
        startEditable: ev?.eventType !== "leave" && ev?.eventType !== "holiday",
        durationEditable: ev?.eventType !== "leave" && ev?.eventType !== "holiday" && !ev?.allDay,
        extendedProps: { ...ev, inviteStatus: inviteStatus || ev?.inviteStatus || "none", _phoneTip: phoneTip },
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
    const calendarEnabled = useCalendarModuleEnabled();

    // Feature-flag guard: bounce to main screen if the module is disabled.
    useEffect(() => {
        if (!calendarEnabled) {
            navigate(AdminStackName + MainScreenName, { replace: true });
        }
    }, [navigate, calendarEnabled]);

    const role = _currentRole();
    const canUseFirmView = _isFirmManager(role);

    const calendarRef = useRef(null);
    const fetchRangeRef = useRef({ from: null, to: null });
    const hasAutoOpenedEventRef = useRef(false);
    const fetchEventsRef = useRef(null);

    // ── View / scope / filters ─────────────────────────────────────────────
    const [events, setEvents] = useState([]);
    const [view, setView] = useState(isSmallScreen ? "timeGridDay" : "timeGridWeek");
    const [scope, setScope] = useState(SCOPE_MINE);
    const [filters, setFilters] = useState({
        lawyer_id: null,
        client_id: null,
        case_id: null,
        event_type: EVENT_TYPE_ALL, // 'all' is UI-only; we don't send it to the API
    });
    const [filtersPanelOpen, setFiltersPanelOpen] = useState(!isSmallScreen);
    const [calendarExpanded, setCalendarExpanded] = useState(false);

    // ── Working-hours config (per weekday) ─────────────────────────────────
    const [workingSchedule, setWorkingSchedule] = useState(() => defaultSchedule());
    const [visibleSlotRange, setVisibleSlotRange] = useState(() => getSlotRange());

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

    // OAuth / save notices → global toasts
    // (legacy inline banners removed)

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

    // ── Load firm working hours + per-type default colors ─────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await platformSettingsApi.getAll();
                const cal = res?.data?.settings?.calendar || res?.settings?.calendar || {};
                if (cancelled) return;
                setWorkingSchedule(parseScheduleFromCalendarSettings(cal));
                setVisibleSlotRange(parseVisibleSlotRangeFromSettings(cal));
                try {
                    const raw = cal?.CALENDAR_EVENT_TYPE_COLORS?.effectiveValue;
                    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
                    if (parsed && typeof parsed === "object") {
                        window.__CALENDAR_TYPE_COLORS__ = parsed;
                        // Rebuild colors now that admin defaults are available
                        // (first fetch may have raced ahead of this settings call).
                        setEvents((prev) => prev.map((fc) => {
                            const rawEv = fc?.extendedProps;
                            if (!rawEv || rawEv.hint) {
                                if (rawEv?.holiday || fc?.classNames?.includes?.("lw-fcEvent--holidayHint")) {
                                    return {
                                        ...fc,
                                        backgroundColor: holidayColor(),
                                        borderColor: holidayColor(),
                                    };
                                }
                                return fc;
                            }
                            return buildFullCalendarEvent(rawEv, {
                                scope: apiFilters.scope || SCOPE_MINE,
                            });
                        }));
                    }
                } catch { /* ignore */ }
            } catch { /* keep defaults */ }
        })();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once on mount; scope rebuild happens via fetch
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
            const [res, holidaysRes] = await Promise.all([
                calendarApi.listEvents({ from, to, limit: 500, ...apiFilters }),
                calendarApi.listHolidays({
                    from: String(from).slice(0, 10),
                    to: String(to).slice(0, 10),
                }).catch(() => null),
            ]);
            const list = res?.data?.events || [];
            const scopeKey = apiFilters.scope || SCOPE_MINE;
            const built = list.map((ev) => buildFullCalendarEvent(ev, { scope: scopeKey }));
            const holidayHints = (holidaysRes?.data?.holidays || [])
                .map((h) => buildHolidayHintEvent(h))
                .filter(Boolean);
            setEvents([...holidayHints, ...built]);
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
            toastSuccess("Google Calendar חובר בהצלחה ✓");
            (async () => {
                try {
                    await calendarApi.syncGoogleEvents();
                } catch { /* status toast still shown */ }
                fetchEventsRef.current?.(null);
            })();
        }
        if (googleError) {
            toastError("חיבור Google Calendar נכשל. נסה שוב.");
        }
        if (outlookConnected) {
            toastSuccess("Outlook Calendar חובר בהצלחה ✓");
            (async () => {
                try {
                    await calendarApi.syncOutlookEvents();
                } catch { /* status toast still shown */ }
                fetchEventsRef.current?.(null);
            })();
        }
        if (outlookError) {
            toastError("חיבור Outlook Calendar נכשל. נסה שוב.");
        }
    }, [searchParams, setSearchParams]);

    // ── FullCalendar config ────────────────────────────────────────────────
    // All weekdays stay visible. Working hours only shade non-open times
    // (visual guidance) — they do not hide days or block creating events.
    const businessHours = useMemo(() => getBusinessHours(workingSchedule), [workingSchedule]);

    const slotRange = visibleSlotRange;

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
            toastWarning(t("calendar.savedFirmOnlyNotice"));
        }
    }, [upsertLocally, fetchEvents, closePopup, t]);

    // Ref avoids TDZ / "Cannot access before initialization" when the duplicate
    // handler re-opens EventFormModal with itself as onDuplicatePrefill.
    const openDuplicateDraftRef = useRef(null);
    const openDuplicateDraft = useCallback((draft) => {
        closePopup();
        window.setTimeout(() => {
            openPopup(
                <EventFormModal
                    key={_eventFormModalKey(draft)}
                    event={draft}
                    onUpdated={upsertLocally}
                    onSaved={handleEventSaved}
                    onDuplicatePrefill={(next) => openDuplicateDraftRef.current?.(next)}
                    onDeleted={() => closePopup()}
                    onClose={closePopup}
                />
            );
        }, 0);
    }, [openPopup, closePopup, upsertLocally, handleEventSaved]);
    openDuplicateDraftRef.current = openDuplicateDraft;

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
                onDuplicatePrefill={openDuplicateDraft}
                onDeleted={() => closePopup()}
                onClose={closePopup}
            />
        );
    }, [openPopup, closePopup, upsertLocally, handleEventSaved, workingSchedule, openDuplicateDraft]);

    const openEditModal = useCallback((clickInfo) => {
        const ev = clickInfo.event.extendedProps || {};
        // Hebcal holiday hints are display-only background events.
        if (ev.hint) return;
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
                onDuplicatePrefill={openDuplicateDraft}
                onDeleted={(deletedId) => {
                    setEvents((prev) => prev.filter((e) => e.id !== String(deletedId)));
                    closePopup();
                }}
                onClose={closePopup}
            />
        );
    }, [openPopup, closePopup, upsertLocally, handleEventSaved, openDuplicateDraft]);

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
                onDuplicatePrefill={openDuplicateDraft}
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

    const renderEventContent = useCallback((arg) => {
        const ev = arg.event.extendedProps || {};
        if (ev.hint) return true;
        const status = aggregateInviteStatus(ev) || (ev.inviteStatus !== "none" ? ev.inviteStatus : null);
        const multi = Array.isArray(ev.clients) && ev.clients.length > 1;
        const acceptedCount = multi
            ? ev.clients.filter((c) => (c.inviteStatus || c.invite_status) === "accepted").length
            : 0;
        return (
            <div className="lw-fcEventContent">
                {status === "accepted" && (
                    <span className="lw-fcEventRsvpBadge lw-fcEventRsvpBadge--accepted" aria-hidden="true">
                        {multi && acceptedCount > 0 ? `${acceptedCount}` : "✓"}
                    </span>
                )}
                {status === "pending" && (
                    <span className="lw-fcEventRsvpBadge lw-fcEventRsvpBadge--pending" aria-hidden="true" />
                )}
                {status === "declined" && (
                    <span className="lw-fcEventRsvpBadge lw-fcEventRsvpBadge--declined" aria-hidden="true" />
                )}
                {arg.timeText ? (
                    <div className="fc-event-time">{arg.timeText}</div>
                ) : null}
                <div className="fc-event-title">{arg.event.title}</div>
            </div>
        );
    }, []);

    const handleEventDidMount = useCallback((info) => {
        const tip = info.event.extendedProps?._phoneTip;
        if (tip) {
            info.el.setAttribute("title", tip);
        }
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

    if (!calendarEnabled) return null;

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
                    <div
                        className={`lw-calendarScreen__filterRow ${canUseFirmView && scope === SCOPE_FIRM ? "lw-calendarScreen__filterRow--three" : "lw-calendarScreen__filterRow--two"}`}
                    >
                        {canUseFirmView && scope === SCOPE_FIRM && (
                            <div className="lw-calendarScreen__filterGroup">
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
                            </div>
                        )}

                        <div className="lw-calendarScreen__filterGroup">
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
                        </div>

                        <div className="lw-calendarScreen__filterGroup">
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
                        </div>
                    </div>
                )}

                {/* ── Layout: sidebar + calendar ── */}
                <SimpleContainer className={`lw-calendarScreen__layout ${filtersPanelOpen && !calendarExpanded ? "is-sidebarOpen" : "is-sidebarClosed"}${calendarExpanded ? " is-calendarExpanded" : ""}`}>

                    {/* ── Sidebar filter panel ── */}
                    {filtersPanelOpen && !calendarExpanded && (
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

                        {/* Calendar */}
                        <SimpleCard className={`lw-calendarScreen__calendarCard${calendarExpanded ? " is-expanded" : ""}`}>
                            <SimpleContainer className="lw-calendarScreen__calendarToolbar">
                                <SecondaryButton
                                    onPress={() => setCalendarExpanded((v) => !v)}
                                    aria-label={calendarExpanded ? t("calendar.collapseCalendarAria") : t("calendar.expandCalendarAria")}
                                >
                                    {calendarExpanded ? t("calendar.collapseCalendar") : t("calendar.expandCalendar")}
                                </SecondaryButton>
                            </SimpleContainer>
                            <FullCalendar
                                ref={calendarRef}
                                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                                initialView={view}
                                locale={fullCalendarLocaleFor(i18n.language)}
                                direction={String(i18n.language || "he").startsWith("en") ? "ltr" : "rtl"}
                                headerToolbar={{
                                    start: "prev,next today",
                                    center: "title",
                                    end: "dayGridMonth,timeGridWeek,timeGridDay",
                                }}
                                buttonText={{
                                    today: t("calendar.today", { defaultValue: "היום" }),
                                    month: t("calendar.monthView"),
                                    week: t("calendar.weekView"),
                                    day: t("calendar.dayView"),
                                }}
                                slotEventOverlap={false}
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
                                eventContent={renderEventContent}
                                eventDidMount={handleEventDidMount}
                                editable
                                eventStartEditable
                                eventDurationEditable
                                eventDrop={async (info) => {
                                    const id = parseInt(info.event.id, 10);
                                    if (!Number.isFinite(id)) {
                                        info.revert();
                                        return;
                                    }
                                    try {
                                        const isAllDay = !!info.event.allDay;
                                        let startIso = info.event.start?.toISOString();
                                        let endIso = (info.event.end || info.event.start)?.toISOString();
                                        if (isAllDay && info.event.start) {
                                            const { start, endInclusive } = normalizeAllDayEndInclusive(
                                                info.event.start,
                                                info.event.end || info.event.start
                                            );
                                            startIso = new Date(`${start}T00:00:00`).toISOString();
                                            endIso = new Date(`${endInclusive}T23:59:00`).toISOString();
                                        }
                                        const res = await calendarApi.updateEvent(id, {
                                            start_time: startIso,
                                            end_time: endIso,
                                            all_day: isAllDay,
                                        });
                                        if (!res?.success) {
                                            info.revert();
                                            toastError(res?.data?.message || res?.message || t("calendar.googleSyncError"));
                                            return;
                                        }
                                        fetchEvents();
                                    } catch (err) {
                                        info.revert();
                                        toastError(err?.response?.data?.message || t("calendar.googleSyncError"));
                                    }
                                }}
                                eventResize={async (info) => {
                                    const id = parseInt(info.event.id, 10);
                                    if (!Number.isFinite(id)) {
                                        info.revert();
                                        return;
                                    }
                                    const patchLocalEvent = () => {
                                        const startIso = info.event.start?.toISOString?.();
                                        const endIso = (info.event.end || info.event.start)?.toISOString?.();
                                        if (!startIso) return;
                                        setEvents((prev) => prev.map((fcEv) => {
                                            if (String(fcEv.id) !== String(id)) return fcEv;
                                            const base = fcEv.extendedProps || {};
                                            return buildFullCalendarEvent(
                                                {
                                                    ...base,
                                                    startTime: startIso,
                                                    endTime: endIso || startIso,
                                                    allDay: !!info.event.allDay,
                                                },
                                                { scope: apiFilters.scope || SCOPE_MINE }
                                            );
                                        }));
                                    };
                                    try {
                                        const isAllDay = !!info.event.allDay;
                                        let startIso = info.event.start?.toISOString();
                                        let endIso = (info.event.end || info.event.start)?.toISOString();
                                        if (isAllDay && info.event.start) {
                                            const { start, endInclusive } = normalizeAllDayEndInclusive(
                                                info.event.start,
                                                info.event.end || info.event.start
                                            );
                                            startIso = new Date(`${start}T00:00:00`).toISOString();
                                            endIso = new Date(`${endInclusive}T23:59:00`).toISOString();
                                        }
                                        patchLocalEvent();
                                        const res = await calendarApi.updateEvent(id, {
                                            start_time: startIso,
                                            end_time: endIso,
                                            all_day: isAllDay,
                                        });
                                        if (!res?.success) {
                                            info.revert();
                                            toastError(res?.data?.message || res?.message || t("calendar.googleSyncError"));
                                            return;
                                        }
                                        fetchEvents();
                                    } catch (err) {
                                        info.revert();
                                        toastError(err?.response?.data?.message || t("calendar.googleSyncError"));
                                    }
                                }}
                                datesSet={(arg) => {
                                    if (arg?.view?.type) setView(arg.view.type);
                                    fetchEvents(arg);
                                }}
                                longPressDelay={350}
                                selectLongPressDelay={350}
                                eventLongPressDelay={0}
                                height={calendarExpanded ? "auto" : (isSmallScreen ? "auto" : 780)}
                                slotDuration="00:30:00"
                                expandRows
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
