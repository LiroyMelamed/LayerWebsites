import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SimpleTextArea from "../../../components/simpleComponents/SimpleTextArea";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SimpleButton from "../../../components/simpleComponents/SimpleButton";
import SearchInput from "../../../components/specializedComponents/containers/SearchInput";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import { Text12, Text14, Text24, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";
import calendarApi from "../../../api/calendarApi";
import platformSettingsApi from "../../../api/platformSettingsApi";
import remindersApi from "../../../api/remindersApi";
import { buildReminderBodyPreview } from "../../../functions/reminders/buildReminderBodyPreview";
import { getFirmName } from "../../../services/firmSettings";
import ChooseButton from "../../../components/styledComponents/buttons/ChooseButton";
import {
    parseAllowedOptionsFromSettings,
    parseAllowedChannelsFromSettings,
    presetsForAllowedMinutes,
    channelsForEventType,
    normalizeSelectedOffsets,
    normalizeSelectedChannels,
    normalizeChannelsForEventType,
    parseStoredChannels,
    parseOffsetsList,
    hasAnyReminderChannel,
    defaultReminderOffsets,
    defaultReminderChannels,
    defaultReminderTargets,
    parseReminderTargets,
} from "../utils/eventReminders";
import { customersApi } from "../../../api/customersApi";
import { adminApi } from "../../../api/adminApi";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import CaseFullView from "../../../components/styledComponents/cases/CaseFullView";
import { EVENT_COLOR_PRESETS, getEventTypeDefaultColor, isStockEventColor } from "../utils/lawyerColors";
import CalendarSmsTemplateEditor from "./CalendarSmsTemplateEditor";
import "./EventFormModal.scss";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NAVY = "#2A4365";
const AMBER_TEXT = "#744210";
const DEFAULT_ALLOWED_MINUTES = [15, 30, 60, 120, 1440, 2880, 10080];

const DEFAULT_CLIENT_REMINDER_SMS =
    "שלום {{recipientName}},\n"
    + "זוהי תזכורת לפגישה שנקבעה עבורך ב{{firmName}}\n"
    + "בתאריך {{date}} בשעה {{time}}.\n"
    + "כתובתנו הינה {{address}}\n"
    + "להוראות הגעה בוויז {{wazeUrl}}\n"
    + "לבירור או שינוי נא להתקשר ל {{firmPhone}}\n"
    + "מידע נוסף ניתן למצוא באתר שלנו\n"
    + "{{websiteUrl}}";

const DEFAULT_INVITE_SMS =
    "שלום {{recipientName}}, נקבעה לך פגישה, בתאריך {{date}} בשעה {{time}},\n"
    + "כתובתנו היא {{address}}. בברכה, {{firmName}},\n"
    + "לאישור הגעה, אנא לחץ/י על הקישור {{rsvpUrl}}\n"
    + "להוראות הגעה בוויז: {{wazeUrl}}\n"
    + "לבירור או שינוי נא להתקשר ל {{firmPhone}}";

const INTAKE_EXISTING = "existing";
const INTAKE_LEAD = "lead";

const EVENT_TYPE_APPT = "appointment";
const EVENT_TYPE_LEAVE = "leave";
const EVENT_TYPE_HEARING = "hearing";
const EVENT_TYPE_REMINDER = "reminder";
const EVENT_TYPE_HOLIDAY = "holiday";

function resolveFormColor(event, eventType) {
    const type = eventType || event?.eventType || EVENT_TYPE_APPT;
    const typeDefault = getEventTypeDefaultColor(type);
    if (isStockEventColor(event?.color, type)) return typeDefault;
    return String(event.color).trim().toUpperCase();
}

const INTERNAL_SCOPED_EVENT_TYPES = [
    EVENT_TYPE_LEAVE,
    EVENT_TYPE_REMINDER,
    EVENT_TYPE_HOLIDAY,
];

function isInternalScopedEventType(type) {
    return INTERNAL_SCOPED_EVENT_TYPES.includes(type);
}

function isReminderCapableEventType(type) {
    return type === EVENT_TYPE_APPT || type === EVENT_TYPE_HEARING || type === EVENT_TYPE_REMINDER;
}

function customerDisplayName(item) {
    return String(item?.Name ?? item?.name ?? "").trim();
}

function customerUserId(item) {
    return item?.UserId ?? item?.userid ?? item?.id ?? null;
}

function customerPhone(item) {
    return String(item?.PhoneNumber ?? item?.phonenumber ?? item?.Phone ?? item?.phone ?? "").trim();
}

function clientChipLabel(client) {
    const name = String(client?.name || "").trim();
    const phone = String(client?.phone || "").trim();
    if (name && phone) return `${name} · ${phone}`;
    return name || phone || "";
}

function _initialClients(event) {
    if (Array.isArray(event?.clients) && event.clients.length) {
        return event.clients
            .map((c) => ({
                userId: c.userId ?? c.user_id ?? null,
                name: c.name || c.clientName || "",
                phone: c.phone || c.PhoneNumber || c.phonenumber || "",
            }))
            .filter((c) => c.userId != null);
    }
    if (event?.clientUserId) {
        return [{
            userId: event.clientUserId,
            name: event.clientName || event.clientDisplayName || "",
            phone: event.clientPhone || "",
        }];
    }
    return [];
}

function _resolveSplitReminderOffsets(event, isEdit, isCreateCapable) {
    const legacy = parseOffsetsList(event?.reminderOffsets);
    const lawyerRaw = event?.lawyerReminderOffsets ?? event?.lawyer_reminder_offsets;
    const clientRaw = event?.clientReminderOffsets ?? event?.client_reminder_offsets;
    const hasSplit = lawyerRaw != null || clientRaw != null;

    if (isEdit) {
        return {
            lawyerReminderOffsets: hasSplit
                ? parseOffsetsList(lawyerRaw ?? legacy)
                : legacy,
            clientReminderOffsets: hasSplit
                ? parseOffsetsList(clientRaw ?? legacy)
                : legacy,
        };
    }

    if (isCreateCapable || isReminderCapableEventType(event?.eventType)) {
        const defaults = defaultReminderOffsets(DEFAULT_ALLOWED_MINUTES);
        return {
            lawyerReminderOffsets: defaults,
            clientReminderOffsets: defaults,
        };
    }

    return {
        lawyerReminderOffsets: parseOffsetsList(lawyerRaw ?? legacy),
        clientReminderOffsets: parseOffsetsList(clientRaw ?? legacy),
    };
}

// Placeholders auto-filled by the backend / system — never asked from the user.
const REMINDER_AUTO_FILLED = new Set(["client_name", "firm_name", "subject"]);

const REMINDER_VAR_LABELS = {
    date: "תאריך",
    body: "תוכן ההודעה",
    case_title: "שם התיק",
    document_name: "שם המסמך",
    amount: "סכום",
    content_1: "תוכן 1",
    content_2: "תוכן 2",
    content_3: "תוכן 3",
};

/** Extract [[placeholder]] names from a reminder template's subject + body. */
function _extractReminderPlaceholders(template) {
    if (!template) return [];
    const raw = `${template.subject || ""} ${template.bodyHtml || template.body || ""}`;
    const matches = raw.match(/\[\[([^\]]+)\]\]/g) || [];
    const keys = [...new Set(matches.map((m) => m.slice(2, -2)))];
    return keys.filter((k) => !REMINDER_AUTO_FILLED.has(k));
}

function isLeaveOrHolidayEventType(type) {
    return type === EVENT_TYPE_LEAVE || type === EVENT_TYPE_HOLIDAY;
}

const EVENT_TYPE_OPTIONS = [
    { value: EVENT_TYPE_APPT, labelKey: "calendar.eventTypeAppointmentSingular" },
    { value: EVENT_TYPE_LEAVE, labelKey: "calendar.eventTypeLeaveSingular" },
    { value: EVENT_TYPE_HEARING, labelKey: "calendar.type_hearing" },
    { value: EVENT_TYPE_REMINDER, labelKey: "calendar.type_reminder" },
    { value: EVENT_TYPE_HOLIDAY, labelKey: "calendar.eventTypeHolidaySingular" },
];

/** ISO/Date → "YYYY-MM-DDTHH:MM" for <input type="datetime-local">. */
function toDatetimeLocal(val) {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d)) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _shallowEqualConflictKey(a, b) {
    return a?.start === b?.start
        && a?.end === b?.end
        && a?.lawyers === b?.lawyers
        && a?.exclude === b?.exclude;
}

function _currentUserIdFromToken() {
    try {
        const token = localStorage.getItem("token");
        if (!token) return null;
        const payload = JSON.parse(atob(token.split(".")[1]));
        const id = payload?.userid ?? payload?.UserId;
        return id != null ? Number(id) : null;
    } catch {
        return null;
    }
}

/** Creator tagged other lawyers but not themselves — visible in firm view only. */
function _creatorScheduledForOthersOnly(saved, currentUserId) {
    if (!currentUserId || !saved) return false;
    const eventType = saved.eventType || saved.event_type;
    if (isInternalScopedEventType(eventType)) return false;
    const ownerId = saved.ownerId ?? saved.owner_id;
    if (Number(ownerId) !== Number(currentUserId)) return false;

    const managerIds = new Set();
    (saved.managers || []).forEach((m) => {
        if (m?.userId != null) managerIds.add(Number(m.userId));
    });
    if (saved.managerUserId != null) managerIds.add(Number(saved.managerUserId));
    if (!managerIds.size) return false;
    return !managerIds.has(Number(currentUserId));
}

function _initialManagers(event) {
    if (Array.isArray(event?.managers) && event.managers.length) {
        return event.managers.map((m) => ({
            userId: m.userId,
            name: m.name || "",
        }));
    }
    if (event?.managerUserId) {
        return [{ userId: event.managerUserId, name: event?.managerName || "" }];
    }
    return [];
}

/** Decide initial intake mode for a given event. Lead data wins; otherwise existing. */
function _initialIntakeMode(event) {
    if (!event) return INTAKE_EXISTING;
    const clients = _initialClients(event);
    if (clients.length || event.clientUserId) return INTAKE_EXISTING;
    if (event.leadName || event.leadPhone || event.leadEmail) return INTAKE_LEAD;
    return INTAKE_EXISTING;
}

/** Build fresh form state from an event prop (create prefill or edit row). */
function _formStateFromEvent(event) {
    const isEdit = event?.id != null;
    const isCreateCapable =
        !isEdit &&
        (event?.eventType === EVENT_TYPE_APPT ||
            event?.eventType === EVENT_TYPE_HEARING ||
            !event?.eventType);
    const clients = _initialClients(event);
    const splitReminders = _resolveSplitReminderOffsets(event, isEdit, isCreateCapable);

    return {
        eventType: event?.eventType || EVENT_TYPE_APPT,
        title: event?.title || "",
        description: event?.description || "",
        location: event?.location || "",
        startTime: toDatetimeLocal(event?.startTime) || "",
        endTime: toDatetimeLocal(event?.endTime) || "",
        allDay: event?.allDay || false,
        color: resolveFormColor(event, event?.eventType || EVENT_TYPE_APPT),
        clients,
        clientSearch: "",
        clientName: clients[0]?.name || event?.clientName || "",
        clientUserId: clients[0]?.userId || event?.clientUserId || null,
        managerName: event?.managerName || "",
        managerUserId: event?.managerUserId || null,
        caseId: event?.caseId || null,
        caseName: event?.caseName || "",
        intakeMode: _initialIntakeMode(event),
        leadName: event?.leadName || "",
        leadPhone: event?.leadPhone || "",
        leadEmail: event?.leadEmail || "",
        leadCaseName: event?.leadCaseName || "",
        lawyerReminderOffsets: splitReminders.lawyerReminderOffsets,
        clientReminderOffsets: splitReminders.clientReminderOffsets,
        reminderChannels: isEdit
            ? parseStoredChannels(event?.reminderChannels)
            : (isCreateCapable || isReminderCapableEventType(event?.eventType)
                ? defaultReminderChannels()
                : parseStoredChannels(event?.reminderChannels)),
        reminderTargets: isEdit
            ? parseReminderTargets(event?.reminderTargets)
            : defaultReminderTargets(),
        inviteStatus: event?.inviteStatus || "none",
    };
}

/** Props:
 *  - event      : existing event object (edit mode) OR a slot prefill (create mode).
 *                 Edit mode is detected by event?.id != null.
 *  - onUpdated  : (savedEventRow) => void — refresh calendar without closing modal
 *  - onSaved    : (savedEventRow) → void
 *  - onDeleted  : (deletedEventId) → void
 *  - onClose    : () → void
 */
export default function EventFormModal({ event, onUpdated, onSaved, onDeleted, onClose }) {
    const { t } = useTranslation();
    const isEdit = event?.id != null;

    // ─── Core form state ──────────────────────────────────────────────────
    const [eventType, setEventType] = useState(event?.eventType || EVENT_TYPE_APPT);
    const [title, setTitle] = useState(event?.title || "");
    const [description, setDescription] = useState(event?.description || "");
    const [location, setLocation] = useState(event?.location || "");
    const [startTime, setStartTime] = useState(toDatetimeLocal(event?.startTime) || "");
    const [endTime, setEndTime] = useState(toDatetimeLocal(event?.endTime) || "");
    const [allDay, setAllDay] = useState(event?.allDay || false);
    const [color, setColor] = useState(() => resolveFormColor(event, event?.eventType || EVENT_TYPE_APPT));
    const colorTouchedRef = useRef(!isStockEventColor(event?.color, event?.eventType || EVENT_TYPE_APPT));

    // Existing-client / manager fields
    const [clients, setClients] = useState(() => _initialClients(event));
    const [clientSearch, setClientSearch] = useState("");
    // Reminder-type search field + linked user (single recipient for email reminders)
    const [clientName, setClientName] = useState(
        () => _initialClients(event)[0]?.name || event?.clientName || ""
    );
    const [clientUserId, setClientUserId] = useState(
        () => _initialClients(event)[0]?.userId || event?.clientUserId || null
    );
    const [managers, setManagers] = useState(() => _initialManagers(event));
    const [managerSearch, setManagerSearch] = useState("");
    const [caseId, setCaseId] = useState(event?.caseId || null);
    const [caseName, setCaseName] = useState(event?.caseName || "");

    // Lead-mode fields
    const [intakeMode, setIntakeMode] = useState(_initialIntakeMode(event));
    const [leadName, setLeadName] = useState(event?.leadName || "");
    const [leadPhone, setLeadPhone] = useState(event?.leadPhone || "");
    const [leadEmail, setLeadEmail] = useState(event?.leadEmail || "");

    // Async lifecycle state
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [duplicating, setDuplicating] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [converting, setConverting] = useState(false);
    const [linkingCase, setLinkingCase] = useState(false);
    const [optionalConvertCaseName, setOptionalConvertCaseName] = useState(event?.leadCaseName || "");
    const [lawyerReminderOffsets, setLawyerReminderOffsets] = useState(() => {
        const s = _formStateFromEvent(event);
        return s.lawyerReminderOffsets;
    });
    const [clientReminderOffsets, setClientReminderOffsets] = useState(() => {
        const s = _formStateFromEvent(event);
        return s.clientReminderOffsets;
    });
    const [reminderChannels, setReminderChannels] = useState(() => {
        const s = _formStateFromEvent(event);
        return s.reminderChannels;
    });
    const [reminderTargets, setReminderTargets] = useState(() => {
        const s = _formStateFromEvent(event);
        return s.reminderTargets;
    });
    const [clientReminderSms, setClientReminderSms] = useState(
        () => String(event?.clientReminderSms || "").trim() || DEFAULT_CLIENT_REMINDER_SMS
    );
    const [inviteSms, setInviteSms] = useState(
        () => String(event?.inviteSms || "").trim() || DEFAULT_INVITE_SMS
    );
    const [smsFirmPhone, setSmsFirmPhone] = useState("");
    const [smsFirmWazeUrl, setSmsFirmWazeUrl] = useState("");
    const [smsFirmMapsUrl, setSmsFirmMapsUrl] = useState("");
    const [smsOfficeAddress, setSmsOfficeAddress] = useState("");
    const [allowedReminderMinutes, setAllowedReminderMinutes] = useState(DEFAULT_ALLOWED_MINUTES);
    const [allowedReminderChannelKeys, setAllowedReminderChannelKeys] = useState(["push", "sms", "email"]);
    const [caseFormDraft, setCaseFormDraft] = useState(null);
    const linkedClientLabelRef = useRef(
        _initialClients(event)[0]?.name || event?.clientName || ""
    );

    // ─── Reminder-event fields (event_type === 'reminder') ────────────────
    const [reminderClientName, setReminderClientName] = useState("");
    const [reminderToEmail, setReminderToEmail] = useState("");
    const [reminderSubject, setReminderSubject] = useState("");
    const [reminderTemplateKey, setReminderTemplateKey] = useState("GENERAL");
    const [reminderTemplateData, setReminderTemplateData] = useState({});
    const [reminderTemplates, setReminderTemplates] = useState([]);
    const [loadingReminderTemplates, setLoadingReminderTemplates] = useState(false);

    // Conflict-check state
    const [conflictState, setConflictState] = useState({
        loading: false,
        hasConflict: false,
        hasLeaveConflict: false,
    });
    const lastConflictKeyRef = useRef(null);
    const eventTypeRef = useRef(eventType);
    eventTypeRef.current = eventType;

    // Cases-for-client state
    const [clientCases, setClientCases] = useState([]);
    const [loadingClientCases, setLoadingClientCases] = useState(false);

    // ─── Search hooks (existing client + manager) ─────────────────────────
    const {
        result: customers,
        isPerforming: isSearchingCustomers,
        performRequest: searchCustomers,
    } = useAutoHttpRequest(customersApi.getCustomersByName, {
        onFailure: () => { setError((prev) => prev || "שגיאה בחיפוש לקוחות"); },
    });

    const {
        result: admins,
        isPerforming: isSearchingAdmins,
        performRequest: searchAdmins,
    } = useAutoHttpRequest(adminApi.getAdminByName, { onFailure: () => { } });

    // ─── Effect: reset entire form when a different event is opened in the popup ─
    const eventIdentity = event?.id ?? `${event?.startTime || ""}|${event?.endTime || ""}|new`;
    useEffect(() => {
        const s = _formStateFromEvent(event);
        setEventType(s.eventType);
        setTitle(s.title);
        setDescription(s.description);
        setLocation(s.location);
        setStartTime(s.startTime);
        setEndTime(s.endTime);
        setAllDay(s.allDay);
        setColor(s.color);
        colorTouchedRef.current = !isStockEventColor(event?.color, s.eventType);
        setClients(s.clients);
        setClientSearch("");
        setClientName(s.clientName);
        setClientUserId(s.clientUserId);
        setManagers(_initialManagers(event));
        setManagerSearch("");
        setCaseId(s.caseId);
        setCaseName(s.caseName);
        setIntakeMode(s.intakeMode);
        setLeadName(s.leadName);
        setLeadPhone(s.leadPhone);
        setLeadEmail(s.leadEmail);
        setOptionalConvertCaseName(s.leadCaseName || "");
        setLawyerReminderOffsets(s.lawyerReminderOffsets);
        setClientReminderOffsets(s.clientReminderOffsets);
        setReminderChannels(s.reminderChannels);
        setReminderTargets(s.reminderTargets);
        setClientReminderSms(String(event?.clientReminderSms || "").trim() || DEFAULT_CLIENT_REMINDER_SMS);
        setInviteSms(String(event?.inviteSms || "").trim() || DEFAULT_INVITE_SMS);
        linkedClientLabelRef.current = s.clients[0]?.name || s.clientName || "";
        setCaseFormDraft(null);
        setClientCases([]);
        setError("");
        setSuccessMsg("");
        setConfirmDelete(false);
        setDuplicating(false);
        lastConflictKeyRef.current = null;
        // Reset reminder-event fields; the dedicated load-reminder effect prefills them on edit.
        setReminderClientName(event?.clientName || event?.leadName || "");
        setReminderToEmail(event?.leadEmail || "");
        setReminderSubject("");
        setReminderTemplateKey("GENERAL");
        setReminderTemplateData({});
    }, [eventIdentity, event]);

    // ─── Effect: load reminder email templates once ───────────────────────
    useEffect(() => {
        let cancelled = false;
        setLoadingReminderTemplates(true);
        (async () => {
            try {
                const res = await remindersApi.getTemplates();
                const list = res?.data?.templates || res?.templates || [];
                if (!cancelled) setReminderTemplates(Array.isArray(list) ? list : []);
            } catch {
                if (!cancelled) setReminderTemplates([]);
            } finally {
                if (!cancelled) setLoadingReminderTemplates(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // ─── Effect: prefill reminder fields when editing a linked reminder event ─
    useEffect(() => {
        const linkedId = event?.linkedReminderId;
        if (!linkedId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const res = await remindersApi.getReminder(linkedId);
                const reminder = res?.data?.reminder || res?.reminder;
                if (!reminder || cancelled) return;
                setReminderClientName(reminder.client_name || "");
                setReminderToEmail(reminder.to_email || "");
                setReminderSubject(reminder.subject || "");
                setReminderTemplateKey(reminder.template_key || "GENERAL");
                setReminderTemplateData(
                    reminder.template_data && typeof reminder.template_data === "object"
                        ? reminder.template_data
                        : {}
                );
            } catch {
                /* keep defaults if the reminder no longer exists */
            }
        })();
        return () => { cancelled = true; };
    }, [event?.linkedReminderId]);

    // ─── Effect: snap allDay times to full-day window ─────────────────────
    useEffect(() => {
        if (allDay) {
            if (startTime) setStartTime(startTime.slice(0, 10) + "T00:00");
            if (endTime) setEndTime(endTime.slice(0, 10) + "T23:59");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allDay]);

    // ─── Effect: clear lead fields when switching to existing-client mode ─
    useEffect(() => {
        if (intakeMode === INTAKE_EXISTING) {
            setLeadName("");
            setLeadPhone("");
            setLeadEmail("");
        } else {
            // Switching to lead mode → strip any prior client/case wiring
            setClients([]);
            setClientSearch("");
            setClientName("");
            setClientUserId(null);
            setCaseId(null);
            setCaseName("");
        }
    }, [intakeMode]);

    // ─── Effect: clear client/case/lead when switching to internal-scoped types ─
    useEffect(() => {
        if (!isInternalScopedEventType(eventType)) return;
        // Reminder type keeps its own client link fields — only leave/holiday wipe them.
        if (isLeaveOrHolidayEventType(eventType)) {
            setIntakeMode(INTAKE_EXISTING);
            setClients([]);
            setClientSearch("");
            setClientName("");
            setClientUserId(null);
            setCaseId(null);
            setCaseName("");
            setLeadName("");
            setLeadPhone("");
            setLeadEmail("");
            setLawyerReminderOffsets([]);
            setClientReminderOffsets([]);
            setReminderChannels({ push: false, sms: false, email: false });
            return;
        }
        // reminder (תזכורת כללית): no meeting attendees
        setManagers([]);
        setManagerSearch("");
    }, [eventType]);

    // ─── Effect: apply yellow defaults when switching into a remindable type on create ─
    const prevEventTypeRef = useRef(eventType);
    useEffect(() => {
        const prevType = prevEventTypeRef.current;
        prevEventTypeRef.current = eventType;
        if (isEdit) return;
        if (prevType === eventType) return;
        // Follow platform type-default color unless the lawyer picked a custom swatch.
        if (!colorTouchedRef.current) {
            setColor(getEventTypeDefaultColor(eventType));
        }
        if (isLeaveOrHolidayEventType(eventType)) {
            setAllDay(true);
        }
        // Switch SMS defaults by event type on create (unless the lawyer already customized).
        if (!isEdit) {
            const tpl = (typeof window !== "undefined" && window.__CALENDAR_SMS_TEMPLATES__) || {};
            if (!String(event?.clientReminderSms || "").trim()) {
                const nextSms = eventType === EVENT_TYPE_HEARING
                    ? (tpl.hearingReminder || tpl.appointmentReminder)
                    : tpl.appointmentReminder;
                if (nextSms) setClientReminderSms(nextSms);
            }
            if (!String(event?.inviteSms || "").trim()) {
                const nextInvite = eventType === EVENT_TYPE_HEARING
                    ? (tpl.hearingInvite || tpl.appointmentInvite)
                    : tpl.appointmentInvite;
                if (nextInvite) setInviteSms(nextInvite);
            }
        }
        if (!isReminderCapableEventType(eventType)) return;
        // Coming from leave/holiday (or empty offsets): seed yellow defaults.
        setLawyerReminderOffsets((prev) => (
            prev?.length
                ? normalizeSelectedOffsets(prev, allowedReminderMinutes)
                : defaultReminderOffsets(allowedReminderMinutes)
        ));
        setClientReminderOffsets((prev) => (
            prev?.length
                ? normalizeSelectedOffsets(prev, allowedReminderMinutes)
                : defaultReminderOffsets(allowedReminderMinutes)
        ));
        setReminderChannels((prev) => normalizeChannelsForEventType(
            eventType,
            hasAnyReminderChannel(prev) ? prev : defaultReminderChannels(allowedReminderChannelKeys),
            allowedReminderChannelKeys,
        ));
    }, [eventType, isEdit, allowedReminderMinutes, allowedReminderChannelKeys]);

    // ─── Effect: load firm reminder options from platform settings ─────────
    // Channel allowlist comes from calendar.CALENDAR_REMINDER_CHANNELS only.
    // CALENDAR_REMINDER is a per-action lawyer choice, so it is not gated by
    // notification_channel_config (and is hidden from ערוצי התראות).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await platformSettingsApi.getAll();
                const cal = res?.data?.settings?.calendar || res?.settings?.calendar || {};
                const branding = res?.data?.settings?.branding || res?.settings?.branding || {};
                const firm = res?.data?.settings?.firm || res?.settings?.firm || {};
                const templates = res?.data?.settings?.templates || res?.settings?.templates || {};
                const contact = res?.data?.settings?.contact || res?.settings?.contact || {};
                if (cancelled) return;
                setSmsFirmPhone(String(contact?.WHATSAPP_PHONE?.effectiveValue || "").trim());
                setSmsFirmWazeUrl(String(cal?.FIRM_WAZE_URL?.effectiveValue || "").trim());
                setSmsFirmMapsUrl(String(cal?.FIRM_MAPS_URL?.effectiveValue || "").trim());
                const allowed = parseAllowedOptionsFromSettings(cal);
                setAllowedReminderMinutes(allowed);
                const calChannelKeys = parseAllowedChannelsFromSettings(cal);
                if (calChannelKeys) setAllowedReminderChannelKeys(calChannelKeys);
                const office = String(
                    branding?.FIRM_OFFICE_ADDRESS?.effectiveValue ||
                    firm?.FIRM_OFFICE_ADDRESS?.effectiveValue ||
                    cal?.FIRM_OFFICE_ADDRESS?.effectiveValue ||
                    ""
                ).trim();
                setSmsOfficeAddress(office);
                // Prefill location for new events only — Waze/Maps links go to the client message, not admin UI.
                if (office && !isEdit) {
                    setLocation((prev) => (prev && String(prev).trim() ? prev : office));
                }
                const platformClientSms = String(
                    templates?.CALENDAR_CLIENT_REMINDER_SMS?.effectiveValue || ""
                ).trim();
                const platformClientSmsHearing = String(
                    templates?.CALENDAR_CLIENT_REMINDER_SMS_HEARING?.effectiveValue || ""
                ).trim();
                const platformInviteSms = String(
                    templates?.CALENDAR_INVITE_SMS?.effectiveValue || ""
                ).trim();
                const platformInviteSmsHearing = String(
                    templates?.CALENDAR_INVITE_SMS_HEARING?.effectiveValue || ""
                ).trim();
                window.__CALENDAR_SMS_TEMPLATES__ = {
                    appointmentReminder: platformClientSms,
                    hearingReminder: platformClientSmsHearing || platformClientSms,
                    appointmentInvite: platformInviteSms,
                    hearingInvite: platformInviteSmsHearing || platformInviteSms,
                };
                const et = String(eventTypeRef.current || "").toLowerCase();
                const pickReminder = et === "hearing"
                    ? (platformClientSmsHearing || platformClientSms)
                    : platformClientSms;
                const pickInvite = et === "hearing"
                    ? (platformInviteSmsHearing || platformInviteSms)
                    : platformInviteSms;
                if (!String(event?.clientReminderSms || "").trim() && pickReminder) {
                    setClientReminderSms(pickReminder);
                }
                if (!String(event?.inviteSms || "").trim() && pickInvite) {
                    setInviteSms(pickInvite);
                }
                try {
                    const rawColors = cal?.CALENDAR_EVENT_TYPE_COLORS?.effectiveValue;
                    const parsedColors = typeof rawColors === "string" ? JSON.parse(rawColors) : rawColors;
                    if (parsedColors && typeof parsedColors === "object") {
                        window.__CALENDAR_TYPE_COLORS__ = parsedColors;
                    }
                } catch { /* ignore */ }
                // On create, apply platform type-default color once settings are known.
                if (!isEdit && !colorTouchedRef.current) {
                    setColor(getEventTypeDefaultColor(eventTypeRef.current));
                }
                // On create, re-apply defaults against the firm allowlist once settings load.
                if (!isEdit) {
                    setLawyerReminderOffsets((prev) => (prev?.length ? normalizeSelectedOffsets(prev, allowed) : defaultReminderOffsets(allowed)));
                    setClientReminderOffsets((prev) => (prev?.length ? normalizeSelectedOffsets(prev, allowed) : defaultReminderOffsets(allowed)));
                    setReminderChannels((prev) => normalizeChannelsForEventType(
                        eventTypeRef.current,
                        hasAnyReminderChannel(prev) ? prev : defaultReminderChannels(calChannelKeys),
                        calChannelKeys || ["push", "sms", "email"],
                    ));
                }
            } catch { /* keep defaults */ }
        })();
        return () => { cancelled = true; };
    }, [isEdit]);

    const smsPreviewValues = useMemo(() => {
        const start = startTime ? new Date(startTime) : null;
        const validStart = start && !Number.isNaN(start.getTime()) ? start : null;
        const addr = (location || "").trim() || smsOfficeAddress;
        const useFirmLinks = !(location || "").trim() || (smsOfficeAddress && addr === smsOfficeAddress);
        const primaryClientName = (clients[0]?.name || clientName || leadName || "").trim();
        return {
            recipientName: primaryClientName,
            firmName: getFirmName() || "",
            date: validStart
                ? validStart.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })
                : "",
            time: validStart
                ? validStart.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
                : "",
            address: addr,
            wazeUrl: (useFirmLinks && smsFirmWazeUrl) ? smsFirmWazeUrl : "",
            mapsUrl: (useFirmLinks && smsFirmMapsUrl) ? smsFirmMapsUrl : "",
            rsvpUrl: "",
            firmPhone: smsFirmPhone,
            websiteUrl: typeof window !== "undefined" ? window.location.origin : "",
            lawyerName: (managers?.[0]?.name || "").trim(),
            title: (title || "").trim(),
        };
    }, [clients, clientName, leadName, startTime, location, smsFirmPhone, smsFirmWazeUrl, smsFirmMapsUrl, smsOfficeAddress, managers, title]);

    const reminderPresets = presetsForAllowedMinutes(allowedReminderMinutes);
    const reminderChannelOptions = useMemo(
        () => channelsForEventType(eventType, allowedReminderChannelKeys),
        [eventType, allowedReminderChannelKeys]
    );
    // Reminder timing + "למי לשלוח" for appointment, hearing, AND general reminder.
    const showReminderPicker = isReminderCapableEventType(eventType);
    const isReminderEventType = eventType === EVENT_TYPE_REMINDER;
    // Meeting attendees only make sense for appointments/hearings — not תזכורת כללית.
    const showManagersField = !isInternalScopedEventType(eventType);
    const hasClientRecipient = clients.length > 0
        || !!(leadName.trim() || leadPhone.trim() || leadEmail.trim())
        || (intakeMode === INTAKE_LEAD);
    const anyReminderOffsets = lawyerReminderOffsets.length > 0
        || (hasClientRecipient && clientReminderOffsets.length > 0);
    const reminderTemplateItems = useMemo(
        () => reminderTemplates.map((tpl) => ({ value: tpl.key, label: tpl.label })),
        [reminderTemplates]
    );
    const currentReminderTemplate = useMemo(
        () => reminderTemplates.find((tpl) => tpl.key === reminderTemplateKey),
        [reminderTemplates, reminderTemplateKey]
    );
    const reminderExtraVars = useMemo(
        () => _extractReminderPlaceholders(currentReminderTemplate),
        [currentReminderTemplate]
    );
    const reminderBodyPreview = useMemo(() => {
        if (!isReminderEventType || !currentReminderTemplate) return "";
        return buildReminderBodyPreview(currentReminderTemplate, {
            ...reminderTemplateData,
            client_name: reminderClientName.trim() || undefined,
            subject: reminderSubject.trim() || undefined,
            firm_name: getFirmName() || undefined,
        });
    }, [
        isReminderEventType,
        currentReminderTemplate,
        reminderTemplateData,
        reminderClientName,
        reminderSubject,
    ]);

    const handleReminderTemplateChange = (value) => {
        if (!value) return;
        setReminderTemplateKey(value);
        setReminderTemplateData({});
    };

    const handleReminderVarChange = (key, value) => {
        setReminderTemplateData((prev) => ({ ...prev, [key]: value }));
    };

    const toggleLawyerReminderOffset = (minutes) => {
        setLawyerReminderOffsets((prev) => {
            const set = new Set(prev);
            if (set.has(minutes)) set.delete(minutes);
            else set.add(minutes);
            return normalizeSelectedOffsets([...set], allowedReminderMinutes);
        });
    };

    const toggleClientReminderOffset = (minutes) => {
        if (!hasClientRecipient) return;
        setClientReminderOffsets((prev) => {
            const set = new Set(prev);
            if (set.has(minutes)) set.delete(minutes);
            else set.add(minutes);
            return normalizeSelectedOffsets([...set], allowedReminderMinutes);
        });
    };

    const toggleReminderChannel = (key) => {
        setReminderChannels((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            return normalizeChannelsForEventType(eventType, next, allowedReminderChannelKeys);
        });
    };

    const toggleReminderTarget = (key) => {
        setReminderTargets((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    // ─── Effect: live conflict check (debounced) ──────────────────────────
    useEffect(() => {
        if (isInternalScopedEventType(eventType)) {
            setConflictState({ loading: false, hasConflict: false, hasLeaveConflict: false });
            return undefined;
        }
        if (!startTime || !endTime) {
            setConflictState({ loading: false, hasConflict: false, hasLeaveConflict: false });
            return undefined;
        }
        const startISO = (() => { try { return new Date(startTime).toISOString(); } catch { return null; } })();
        const endISO = (() => { try { return new Date(endTime).toISOString(); } catch { return null; } })();
        if (!startISO || !endISO) return undefined;
        if (new Date(endTime) <= new Date(startTime)) {
            setConflictState({ loading: false, hasConflict: false, hasLeaveConflict: false });
            return undefined;
        }

        const lawyerIds = managers.map((m) => m.userId).filter(Boolean);
        const key = {
            start: startISO,
            end: endISO,
            lawyers: lawyerIds.join(",") || "self",
            exclude: isEdit ? event.id : null,
        };
        if (_shallowEqualConflictKey(lastConflictKeyRef.current, key)) return undefined;
        lastConflictKeyRef.current = key;

        let cancelled = false;
        setConflictState((prev) => ({ ...prev, loading: true }));

        const handle = setTimeout(async () => {
            if (isInternalScopedEventType(eventTypeRef.current)) {
                return;
            }
            try {
                const res = await calendarApi.checkConflict({
                    start_time: startISO,
                    end_time: endISO,
                    lawyer_ids: lawyerIds.length ? lawyerIds : undefined,
                    exclude_event_id: isEdit ? event.id : undefined,
                });
                if (cancelled) return;
                const data = res?.data || {};
                setConflictState({
                    loading: false,
                    hasConflict: !!data.hasConflict,
                    hasLeaveConflict: !!data.hasLeaveConflict,
                });
            } catch {
                if (!cancelled) {
                    setConflictState({ loading: false, hasConflict: false, hasLeaveConflict: false });
                }
            }
        }, 400);

        return () => { cancelled = true; clearTimeout(handle); };
    }, [startTime, endTime, managers, eventType, isEdit, event?.id]);

    // ─── Effect: load active cases for the linked client ──────────────────
    const loadClientCases = useCallback(async (cuid) => {
        if (!cuid) { setClientCases([]); return; }
        setLoadingClientCases(true);
        try {
            const res = await calendarApi.getClientCases(cuid);
            const list = res?.data?.cases || res?.data || [];
            setClientCases(Array.isArray(list) ? list : []);
        } catch {
            setClientCases([]);
        } finally {
            setLoadingClientCases(false);
        }
    }, []);

    useEffect(() => {
        const primaryId = clients[0]?.userId || clientUserId;
        if (primaryId) loadClientCases(primaryId);
        else setClientCases([]);
    }, [clients, clientUserId, loadClientCases]);

    // ─── Validation ───────────────────────────────────────────────────────
    const validate = () => {
        if (!title.trim() && !isInternalScopedEventType(eventType)) {
            setError("חובה להזין כותרת לאירוע");
            return false;
        }
        if (!startTime) { setError("חובה להזין שעת התחלה"); return false; }
        if (isReminderEventType) {
            // Reminder events are a single-moment marker — end_time auto-mirrors start_time.
            if (!reminderClientName.trim()) {
                setError(t("reminders.add.error"));
                return false;
            }
            if (!reminderToEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reminderToEmail.trim())) {
                setError(t("reminders.add.error"));
                return false;
            }
        } else {
            if (!endTime) { setError("חובה להזין שעת סיום"); return false; }
            if (new Date(endTime) <= new Date(startTime)) {
                setError("שעת הסיום חייבת להיות אחרי שעת ההתחלה");
                return false;
            }
        }
        if (intakeMode === INTAKE_LEAD && (eventType === EVENT_TYPE_APPT || eventType === EVENT_TYPE_HEARING)) {
            if (!leadName.trim() && !leadPhone.trim() && !leadEmail.trim()) {
                setError("חובה להזין לפחות שם, טלפון או דוא״ל לליד");
                return false;
            }
        }
        const lawyerOff = normalizeSelectedOffsets(lawyerReminderOffsets, allowedReminderMinutes);
        const clientOff = hasClientRecipient
            ? normalizeSelectedOffsets(clientReminderOffsets, allowedReminderMinutes)
            : [];
        if (showReminderPicker && (lawyerOff.length > 0 || clientOff.length > 0) && !hasAnyReminderChannel(reminderChannels)) {
            setError(t("calendar.eventRemindersChannelRequired"));
            return false;
        }
        setError("");
        return true;
    };

    // ─── Save (create / update) ───────────────────────────────────────────
    const handleSave = async () => {
        if (!validate()) return;
        setSaving(true);
        setError("");
        try {
            const isClientScoped = eventType === EVENT_TYPE_APPT || eventType === EVENT_TYPE_HEARING;
            const isLeadMode = intakeMode === INTAKE_LEAD && isClientScoped;
            const forceAllDay = eventType === EVENT_TYPE_LEAVE || eventType === EVENT_TYPE_HOLIDAY;
            const primaryManager = managers[0] || null;
            const reminderTitleFallback = isReminderEventType
                ? (reminderSubject.trim()
                    || currentReminderTemplate?.label
                    || t("calendar.type_reminder"))
                : null;
            // Reminder events are zero-duration in concept, but we give the calendar
            // a 15-minute slot so listEvents window queries (tstzrange '[)') match.
            const toLocalYmd = (val) => {
                const s = String(val || "");
                if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
                const d = new Date(val);
                if (Number.isNaN(d.getTime())) return "";
                const pad = (n) => String(n).padStart(2, "0");
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            };
            let startIso;
            let endIso;
            if (forceAllDay || allDay) {
                const startYmd = toLocalYmd(startTime);
                let endYmd = toLocalYmd(endTime) || startYmd;
                // Guard: if end looks like FC exclusive (next midnight / same as start+1 with 00:00), pull back one day.
                try {
                    const endLocal = new Date(endTime);
                    if (!Number.isNaN(endLocal.getTime())
                        && endLocal.getHours() === 0
                        && endLocal.getMinutes() === 0
                        && endYmd > startYmd) {
                        const pulled = new Date(endLocal);
                        pulled.setDate(pulled.getDate() - 1);
                        endYmd = toLocalYmd(pulled) || endYmd;
                    }
                } catch { /* ignore */ }
                if (endYmd < startYmd) endYmd = startYmd;
                startIso = new Date(`${startYmd}T00:00:00`).toISOString();
                endIso = new Date(`${endYmd}T23:59:00`).toISOString();
            } else if (isReminderEventType) {
                startIso = new Date(startTime).toISOString();
                endIso = new Date(new Date(startTime).getTime() + 15 * 60 * 1000).toISOString();
            } else {
                startIso = new Date(startTime).toISOString();
                endIso = new Date(endTime).toISOString();
            }
            const primaryClient = clients[0] || null;
            const clientUserIds = clients.map((c) => c.userId).filter(Boolean);
            const lawyerOff = showReminderPicker
                ? normalizeSelectedOffsets(lawyerReminderOffsets, allowedReminderMinutes)
                : [];
            const clientOff = showReminderPicker && hasClientRecipient
                ? normalizeSelectedOffsets(clientReminderOffsets, allowedReminderMinutes)
                : [];
            const unionOffsets = [...new Set([...lawyerOff, ...clientOff])]
                .sort((a, b) => b - a);
            const nextReminderTargets = showReminderPicker
                ? {
                    ...reminderTargets,
                    ...(hasClientRecipient ? {} : { client: false }),
                }
                : { client: false, managers: false };
            const payload = {
                title: title.trim() || reminderTitleFallback || (eventType === EVENT_TYPE_LEAVE
                    ? t("calendar.leaveLabel")
                    : eventType === EVENT_TYPE_REMINDER
                        ? t("calendar.type_reminder")
                        : eventType === EVENT_TYPE_HOLIDAY
                            ? t("calendar.holidayLabel")
                            : ""),
                description: description || null,
                location: location || null,
                event_type: eventType,
                // Persist null when using the platform type default so admin color
                // changes keep applying until the lawyer picks a custom swatch.
                color: (() => {
                    const picked = String(color || "").trim().toUpperCase();
                    const typeDefault = getEventTypeDefaultColor(eventType).toUpperCase();
                    if (!colorTouchedRef.current || !picked || picked === typeDefault) return null;
                    if (isStockEventColor(picked, eventType)) return null;
                    return picked;
                })(),
                start_time: startIso,
                end_time: endIso,
                all_day: forceAllDay ? true : allDay,
                manager_user_id: primaryManager?.userId || null,
                manager_name: managers.length
                    ? managers.map((m) => m.name).filter(Boolean).join(", ")
                    : null,
                manager_user_ids: managers.map((m) => m.userId).filter(Boolean),
                reminder_offsets: unionOffsets,
                lawyer_reminder_offsets: lawyerOff,
                client_reminder_offsets: clientOff,
                reminder_channels: showReminderPicker
                    ? normalizeChannelsForEventType(eventType, reminderChannels, allowedReminderChannelKeys)
                    : { push: false, sms: false, email: false },
                reminder_targets: nextReminderTargets,
                client_reminder_sms: showReminderPicker ? clientReminderSms : null,
                invite_sms: showReminderPicker ? inviteSms : null,
            };

            if (isReminderEventType) {
                Object.assign(payload, {
                    reminder_to_email: reminderToEmail.trim(),
                    reminder_client_name: reminderClientName.trim(),
                    reminder_template_key: reminderTemplateKey || "GENERAL",
                    reminder_template_data: reminderTemplateData,
                    reminder_subject: reminderSubject.trim() || null,
                });
            }

            if (isLeadMode) {
                Object.assign(payload, {
                    client_user_id: null,
                    client_user_ids: [],
                    client_name: null,
                    case_id: null,
                    lead_name: leadName.trim() || null,
                    lead_phone: leadPhone.trim() || null,
                    lead_email: leadEmail.trim() || null,
                    lead_case_name: optionalConvertCaseName.trim() || null,
                });
            } else if (isClientScoped) {
                Object.assign(payload, {
                    client_user_id: primaryClient?.userId || null,
                    client_user_ids: clientUserIds,
                    client_name: primaryClient?.name || null,
                    case_id: caseId,
                    lead_name: null,
                    lead_phone: null,
                    lead_email: null,
                    lead_case_name: null,
                });
            } else if (isReminderEventType) {
                // Registered client → client_* only. Unregistered recipient → lead_*
                // (reminderCalendarSync mirrors the same split). Never mix both —
                // the DB CHECK rejects lead + client_user_id together.
                const linkedClientId = clientUserId || null;
                Object.assign(payload, {
                    client_user_id: linkedClientId,
                    client_user_ids: linkedClientId ? [linkedClientId] : [],
                    client_name: linkedClientId
                        ? (reminderClientName.trim() || clientName || null)
                        : null,
                    case_id: null,
                    lead_name: linkedClientId
                        ? null
                        : (reminderClientName.trim() || null),
                    lead_phone: null,
                    lead_email: linkedClientId
                        ? null
                        : (reminderToEmail.trim() || null),
                    lead_case_name: null,
                });
            } else {
                Object.assign(payload, {
                    client_user_id: null,
                    client_user_ids: [],
                    client_name: null,
                    case_id: null,
                    lead_name: null,
                    lead_phone: null,
                    lead_email: null,
                    lead_case_name: null,
                });
            }

            const res = isEdit
                ? await calendarApi.updateEvent(event.id, payload)
                : await calendarApi.createEvent(payload);

            if (res?.success && res?.data?.event) {
                const saved = res.data.event;
                const firmOnlyNotice = _creatorScheduledForOthersOnly(
                    saved,
                    _currentUserIdFromToken()
                );
                const reminderSyncWarning = res?.data?.reminderSyncWarning || null;
                onSaved(saved, { firmOnlyNotice, reminderSyncWarning });
            } else {
                setError(res?.data?.message || res?.message || "שגיאה. נסה שוב.");
            }
        } catch (err) {
            setError(err?.response?.data?.message || "שגיאה. נסה שוב.");
        } finally {
            setSaving(false);
        }
    };

    // ─── Delete ───────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!confirmDelete) { setConfirmDelete(true); return; }
        setDeleting(true);
        try {
            const res = await calendarApi.deleteEvent(event.id);
            if (res?.success) {
                onDeleted(event.id);
            } else {
                setError(res?.data?.message || res?.message || "שגיאה במחיקה.");
                setDeleting(false);
                setConfirmDelete(false);
            }
        } catch (err) {
            setError(err?.response?.data?.message || "שגיאה במחיקה.");
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    // ─── Lead → Client + Case conversion ──────────────────────────────────
    const applyConvertResult = useCallback((ev, newClient, {
        savedLeadName,
        savedLeadPhone,
        savedLeadEmail,
        suggestedCaseName,
        alreadyConverted = false,
    }) => {
        const clientId = ev.clientUserId || newClient.id || null;
        const clientDisplayName = ev.clientName || newClient.name || savedLeadName || "";

        setIntakeMode(INTAKE_EXISTING);
        setLeadName("");
        setLeadPhone("");
        setLeadEmail("");
        setClients(clientId ? [{
            userId: clientId,
            name: clientDisplayName,
            phone: newClient.phone || savedLeadPhone || "",
        }] : []);
        setClientSearch("");
        setClientUserId(clientId);
        setClientName(clientDisplayName);
        linkedClientLabelRef.current = clientDisplayName;
        setCaseId(ev.caseId || null);
        setCaseName(ev.caseName || "");
        setOptionalConvertCaseName("");
        setSuccessMsg(alreadyConverted
            ? t("calendar.convertLeadAlreadyDone")
            : t("calendar.convertLeadSuccess"));
        onUpdated?.(ev);

        if (ev.caseId) return;

        setCaseFormDraft({
            CaseName: suggestedCaseName || `תיק — ${clientDisplayName}`,
            CustomerName: clientDisplayName,
            CustomerMail: newClient.email || savedLeadEmail || "",
            PhoneNumber: newClient.phone || savedLeadPhone || "",
            UserId: clientId,
            Users: clientId ? [{
                UserId: clientId,
                Name: clientDisplayName,
                Email: newClient.email || savedLeadEmail || "",
                PhoneNumber: newClient.phone || savedLeadPhone || "",
            }] : [],
            CaseManager: managers[0]?.name || "",
            CaseManagerId: managers[0]?.userId || "",
        });
    }, [managers, onUpdated, t]);

    const handleOpenCaseForm = () => {
        const clientId = clients[0]?.userId || clientUserId || event?.clientUserId || null;
        if (!clientId) return;
        const clientDisplayName = clients[0]?.name || clientName || event?.clientName || "";
        const suggestedCaseName = optionalConvertCaseName.trim() || event?.leadCaseName || "";
        setCaseFormDraft({
            CaseName: suggestedCaseName || `תיק — ${clientDisplayName}`,
            CustomerName: clientDisplayName,
            CustomerMail: leadEmail || "",
            PhoneNumber: clients[0]?.phone || leadPhone || "",
            UserId: clientId,
            Users: [{
                UserId: clientId,
                Name: clientDisplayName,
                Email: leadEmail || "",
                PhoneNumber: clients[0]?.phone || leadPhone || "",
            }],
            CaseManager: managers[0]?.name || "",
            CaseManagerId: managers[0]?.userId || "",
        });
    };

    const handleConvertLead = async () => {
        if (!isEdit) return;
        setConverting(true);
        setError("");
        setSuccessMsg("");
        const savedLeadName = leadName;
        const savedLeadPhone = leadPhone;
        const savedLeadEmail = leadEmail;
        const suggestedCaseName = optionalConvertCaseName.trim();
        try {
            const res = await calendarApi.convertLead({ eventId: event.id });
            if (res?.success && res?.data?.event) {
                applyConvertResult(res.data.event, res.data.client || {}, {
                    savedLeadName,
                    savedLeadPhone,
                    savedLeadEmail,
                    suggestedCaseName,
                    alreadyConverted: !!res.data.alreadyConverted,
                });
            } else {
                const code = res?.data?.code;
                if (code === "PHONE_ALREADY_EXISTS") {
                    setError(res?.data?.message || t("calendar.convertLeadPhoneExists"));
                } else {
                    setError(res?.data?.message || res?.message || t("calendar.convertLeadError"));
                }
            }
        } catch (err) {
            setError(err?.response?.data?.message || t("calendar.convertLeadError"));
        } finally {
            setConverting(false);
        }
    };

    // ─── Link / unlink case on existing event ─────────────────────────────
    const handleLinkCase = async (newCaseId) => {
        if (!isEdit) {
            // Create-mode: just update local state; the case will be persisted on save.
            setCaseId(newCaseId);
            const hit = clientCases.find((c) =>
                String(c?.id ?? c?.CaseId ?? c?.caseid) === String(newCaseId)
            );
            setCaseName(hit?.name || hit?.CaseName || hit?.casename || "");
            return;
        }
        setLinkingCase(true);
        setError("");
        setSuccessMsg("");
        try {
            const res = await calendarApi.linkCase(event.id, newCaseId);
            if (res?.success && res?.data?.event) {
                const ev = res.data.event;
                setCaseId(ev.caseId || null);
                setCaseName(ev.caseName || "");
                setSuccessMsg(newCaseId ? t("calendar.linkCaseSuccess") : t("calendar.unlinkCaseSuccess"));
                onUpdated?.(ev);
            } else {
                setError(res?.data?.message || res?.message || t("calendar.linkCaseError"));
            }
        } catch (err) {
            setError(err?.response?.data?.message || t("calendar.linkCaseError"));
        } finally {
            setLinkingCase(false);
        }
    };

    // ─── Search-input handlers ────────────────────────────────────────────
    const handleCustomerSelected = (selectedCustomerName, resultItem) => {
        const selectedUser = resultItem || (Array.isArray(customers)
            ? customers.find((u) => customerDisplayName(u) === String(selectedCustomerName ?? "").trim())
            : null);
        if (!selectedUser) return;
        const displayName = customerDisplayName(selectedUser) || String(selectedCustomerName ?? "").trim();
        const uid = customerUserId(selectedUser);
        if (uid == null) return;
        const phone = customerPhone(selectedUser);
        setClients((prev) => {
            if (prev.some((c) => Number(c.userId) === Number(uid))) return prev;
            const next = [...prev, { userId: uid, name: displayName, phone }];
            if (prev.length === 0) {
                setCaseId(null);
                setCaseName("");
                linkedClientLabelRef.current = displayName;
            }
            return next;
        });
        setClientSearch("");
        searchCustomers("");
    };

    const handleRemoveClient = (userId) => {
        setClients((prev) => {
            const next = prev.filter((c) => Number(c.userId) !== Number(userId));
            if (!next.length) {
                setCaseId(null);
                setCaseName("");
                linkedClientLabelRef.current = "";
            } else {
                linkedClientLabelRef.current = next[0]?.name || "";
            }
            return next;
        });
    };

    const handleReminderClientSelected = (_selectedName, resultItem) => {
        const selectedUser = resultItem || null;
        if (!selectedUser) return;
        const displayName = customerDisplayName(selectedUser);
        const email = selectedUser?.Email || selectedUser?.email || "";
        setClientUserId(customerUserId(selectedUser));
        setReminderClientName(displayName);
        if (email) setReminderToEmail(email);
        linkedClientLabelRef.current = displayName;
        // Clear search field after pick — selected name lives in "שם לקוח".
        setClientName("");
        searchCustomers("");
    };

    const handleClientSearch = useCallback((name) => {
        setClientSearch(name);
        searchCustomers(String(name ?? "").trim());
    }, [searchCustomers]);

    const handleManagerSelected = (selectedManagerName, resultItem) => {
        const selectedAdmin = resultItem || (Array.isArray(admins)
            ? admins.find((a) => a.name?.trim() === selectedManagerName?.trim())
            : null);
        if (!selectedAdmin?.userid) return;
        setManagers((prev) => {
            if (prev.some((m) => m.userId === selectedAdmin.userid)) return prev;
            return [...prev, {
                userId: selectedAdmin.userid,
                name: selectedAdmin.name || selectedManagerName || "",
            }];
        });
        setManagerSearch("");
        searchAdmins("");
    };

    const handleRemoveManager = (userId) => {
        setManagers((prev) => prev.filter((m) => m.userId !== userId));
    };

    const handleResendInvite = async () => {
        if (!isEdit || !event?.id) return;
        setError("");
        setSuccessMsg("");
        try {
            const res = await calendarApi.resendInvite(event.id);
            if (!res?.success) {
                setError(
                    res?.data?.message
                    || res?.message
                    || t("calendar.inviteResendFailed")
                );
                return;
            }
            const data = res.data || {};
            if (data.deferred) {
                setSuccessMsg(t("calendar.inviteResendDeferred"));
            } else {
                setSuccessMsg(t("calendar.inviteResendSuccess"));
            }
            if (data.event) onUpdated?.(data.event);
        } catch (e) {
            setError(
                e?.response?.data?.message
                || t("calendar.inviteResendFailed")
            );
        }
    };

    const handleDuplicate = async () => {
        if (!isEdit || !event?.id) return;
        setDuplicating(true);
        setError("");
        try {
            const res = await calendarApi.duplicateEvent(event.id);
            if (res?.success && res?.data?.event) {
                onSaved?.(res.data.event);
            } else {
                setError(
                    res?.data?.message
                    || res?.message
                    || t("calendar.duplicateEventError")
                );
                setDuplicating(false);
            }
        } catch (err) {
            setError(
                err?.response?.data?.message
                || t("calendar.duplicateEventError")
            );
            setDuplicating(false);
        }
    };

    // ─── Derived flags ────────────────────────────────────────────────────
    const isInternalScopedType = isInternalScopedEventType(eventType);
    const showIntakeToggle = !isInternalScopedType;
    const showLeadFields = showIntakeToggle && intakeMode === INTAKE_LEAD;
    const showExistingClientFields = showIntakeToggle && intakeMode === INTAKE_EXISTING;
    const linkedClientId = clients[0]?.userId || clientUserId || event?.clientUserId || null;
    const linkedCaseId = caseId || event?.caseId || null;
    const hasLeadDataPersisted = isEdit
        && !linkedClientId
        && !linkedCaseId
        && (leadName || leadPhone || leadEmail);
    const showConvertCta = hasLeadDataPersisted && !converting;
    const showOpenCaseCta = isEdit && !!linkedClientId && !linkedCaseId && !showConvertCta && !caseFormDraft;
    const showCaseLinker = showExistingClientFields && !!linkedClientId;
    const showConflictBanner = !isInternalScopedType && (conflictState.hasConflict || conflictState.hasLeaveConflict);
    const hasLinkedClients = clients.length > 0;

    const modalRootRef = useRef(null);
    const leadNameInputRef = useRef(null);
    const leadPhoneInputRef = useRef(null);
    const leadEmailInputRef = useRef(null);
    const prevPopupHeightRef = useRef(null);
    const sizeMorphCleanupRef = useRef(null);

    /** Keep Tab inside the lead fields instead of jumping to chips/toggles behind them. */
    const focusLeadField = useCallback((ref) => {
        const el = ref?.current;
        if (el && typeof el.focus === "function") el.focus();
    }, []);

    const handleLeadFieldTab = useCallback((e, { next, prev }) => {
        if (e.key !== "Tab") return;
        if (e.shiftKey) {
            if (!prev) return;
            e.preventDefault();
            focusLeadField(prev);
            return;
        }
        if (!next) return;
        e.preventDefault();
        focusLeadField(next);
    }, [focusLeadField]);
    // Compact (חופשה/חג) ↔ full form is the size jump users notice.
    const layoutMode = caseFormDraft
        ? "case"
        : (isInternalScopedType ? "compact" : "full");

    // Smoothly morph the outer SimplePopUp card height when form density changes.
    useLayoutEffect(() => {
        const root = modalRootRef.current;
        if (!root) return undefined;
        const popup = root.closest(".lw-simplePopUp__container");
        if (!popup) return undefined;

        if (typeof sizeMorphCleanupRef.current === "function") {
            sizeMorphCleanupRef.current();
            sizeMorphCleanupRef.current = null;
        }

        popup.style.height = "";
        const nextH = Math.round(popup.getBoundingClientRect().height);
        const prevH = prevPopupHeightRef.current;

        if (prevH != null && Math.abs(prevH - nextH) > 2) {
            popup.classList.add("lw-simplePopUp__container--sizeMorph");
            popup.style.overflow = "hidden";
            popup.style.height = `${prevH}px`;
            // Force reflow, then ease to the new natural height.
            void popup.offsetHeight;
            popup.style.height = `${nextH}px`;

            let finished = false;
            let safety = 0;
            const finish = (e) => {
                if (finished) return;
                if (e && e.propertyName && e.propertyName !== "height") return;
                finished = true;
                window.clearTimeout(safety);
                popup.style.height = "";
                popup.style.overflow = "";
                popup.classList.remove("lw-simplePopUp__container--sizeMorph");
                popup.removeEventListener("transitionend", finish);
                sizeMorphCleanupRef.current = null;
            };
            safety = window.setTimeout(() => finish({ propertyName: "height" }), 420);
            popup.addEventListener("transitionend", finish);
            sizeMorphCleanupRef.current = () => finish({ propertyName: "height" });
        }

        prevPopupHeightRef.current = nextH;
        return () => {
            if (typeof sizeMorphCleanupRef.current === "function") {
                sizeMorphCleanupRef.current();
                sizeMorphCleanupRef.current = null;
            }
        };
    }, [layoutMode, eventType, showConflictBanner, showLeadFields, showExistingClientFields, showManagersField, isReminderEventType]);

    if (caseFormDraft) {
        return (
            <SimpleContainer ref={modalRootRef} className="lw-eventFormModal lw-eventFormModal--caseForm">
                <SimpleContainer className="lw-eventFormModal__header">
                    <Text24>{t("calendar.createCaseFromLead")}</Text24>
                    {successMsg && (
                        <Text12 color="#276749">{successMsg}</Text12>
                    )}
                </SimpleContainer>
                <SimpleScrollView className="lw-eventFormModal__caseFormScroll">
                    <CaseFullView
                        initialDraft={caseFormDraft}
                        closePopUpFunction={() => setCaseFormDraft(null)}
                        onFailureFunction={(err) => setError(err?.data?.message || err?.message || t("calendar.linkCaseError"))}
                        onCaseCreated={async (createdCaseId) => {
                            const linkRes = await calendarApi.linkCase(event.id, createdCaseId);
                            if (!linkRes?.success || !linkRes?.data?.event) {
                                throw new Error(linkRes?.data?.message || linkRes?.message || t("calendar.linkCaseError"));
                            }
                            const linked = linkRes.data.event;
                            setCaseId(linked.caseId || createdCaseId);
                            setCaseName(linked.caseName || "");
                            setSuccessMsg(t("calendar.linkCaseSuccess"));
                            onUpdated?.(linked);
                        }}
                    />
                    {error && <Text14 color="#E53E3E">{error}</Text14>}
                </SimpleScrollView>
            </SimpleContainer>
        );
    }

    return (
        <SimpleContainer
            ref={modalRootRef}
            className={`lw-eventFormModal lw-eventFormModal--${layoutMode}`}
        >
            <SimpleScrollView>

                {/* ─── Header ─── */}
                <SimpleContainer className="lw-eventFormModal__header">
                    <Text24>{isEdit ? t("calendar.editEvent") : t("calendar.addEvent")}</Text24>
                </SimpleContainer>

                {/* ─── Conflict banner (top, non-blocking) ─── */}
                {showConflictBanner && (
                    <SimpleContainer
                        className="lw-eventFormModal__conflictBanner"
                        role="alert"
                        aria-live="polite"
                    >
                        <SimpleContainer className="lw-eventFormModal__conflictBannerIcon" aria-hidden="true">⚠️</SimpleContainer>
                        <SimpleContainer className="lw-eventFormModal__conflictBannerBody">
                            <TextBold14 color={AMBER_TEXT}>{t("calendar.conflictWarningTitle")}</TextBold14>
                            <Text14 color={AMBER_TEXT}>
                                {t("calendar.conflictWarningBody")}
                                {conflictState.hasLeaveConflict && (
                                    <span className="lw-eventFormModal__conflictBannerHint">
                                        {" "}{t("calendar.leaveConflictHint")}
                                    </span>
                                )}
                            </Text14>
                        </SimpleContainer>
                    </SimpleContainer>
                )}

                {/* ─── Success toast (in-modal) ─── */}
                {successMsg && (
                    <SimpleContainer className="lw-eventFormModal__successBanner" role="status" aria-live="polite">
                        <Text14 color="#22543D">{successMsg}</Text14>
                    </SimpleContainer>
                )}

                <SimpleContainer className="lw-eventFormModal__body lw-eventFormModal__body--layoutTween">

                    {/* ─── Event-type segmented (appointment / leave / hearing / reminder) ─── */}
                    <div className="lw-eventFormModal__field">
                        <Text14 color={NAVY}>{t("calendar.filterByEventType")}</Text14>
                        <div className="lw-eventFormModal__segmented lw-eventFormModal__segmented--penta" role="group">
                            {EVENT_TYPE_OPTIONS.map(({ value, labelKey }) => (
                                <SimpleButton
                                    key={value}
                                    className={`lw-eventFormModal__segmentedBtn ${eventType === value ? "is-active" : ""}`}
                                    onPress={() => setEventType(value)}
                                    aria-pressed={eventType === value}
                                    tabIndex={-1}
                                >
                                    {t(labelKey)}
                                </SimpleButton>
                            ))}
                        </div>
                    </div>

                    {/* ─── Title ─── */}
                    <SimpleInput
                        title={t("calendar.eventTitle") + (isInternalScopedType ? "" : " *")}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        timeToWaitInMilli={0}
                    />

                    {/* ─── Time fields ─── */}
                    <SimpleInput
                        title={(isReminderEventType
                            ? t("reminders.add.scheduledFor")
                            : t("calendar.startTime")) + " *"}
                        type="datetime-local"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        timeToWaitInMilli={0}
                    />
                    {!isReminderEventType && (
                        <SimpleInput
                            title={t("calendar.endTime") + " *"}
                            type="datetime-local"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            timeToWaitInMilli={0}
                        />
                    )}

                    <SimpleContainer className="lw-eventFormModal__allDay">
                        <input
                            type="checkbox"
                            id="allDay"
                            checked={allDay}
                            onChange={(e) => setAllDay(e.target.checked)}
                        />
                        <label htmlFor="allDay">
                            <Text14>{t("calendar.allDay")}</Text14>
                        </label>
                        {conflictState.loading && (
                            <Text12 color="#718096" className="lw-eventFormModal__conflictLoading">
                                {t("calendar.checkingConflict")}
                            </Text12>
                        )}
                    </SimpleContainer>

                    {!isReminderEventType && (
                        <SimpleInput
                            title={t("calendar.location")}
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            timeToWaitInMilli={0}
                        />
                    )}

                    {isReminderEventType && (
                        <SimpleContainer className="lw-eventFormModal__reminderEmail">
                            <TextBold14 color={NAVY}>{t("reminders.add.title")}</TextBold14>
                            <Text12 color="#718096">{t("calendar.eventRemindersHintReminderType")}</Text12>

                            <SearchInput
                                title={t("calendar.client")}
                                value={clientName}
                                onSearch={(name) => {
                                    setClientName(name);
                                    searchCustomers(name);
                                }}
                                isPerforming={isSearchingCustomers}
                                queryResult={customers}
                                getButtonTextFunction={(item) => customerDisplayName(item)}
                                buttonPressFunction={handleReminderClientSelected}
                                clearOnSelect
                            />

                            <SimpleContainer className="lw-eventFormModal__reminderEmailRow">
                                <SimpleInput
                                    title={t("reminders.add.clientName") + " *"}
                                    value={reminderClientName}
                                    onChange={(e) => setReminderClientName(e.target.value)}
                                    timeToWaitInMilli={0}
                                />
                                <SimpleInput
                                    title={t("reminders.add.email") + " *"}
                                    type="email"
                                    value={reminderToEmail}
                                    onChange={(e) => setReminderToEmail(e.target.value)}
                                    timeToWaitInMilli={0}
                                />
                            </SimpleContainer>

                            <SimpleContainer className="lw-eventFormModal__reminderEmailRow">
                                <SimpleContainer className="lw-eventFormModal__reminderTemplate">
                                    {loadingReminderTemplates ? (
                                        <Text12 color="#718096">{t("calendar.loadingCases")}</Text12>
                                    ) : (
                                        <ChooseButton
                                            buttonText={
                                                currentReminderTemplate?.label
                                                || t("reminders.add.template")
                                            }
                                            items={reminderTemplateItems}
                                            OnPressChoiceFunction={handleReminderTemplateChange}
                                            showAll={false}
                                        />
                                    )}
                                </SimpleContainer>
                                {reminderTemplateKey === "GENERAL" && (
                                    <SimpleInput
                                        title={t("reminders.add.subject")}
                                        value={reminderSubject}
                                        onChange={(e) => setReminderSubject(e.target.value)}
                                        timeToWaitInMilli={0}
                                    />
                                )}
                            </SimpleContainer>

                            <SimpleContainer className="lw-eventFormModal__reminderEmailVars">
                                {reminderExtraVars.filter((v) => v !== "body").map((key) => (
                                    <SimpleInput
                                        key={key}
                                        title={REMINDER_VAR_LABELS[key] || key}
                                        placeholder={key === "date" ? "dd/mm/yyyy" : undefined}
                                        value={reminderTemplateData[key] || ""}
                                        onChange={(e) => handleReminderVarChange(key, e.target.value)}
                                        timeToWaitInMilli={0}
                                    />
                                ))}
                            </SimpleContainer>
                            {reminderExtraVars.includes("body") && (
                                <SimpleTextArea
                                    title={REMINDER_VAR_LABELS.body}
                                    value={reminderTemplateData.body || ""}
                                    onChange={(val) => handleReminderVarChange("body", val)}
                                    rows={3}
                                />
                            )}

                            {reminderBodyPreview && (
                                <SimpleContainer className="lw-eventFormModal__bodyPreview">
                                    <Text14 className="lw-eventFormModal__bodyPreviewLabel">
                                        {t("reminders.import.bodyPreviewLabel")}
                                    </Text14>
                                    <Text14 className="lw-eventFormModal__bodyPreviewText">
                                        {reminderBodyPreview}
                                    </Text14>
                                </SimpleContainer>
                            )}
                        </SimpleContainer>
                    )}

                    {showReminderPicker && (
                        <SimpleContainer className="lw-eventFormModal__reminders">
                            <TextBold14 color={NAVY}>{t("calendar.eventRemindersTitle")}</TextBold14>
                            <Text12 color="#718096">{t("calendar.eventRemindersHint")}</Text12>

                            <SimpleContainer className="lw-eventFormModal__reminderGroup">
                                <TextBold14 color={NAVY}>{t("calendar.lawyerRemindersLabel")}</TextBold14>
                                <SimpleContainer className="lw-eventFormModal__reminderChips">
                                    {reminderPresets.map(({ minutes, labelKey }) => {
                                        const active = lawyerReminderOffsets.includes(minutes);
                                        return (
                                            <SimpleButton
                                                key={`lawyer-${minutes}`}
                                                className={`lw-eventFormModal__reminderChip ${active ? "is-active" : ""}`}
                                                onPress={() => toggleLawyerReminderOffset(minutes)}
                                                aria-pressed={active}
                                                tabIndex={-1}
                                            >
                                                <Text14>{t(labelKey)}</Text14>
                                            </SimpleButton>
                                        );
                                    })}
                                </SimpleContainer>
                                {lawyerReminderOffsets.length === 0 && (
                                    <Text12 color="#718096">{t("calendar.eventRemindersNone")}</Text12>
                                )}
                            </SimpleContainer>

                            <SimpleContainer
                                className={`lw-eventFormModal__reminderGroup ${!hasClientRecipient ? "is-disabled" : ""}`}
                            >
                                <TextBold14 color={NAVY}>{t("calendar.clientRemindersLabel")}</TextBold14>
                                {!hasClientRecipient ? (
                                    <Text12 color="#718096">{t("calendar.clientRemindersDisabledHint")}</Text12>
                                ) : (
                                    <>
                                        <SimpleContainer className="lw-eventFormModal__reminderChips">
                                            {reminderPresets.map(({ minutes, labelKey }) => {
                                                const active = clientReminderOffsets.includes(minutes);
                                                return (
                                                    <SimpleButton
                                                        key={`client-${minutes}`}
                                                        className={`lw-eventFormModal__reminderChip ${active ? "is-active" : ""}`}
                                                        onPress={() => toggleClientReminderOffset(minutes)}
                                                        aria-pressed={active}
                                                        tabIndex={-1}
                                                        disabled={!hasClientRecipient}
                                                    >
                                                        <Text14>{t(labelKey)}</Text14>
                                                    </SimpleButton>
                                                );
                                            })}
                                        </SimpleContainer>
                                        {clientReminderOffsets.length === 0 && (
                                            <Text12 color="#718096">{t("calendar.eventRemindersNone")}</Text12>
                                        )}
                                    </>
                                )}
                            </SimpleContainer>

                            {anyReminderOffsets && (
                                <SimpleContainer className="lw-eventFormModal__reminderChannels">
                                    <TextBold14 color={NAVY}>{t("calendar.eventRemindersChannelsTitle")}</TextBold14>
                                    <SimpleContainer className="lw-eventFormModal__reminderChips">
                                        {reminderChannelOptions.map(({ key, labelKey }) => {
                                            const active = !!reminderChannels[key];
                                            return (
                                                <SimpleButton
                                                    key={key}
                                                    className={`lw-eventFormModal__reminderChip ${active ? "is-active" : ""}`}
                                                    onPress={() => toggleReminderChannel(key)}
                                                    aria-pressed={active}
                                                    tabIndex={-1}
                                                >
                                                    <Text14>{t(labelKey)}</Text14>
                                                </SimpleButton>
                                            );
                                        })}
                                    </SimpleContainer>
                                </SimpleContainer>
                            )}
                            <SimpleContainer className="lw-eventFormModal__reminderChannels">
                                <TextBold14 color={NAVY}>{t("calendar.reminderTargetsLabel")}</TextBold14>
                                <Text12 color="#718096">{t("calendar.reminderTargetsHint")}</Text12>
                                <SimpleContainer className="lw-eventFormModal__reminderChips">
                                    <SimpleButton
                                        className={`lw-eventFormModal__reminderChip ${reminderTargets.client ? "is-active" : ""}`}
                                        onPress={() => toggleReminderTarget("client")}
                                        aria-pressed={!!reminderTargets.client}
                                        tabIndex={-1}
                                        disabled={!hasClientRecipient}
                                    >
                                        <Text14>{t("calendar.reminderTargetClient")}</Text14>
                                    </SimpleButton>
                                    <SimpleButton
                                        className={`lw-eventFormModal__reminderChip ${reminderTargets.managers ? "is-active" : ""}`}
                                        onPress={() => toggleReminderTarget("managers")}
                                        aria-pressed={!!reminderTargets.managers}
                                        tabIndex={-1}
                                    >
                                        <Text14>{t("calendar.reminderTargetManagers")}</Text14>
                                    </SimpleButton>
                                </SimpleContainer>
                            </SimpleContainer>
                            {reminderTargets.client && hasClientRecipient && (
                                <SimpleContainer className="lw-eventFormModal__smsTemplates">
                                    <Text12 color="#718096">
                                        {t("calendar.inviteRemindersIndependentHint")}
                                    </Text12>
                                    <CalendarSmsTemplateEditor
                                        title={t("calendar.clientReminderSmsLabel")}
                                        hint={t("calendar.clientReminderSmsHint")}
                                        value={clientReminderSms}
                                        onChange={setClientReminderSms}
                                        previewValues={smsPreviewValues}
                                        excludeVars={["rsvpUrl"]}
                                        defaultValue={DEFAULT_CLIENT_REMINDER_SMS}
                                    />
                                    <CalendarSmsTemplateEditor
                                        title={t("calendar.inviteSmsLabel")}
                                        hint={t("calendar.inviteSmsHint")}
                                        value={inviteSms}
                                        onChange={setInviteSms}
                                        previewValues={smsPreviewValues}
                                        defaultValue={DEFAULT_INVITE_SMS}
                                    />
                                </SimpleContainer>
                            )}
                        </SimpleContainer>
                    )}

                    {/* ─── Managers (meeting attendees) — not for תזכורת כללית / leave / holiday ─── */}
                    {showManagersField && (
                    <SimpleContainer className="lw-eventFormModal__managersCol">
                        {isEdit && event?.inviteStatus && event.inviteStatus !== "none" && (
                            <SimpleContainer
                                className={`lw-eventFormModal__inviteStatus lw-eventFormModal__inviteStatus--${event.inviteStatus}`}
                            >
                                <span className="lw-eventFormModal__inviteBadge">
                                    {event.inviteStatus === "accepted"
                                        ? t("calendar.inviteStatusBadgeAccepted", { defaultValue: "אושר" })
                                        : event.inviteStatus === "declined"
                                            ? t("calendar.inviteStatusBadgeDeclined", { defaultValue: "נדחה" })
                                            : t("calendar.inviteStatusBadgePending", { defaultValue: "ממתין" })}
                                </span>
                                <TextBold14 color={NAVY}>
                                    {event.inviteStatus === "accepted"
                                        ? t("calendar.inviteStatusAccepted")
                                        : event.inviteStatus === "declined"
                                            ? t("calendar.inviteStatusDeclined")
                                            : t("calendar.inviteStatusPending")}
                                </TextBold14>
                                {(event.inviteStatus === "pending" || event.inviteStatus === "declined") && (
                                    <SecondaryButton onPress={handleResendInvite}>
                                        {t("calendar.inviteResend")}
                                    </SecondaryButton>
                                )}
                                {clients.some((c) => c.phone) && (
                                    <SimpleContainer className="lw-eventFormModal__clientPhones">
                                        {clients.filter((c) => c.phone).map((c) => (
                                            <Text12 key={c.userId} color="#4A5568">
                                                {t("calendar.clientPhoneLabel")}: {clientChipLabel(c)}
                                            </Text12>
                                        ))}
                                    </SimpleContainer>
                                )}
                            </SimpleContainer>
                        )}
                        <SearchInput
                            title={t("calendar.manager")}
                            value={managerSearch}
                            onSearch={(name) => {
                                setManagerSearch(name);
                                searchAdmins(name);
                            }}
                            isPerforming={isSearchingAdmins}
                            queryResult={admins}
                            getButtonTextFunction={(item) => item.name || item.Name || ""}
                            buttonPressFunction={handleManagerSelected}
                            clearOnSelect
                        />
                        {managers.length > 0 && (
                            <SimpleContainer className="lw-eventFormModal__managerChips">
                                {managers.map((m) => (
                                    <span key={m.userId} className="lw-eventFormModal__managerChip">
                                        {m.name}
                                        <button
                                            type="button"
                                            className="lw-eventFormModal__chipRemove"
                                            tabIndex={-1}
                                            onClick={() => handleRemoveManager(m.userId)}
                                            aria-label={t("calendar.removeManager")}
                                        >
                                            &times;
                                        </button>
                                    </span>
                                ))}
                            </SimpleContainer>
                        )}
                    </SimpleContainer>
                    )}

                    {/* Invite status for reminder-type edits (managers block hidden) */}
                    {!showManagersField && isEdit && event?.inviteStatus && event.inviteStatus !== "none" && (
                        <SimpleContainer
                            className={`lw-eventFormModal__inviteStatus lw-eventFormModal__inviteStatus--${event.inviteStatus}`}
                        >
                            <span className="lw-eventFormModal__inviteBadge">
                                {event.inviteStatus === "accepted"
                                    ? t("calendar.inviteStatusBadgeAccepted", { defaultValue: "אושר" })
                                    : event.inviteStatus === "declined"
                                        ? t("calendar.inviteStatusBadgeDeclined", { defaultValue: "נדחה" })
                                        : t("calendar.inviteStatusBadgePending", { defaultValue: "ממתין" })}
                            </span>
                            <TextBold14 color={NAVY}>
                                {event.inviteStatus === "accepted"
                                    ? t("calendar.inviteStatusAccepted")
                                    : event.inviteStatus === "declined"
                                        ? t("calendar.inviteStatusDeclined")
                                        : t("calendar.inviteStatusPending")}
                            </TextBold14>
                        </SimpleContainer>
                    )}

                    {/* ─── Intake-mode toggle (appointment-only) ─── */}
                    {showIntakeToggle && (
                        <div className="lw-eventFormModal__field">
                            <Text14 color={NAVY}>{t("calendar.intakeMode")}</Text14>
                            <div className="lw-eventFormModal__segmented" role="group">
                                <SimpleButton
                                    className={`lw-eventFormModal__segmentedBtn ${intakeMode === INTAKE_EXISTING ? "is-active" : ""}`}
                                    onPress={() => setIntakeMode(INTAKE_EXISTING)}
                                    aria-pressed={intakeMode === INTAKE_EXISTING}
                                    disabled={isEdit && hasLinkedClients}
                                    tabIndex={-1}
                                >
                                    {t("calendar.intakeExistingClient")}
                                </SimpleButton>
                                <SimpleButton
                                    className={`lw-eventFormModal__segmentedBtn ${intakeMode === INTAKE_LEAD ? "is-active" : ""}`}
                                    onPress={() => setIntakeMode(INTAKE_LEAD)}
                                    aria-pressed={intakeMode === INTAKE_LEAD}
                                    disabled={isEdit && hasLinkedClients}
                                    tabIndex={-1}
                                >
                                    {t("calendar.intakeNewLead")}
                                </SimpleButton>
                            </div>
                        </div>
                    )}

                    {/* ─── Existing-client fields ─── */}
                    {showExistingClientFields && (
                        <>
                            <SearchInput
                                title={t("calendar.addClient")}
                                value={clientSearch}
                                onSearch={handleClientSearch}
                                isPerforming={isSearchingCustomers}
                                queryResult={customers}
                                getButtonTextFunction={(item) => {
                                    const name = customerDisplayName(item);
                                    const phone = customerPhone(item);
                                    return phone ? `${name} · ${phone}` : name;
                                }}
                                buttonPressFunction={handleCustomerSelected}
                                clearOnSelect
                            />
                            {clients.length > 0 && (
                                <SimpleContainer className="lw-eventFormModal__managerChips lw-eventFormModal__clientChips">
                                    {clients.map((c) => (
                                        <span key={c.userId} className="lw-eventFormModal__managerChip">
                                            {clientChipLabel(c)}
                                            <button
                                                type="button"
                                                className="lw-eventFormModal__chipRemove"
                                                tabIndex={-1}
                                                onClick={() => handleRemoveClient(c.userId)}
                                                aria-label={t("calendar.removeClient")}
                                            >
                                                &times;
                                            </button>
                                        </span>
                                    ))}
                                </SimpleContainer>
                            )}
                            <Text12 color="#718096">{t("calendar.clientsHint")}</Text12>

                            {/* Linked-case display + grid ─── */}
                            {showCaseLinker && (
                                <SimpleContainer className="lw-eventFormModal__caseLinker">
                                    <SimpleContainer className="lw-eventFormModal__caseLinkerHeader">
                                        <TextBold14 color={NAVY}>{t("calendar.linkedCaseTitle")}</TextBold14>
                                        {caseName ? (
                                            <SimpleContainer className="lw-eventFormModal__caseLinkerCurrent">
                                                <Text14 color={NAVY}>{caseName}</Text14>
                                                {isEdit && (
                                                    <SimpleButton
                                                        className="lw-eventFormModal__unlinkBtn"
                                                        onPress={() => handleLinkCase(null)}
                                                        disabled={linkingCase}
                                                    >
                                                        {t("calendar.unlinkCase")} ✕
                                                    </SimpleButton>
                                                )}
                                            </SimpleContainer>
                                        ) : (
                                            <Text12 color="#718096">{t("calendar.noLinkedCase")}</Text12>
                                        )}
                                    </SimpleContainer>

                                    <Text12 color="#4C6690">{t("calendar.linkCaseTitle")}</Text12>
                                    {loadingClientCases ? (
                                        <Text12 color="#718096">{t("calendar.loadingCases")}</Text12>
                                    ) : clientCases.length === 0 ? (
                                        <Text12 color="#718096">{t("calendar.noActiveCases")}</Text12>
                                    ) : (
                                        <SimpleContainer className="lw-eventFormModal__caseGrid">
                                            {clientCases.map((c) => {
                                                const cid = c?.id ?? c?.CaseId ?? c?.caseid;
                                                const cname = c?.name ?? c?.CaseName ?? c?.casename ?? `#${cid}`;
                                                const stage = c?.stage ?? c?.Stage ?? "";
                                                const isActive = String(caseId) === String(cid);
                                                return (
                                                    <SimpleButton
                                                        key={cid}
                                                        className={`lw-eventFormModal__caseChip ${isActive ? "is-active" : ""}`}
                                                        onPress={() => handleLinkCase(cid)}
                                                        disabled={linkingCase}
                                                        aria-pressed={isActive}
                                                    >
                                                        <span className="lw-eventFormModal__caseChipName">{cname}</span>
                                                        {stage ? (
                                                            <span className="lw-eventFormModal__caseChipStage">{String(stage)}</span>
                                                        ) : null}
                                                    </SimpleButton>
                                                );
                                            })}
                                        </SimpleContainer>
                                    )}
                                    {linkingCase && (
                                        <Text12 color="#718096">{t("calendar.linkingCase")}</Text12>
                                    )}
                                </SimpleContainer>
                            )}
                        </>
                    )}

                    {/* ─── Lead fields ─── */}
                    {showLeadFields && (
                        <SimpleContainer className="lw-eventFormModal__leadBox">
                            <TextBold14 color={NAVY}>{t("calendar.intakeNewLead")}</TextBold14>
                            <Text12 color="#718096">{t("calendar.leadHint")}</Text12>
                            <SimpleInput
                                title={t("calendar.leadName")}
                                value={leadName}
                                onChange={(e) => setLeadName(e.target.value)}
                                timeToWaitInMilli={0}
                                inputRef={leadNameInputRef}
                                autoComplete="name"
                                onKeyDown={(e) => handleLeadFieldTab(e, { next: leadPhoneInputRef })}
                            />
                            <SimpleInput
                                title={t("calendar.leadPhone")}
                                // text + inputMode avoids Safari tel-autofill stealing focus on Tab
                                type="text"
                                inputMode="tel"
                                autoComplete="off"
                                value={leadPhone}
                                onChange={(e) => setLeadPhone(e.target.value)}
                                timeToWaitInMilli={0}
                                inputRef={leadPhoneInputRef}
                                onKeyDown={(e) => handleLeadFieldTab(e, {
                                    next: leadEmailInputRef,
                                    prev: leadNameInputRef,
                                })}
                            />
                            <SimpleInput
                                title={t("calendar.leadEmail")}
                                type="email"
                                autoComplete="off"
                                value={leadEmail}
                                onChange={(e) => setLeadEmail(e.target.value)}
                                timeToWaitInMilli={0}
                                inputRef={leadEmailInputRef}
                                onKeyDown={(e) => handleLeadFieldTab(e, {
                                    prev: leadPhoneInputRef,
                                })}
                            />
                            <SimpleInput
                                title={t("calendar.convertLeadOptionalCaseName")}
                                value={optionalConvertCaseName}
                                onChange={(e) => setOptionalConvertCaseName(e.target.value)}
                                timeToWaitInMilli={0}
                            />
                        </SimpleContainer>
                    )}

                    {/* ─── Convert-lead CTA (edit mode + has lead data) ─── */}
                    {showConvertCta && (
                        <SimpleContainer className="lw-eventFormModal__convertBox">
                            <PrimaryButton
                                onPress={handleConvertLead}
                                isPerforming={converting}
                                className="lw-eventFormModal__convertBtn"
                            >
                                {converting ? t("calendar.convertingLead") : t("calendar.convertLeadCta")}
                            </PrimaryButton>
                        </SimpleContainer>
                    )}

                    {showOpenCaseCta && (
                        <SimpleContainer className="lw-eventFormModal__convertBox">
                            <PrimaryButton
                                onPress={handleOpenCaseForm}
                                className="lw-eventFormModal__convertBtn"
                            >
                                {t("calendar.openCaseFormCta")}
                            </PrimaryButton>
                        </SimpleContainer>
                    )}

                    {/* ─── Color row (preset swatches only) ─── */}
                    <SimpleContainer className="lw-eventFormModal__colorRow">
                        <Text14>{t("calendar.eventColor")}</Text14>
                        <SimpleContainer className="lw-eventFormModal__colorSwatches">
                            {EVENT_COLOR_PRESETS.map((hex) => (
                                <button
                                    key={hex}
                                    type="button"
                                    className={`lw-eventFormModal__colorSwatch ${String(color).toUpperCase() === hex.toUpperCase() ? "is-active" : ""}`}
                                    style={{ backgroundColor: hex }}
                                    tabIndex={-1}
                                    onClick={() => {
                                        colorTouchedRef.current = true;
                                        setColor(hex);
                                    }}
                                    aria-label={hex}
                                    title={hex}
                                />
                            ))}
                        </SimpleContainer>
                    </SimpleContainer>

                    {/* ─── Description ─── */}
                    <SimpleTextArea
                        title={t("calendar.description")}
                        value={description}
                        onChange={(val) => setDescription(val)}
                        rows={3}
                    />

                    {error && <Text14 color="#E53E3E">{error}</Text14>}
                </SimpleContainer>

                {/* ─── Footer actions ─── */}
                <SimpleContainer className="lw-eventFormModal__actions">
                    <PrimaryButton onPress={handleSave} isPerforming={saving}>
                        {t("calendar.save")}
                    </PrimaryButton>
                    <SecondaryButton onPress={onClose}>
                        {t("calendar.cancel")}
                    </SecondaryButton>
                    {isEdit && (
                        <SecondaryButton
                            onPress={handleDuplicate}
                            isPerforming={duplicating}
                        >
                            {t("calendar.duplicateEvent")}
                        </SecondaryButton>
                    )}
                    {isEdit && (
                        <SecondaryButton
                            onPress={handleDelete}
                            isPerforming={deleting}
                            style={{ color: "#E53E3E", borderColor: "#E53E3E" }}
                        >
                            {confirmDelete ? t("calendar.deleteConfirm") : t("calendar.deleteEvent")}
                        </SecondaryButton>
                    )}
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}
