import React, { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleTextArea from "../../../components/simpleComponents/SimpleTextArea";
import SimpleButton from "../../../components/simpleComponents/SimpleButton";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import TertiaryButton from "../../../components/styledComponents/buttons/TertiaryButton";
import { Text12, Text14, TextBold14 } from "../../../components/specializedComponents/text/AllTextKindFile";

import "./CalendarSmsTemplateEditor.scss";

export const CALENDAR_SMS_VARS = [
    "recipientName", "clientsNames", "firmName", "date", "time", "address",
    "wazeUrl", "mapsUrl", "rsvpUrl", "firmPhone", "websiteUrl", "lawyerName", "title",
    "meetingTypeLabel",
];

export const CALENDAR_SMS_VAR_LABELS = {
    recipientName: "שם הלקוח",
    clientsNames: "כל הלקוחות",
    firmName: "שם המשרד",
    date: "תאריך",
    time: "שעה",
    address: "כתובת",
    wazeUrl: "קישור וויז",
    mapsUrl: "קישור מפות",
    rsvpUrl: "קישור אישור הגעה",
    firmPhone: "טלפון המשרד",
    websiteUrl: "אתר המשרד",
    lawyerName: "שם עורך הדין",
    title: "כותרת האירוע",
    meetingTypeLabel: "סוג פגישה",
};

const CHIP_GROUPS = [
    {
        id: "event",
        labelKey: "calendar.smsVarGroupEvent",
        keys: ["recipientName", "clientsNames", "firmName", "title", "lawyerName"],
    },
    {
        id: "whenWhere",
        labelKey: "calendar.smsVarGroupWhenWhere",
        keys: ["date", "time", "address", "firmPhone"],
    },
    {
        id: "links",
        labelKey: "calendar.smsVarGroupLinks",
        keys: ["wazeUrl", "mapsUrl", "rsvpUrl", "websiteUrl"],
    },
];

/** Fill {{placeholders}} with real event data; unresolved ones fall back to the Hebrew label. */
export function renderSmsPreview(template, values) {
    const filled = String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
        const val = values?.[key];
        if (val != null && String(val).trim()) return String(val).trim();
        return `"${CALENDAR_SMS_VAR_LABELS[key] || key}"`;
    });
    return polishSmsPreviewText(filled, values);
}

/**
 * Phone: strip every place/nav line. Zoom: "קישור לזום" (not "כתובתנו"), no Waze/Maps.
 * Mirrors backend polishCalendarSmsBody + meetingPlaceMode.
 */
export function polishSmsPreviewText(text, values = {}) {
    let out = String(text || "");
    const address = String(values.address || "").trim();
    const meetingType = String(values.meetingType || "").trim().toLowerCase();
    const placeMode = values.placeMode
        || (meetingType === "phone" ? "none"
            : (meetingType === "zoom" ? "link" : "place"));
    const isRemote = values.isRemoteMeeting === true
        || placeMode === "link"
        || placeMode === "none"
        || /\bzoom\.us\b|\bmeet\.google\.com\b|\bteams\.(microsoft|live)\.com\b/i.test(address);
    const hasAddress = Boolean(address);

    if (placeMode === "none" || !hasAddress) {
        out = out
            .replace(/כתובתנו\s+(?:הינה|היא)\s*[^\n]*/g, "")
            .replace(/^כתובת\s*:.*$/gm, "")
            .replace(/^מיקום\s*:.*$/gm, "")
            .replace(/^קישור לזום\s*:?\s*$/gm, "")
            .replace(/^קישור לפגישה\s*:?\s*$/gm, "")
            .replace(/^טלפון\s*:.*$/gm, "");
    } else if (isRemote) {
        const label = String(values.locationLabel || "").trim()
            || (meetingType === "zoom" || /\bzoom\.us\b/i.test(address) ? "קישור לזום" : "קישור לפגישה");
        out = out.replace(/כתובתנו\s+(?:הינה|היא)\s+/g, `${label}: `);
        out = out.replace(/^מיקום\s*:/gm, `${label}:`);
    }

    const wazeFilled = String(values.wazeUrl || "").trim();
    const mapsFilled = String(values.mapsUrl || "").trim();

    out = out
        .split("\n")
        .filter((line) => {
            const t = line.trim();
            if (!t) return true;
            if ((placeMode !== "place" || !hasAddress) && /להוראות הגעה בוויז/i.test(t)) return false;
            if ((placeMode !== "place" || !hasAddress) && /^וויז\s*:/i.test(t)) return false;
            if ((placeMode !== "place" || !hasAddress) && /^מפות\s*:/i.test(t)) return false;
            if (/להוראות הגעה בוויז/i.test(t) && (!wazeFilled || /"קישור וויז"/.test(t))) return false;
            if (/^וויז\s*:/i.test(t) && (!wazeFilled || /"קישור וויז"/.test(t))) return false;
            if (/^מפות\s*:/i.test(t) && (!mapsFilled || /"קישור מפות"/.test(t))) return false;
            if (placeMode === "none" && /^(מיקום|קישור לזום|קישור לפגישה|כתובת|כתובתנו)\b/i.test(t)) return false;
            if (/^כתובתנו\s+(?:הינה|היא)\s*\.?$/i.test(t)) return false;
            return true;
        })
        .join("\n")
        .replace(/\n{3,}/g, "\n\n");

    return out.trim();
}

/**
 * Preview-first SMS template card for calendar reminder / invite messages.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.hint]
 * @param {string} props.value
 * @param {(next: string) => void} props.onChange
 * @param {Record<string, string>} [props.previewValues] — shared tokens (date, firm, …)
 * @param {{ name?: string, phone?: string, userId?: number|string }[]} [props.previewRecipients]
 *        When set, preview loops each client with their own {{recipientName}}.
 * @param {string[]} [props.vars]
 * @param {string[]} [props.excludeVars] — e.g. hide rsvpUrl on reminder templates
 * @param {string} [props.defaultValue] — for reset
 * @param {boolean} [props.defaultOpen]
 */
export default function CalendarSmsTemplateEditor({
    title,
    hint,
    value,
    onChange,
    previewValues = {},
    previewRecipients = null,
    vars = CALENDAR_SMS_VARS,
    excludeVars = [],
    defaultValue = "",
    defaultOpen = false,
}) {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(!!defaultOpen);
    const textareaRef = useRef(null);
    const selectionRef = useRef({ start: 0, end: 0 });

    const allowed = useMemo(() => {
        const exclude = new Set((excludeVars || []).map(String));
        return (vars || CALENDAR_SMS_VARS).filter((k) => !exclude.has(k));
    }, [vars, excludeVars]);

    const groups = useMemo(
        () => CHIP_GROUPS
            .map((g) => ({ ...g, keys: g.keys.filter((k) => allowed.includes(k)) }))
            .filter((g) => g.keys.length > 0),
        [allowed]
    );

    const recipientPreviews = useMemo(() => {
        const list = Array.isArray(previewRecipients)
            ? previewRecipients.filter((r) => r && (r.name || r.phone || r.userId))
            : [];
        if (list.length > 0) {
            return list.map((r, idx) => {
                const name = String(r.name || "").trim()
                    || String(r.phone || "").trim()
                    || t("calendar.smsRecipientFallback", { index: idx + 1 });
                return {
                    key: String(r.userId || r.phone || name || idx),
                    label: name,
                    phone: r.phone || "",
                    text: renderSmsPreview(value, {
                        ...previewValues,
                        recipientName: name,
                        clientsNames: previewValues?.clientsNames || name,
                    }),
                };
            });
        }
        return [{
            key: "primary",
            label: previewValues?.recipientName || "",
            phone: "",
            text: renderSmsPreview(value, previewValues),
        }];
    }, [previewRecipients, previewValues, value, t]);

    const rememberSelection = () => {
        const el = textareaRef.current;
        if (!el) return;
        selectionRef.current = {
            start: el.selectionStart ?? String(value || "").length,
            end: el.selectionEnd ?? String(value || "").length,
        };
    };

    const insertAtCaret = (token) => {
        const current = String(value ?? "");
        const el = textareaRef.current;
        let start = selectionRef.current.start;
        let end = selectionRef.current.end;
        if (el && typeof el.selectionStart === "number") {
            start = el.selectionStart;
            end = el.selectionEnd;
        }
        if (!Number.isFinite(start) || start < 0) start = current.length;
        if (!Number.isFinite(end) || end < 0) end = start;
        const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
        onChange?.(next);
        const caret = start + token.length;
        selectionRef.current = { start: caret, end: caret };
        requestAnimationFrame(() => {
            const node = textareaRef.current;
            if (!node) return;
            try {
                node.focus();
                node.setSelectionRange(caret, caret);
            } catch { /* ignore */ }
        });
    };

    const canReset = defaultValue != null
        && String(defaultValue).length > 0
        && String(value ?? "") !== String(defaultValue);

    return (
        <SimpleContainer className="lw-calendarSmsEditor">
            <SimpleContainer className="lw-calendarSmsEditor__header">
                <TextBold14 className="lw-calendarSmsEditor__title">{title}</TextBold14>
                {hint ? (
                    <Text12 className="lw-calendarSmsEditor__hint">{hint}</Text12>
                ) : null}
            </SimpleContainer>

            <SimpleContainer className="lw-calendarSmsEditor__preview" aria-live="polite">
                <Text12 className="lw-calendarSmsEditor__previewLabel">
                    {t("calendar.smsPreviewTitle")}
                    {recipientPreviews.length > 1
                        ? ` (${recipientPreviews.length})`
                        : ""}
                </Text12>
                {recipientPreviews.map((item) => (
                    <div key={item.key} className="lw-calendarSmsEditor__bubble">
                        {(recipientPreviews.length > 1 || item.label) ? (
                            <Text12 className="lw-calendarSmsEditor__recipientTag">
                                {item.label}
                                {item.phone ? ` · ${item.phone}` : ""}
                            </Text12>
                        ) : null}
                        <Text14 className="lw-calendarSmsEditor__bubbleBody">{item.text}</Text14>
                    </div>
                ))}
            </SimpleContainer>

            <SimpleContainer className="lw-calendarSmsEditor__actions">
                <SecondaryButton
                    onPress={() => setEditing((v) => !v)}
                >
                    {editing
                        ? t("calendar.smsEditClose", { defaultValue: "סגור עריכה" })
                        : t("calendar.smsEditToggle", { defaultValue: "ערוך הודעה" })}
                </SecondaryButton>
                {editing && canReset && (
                    <TertiaryButton
                        onPress={() => onChange?.(String(defaultValue))}
                        hasBorder
                    >
                        {t("calendar.smsResetDefault", { defaultValue: "שחזר ברירת מחדל" })}
                    </TertiaryButton>
                )}
            </SimpleContainer>

            {editing && (
                <SimpleContainer className="lw-calendarSmsEditor__edit">
                    <Text12 className="lw-calendarSmsEditor__insertHint">
                        {t("calendar.smsInsertHint", {
                            defaultValue: "לחצו על תווית כדי להוסיף במקום הסמן",
                        })}
                    </Text12>

                    {groups.map((group) => (
                        <SimpleContainer key={group.id} className="lw-calendarSmsEditor__group">
                            <Text12 className="lw-calendarSmsEditor__groupLabel">
                                {t(group.labelKey, {
                                    defaultValue:
                                        group.id === "event" ? "פרטי אירוע"
                                            : group.id === "whenWhere" ? "זמן ומקום"
                                                : "קישורים",
                                })}
                            </Text12>
                            <SimpleContainer className="lw-calendarSmsEditor__chips">
                                {group.keys.map((key) => (
                                    <SimpleButton
                                        key={key}
                                        className="lw-calendarSmsEditor__chip"
                                        onPress={() => insertAtCaret(`{{${key}}}`)}
                                        tabIndex={-1}
                                        title={`{{${key}}}`}
                                        aria-label={`${CALENDAR_SMS_VAR_LABELS[key] || key} {{${key}}}`}
                                    >
                                        <span className="lw-calendarSmsEditor__chipLabel">
                                            {CALENDAR_SMS_VAR_LABELS[key] || key}
                                        </span>
                                        <span className="lw-calendarSmsEditor__chipKey">{`{{${key}}}`}</span>
                                    </SimpleButton>
                                ))}
                            </SimpleContainer>
                        </SimpleContainer>
                    ))}

                    <SimpleTextArea
                        className="lw-calendarSmsEditor__textarea"
                        value={value || ""}
                        onChange={onChange}
                        rows={8}
                        dir="rtl"
                        textareaRef={textareaRef}
                        onSelect={rememberSelection}
                        onClick={rememberSelection}
                        onKeyUp={rememberSelection}
                    />
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
}
