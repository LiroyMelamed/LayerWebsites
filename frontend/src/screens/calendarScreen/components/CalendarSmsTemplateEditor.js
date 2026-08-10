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
    "recipientName", "firmName", "date", "time", "address",
    "wazeUrl", "mapsUrl", "rsvpUrl", "firmPhone", "websiteUrl", "lawyerName", "title",
];

export const CALENDAR_SMS_VAR_LABELS = {
    recipientName: "שם הלקוח",
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
};

const CHIP_GROUPS = [
    {
        id: "event",
        labelKey: "calendar.smsVarGroupEvent",
        keys: ["recipientName", "firmName", "title", "lawyerName"],
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
    return String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
        const val = values?.[key];
        if (val != null && String(val).trim()) return String(val).trim();
        return `"${CALENDAR_SMS_VAR_LABELS[key] || key}"`;
    });
}

/**
 * Preview-first SMS template card for calendar reminder / invite messages.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.hint]
 * @param {string} props.value
 * @param {(next: string) => void} props.onChange
 * @param {Record<string, string>} [props.previewValues]
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

    const previewText = useMemo(
        () => renderSmsPreview(value, previewValues),
        [value, previewValues]
    );

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
                </Text12>
                <div className="lw-calendarSmsEditor__bubble">
                    <Text14 className="lw-calendarSmsEditor__bubbleBody">{previewText}</Text14>
                </div>
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
