// src/screens/platformSettingsScreen/PlatformSettingsScreen.js
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useScreenSize } from "../../providers/ScreenSizeProvider";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import SimpleButton from "../../components/simpleComponents/SimpleButton";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleInput from "../../components/simpleComponents/SimpleInput";
import SimpleTextArea from "../../components/simpleComponents/SimpleTextArea";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import TertiaryButton from "../../components/styledComponents/buttons/TertiaryButton";

import { Text12, Text14, TextBold14, TextBold18, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";

import platformSettingsApi from "../../api/platformSettingsApi";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";

import "./PlatformSettingsScreen.scss";

export const PlatformSettingsScreenName = "/PlatformSettingsScreen";

// ─── Category definitions with Hebrew labels ────────────────────────
const CATEGORIES = [
    { key: "messaging", label: "הודעות ואימייל", icon: "📧" },
    { key: "signing", label: "חתימה דיגיטלית", icon: "✍️" },
    { key: "firm", label: "פרטי המשרד", icon: "🏢" },
    { key: "templates", label: "תבניות SMS", icon: "📝" },
    { key: "emailTemplates", label: "תבניות אימייל", icon: "✉️" },
    { key: "reminders", label: "תזכורות", icon: "⏰" },
    { key: "channels", label: "ערוצי התראות", icon: "📡" },
    { key: "admins", label: "מנהלי פלטפורמה", icon: "👤" },
];

// ─── Setting Input Component ────────────────────────────────────────
function SettingInput({ setting, value, onChange, isTemplate = false }) {
    const inputValue = value ?? setting.effectiveValue ?? "";

    if (setting.valueType === "boolean") {
        return (
            <SimpleContainer className="lw-platformSettings__toggle">
                <input
                    type="checkbox"
                    checked={inputValue === true || inputValue === "true" || inputValue === "1"}
                    onChange={(e) => onChange(e.target.checked ? "true" : "false")}
                />
                <SimpleContainer className="lw-platformSettings__toggleSlider" />
                <Text14 className="lw-platformSettings__toggleLabel">
                    {inputValue === true || inputValue === "true" || inputValue === "1" ? "פעיל" : "לא פעיל"}
                </Text14>
            </SimpleContainer>
        );
    }

    if (setting.valueType === "time") {
        return (
            <SimpleInput
                className="lw-platformSettings__input"
                type="time"
                value={inputValue}
                onChange={(e) => onChange(e.target.value)}
                title={setting.label || ""}
                timeToWaitInMilli={0}
            />
        );
    }

    if (setting.valueType === "number") {
        return (
            <SimpleInput
                className="lw-platformSettings__input"
                type="number"
                value={inputValue}
                onChange={(e) => onChange(e.target.value)}
                title={setting.label || ""}
                timeToWaitInMilli={0}
            />
        );
    }

    // Use textarea for SMS templates (long text with variables)
    if (isTemplate) {
        return (
            <SimpleTextArea
                className="lw-platformSettings__textarea"
                value={inputValue}
                onChange={(val) => onChange(val)}
                title={setting.label || ""}
                rows={4}
                dir="rtl"
            />
        );
    }

    return (
        <SimpleInput
            className="lw-platformSettings__input"
            type="text"
            value={inputValue}
            onChange={(e) => onChange(e.target.value)}
            title={setting.label || ""}
            timeToWaitInMilli={0}
        />
    );
}

// ─── Channel Toggle Row ─────────────────────────────────────────────
function ChannelRow({ channel, onToggle }) {
    return (
        <SimpleContainer className="lw-platformSettings__channelRow">
            <TextBold14 className="lw-platformSettings__channelName">
                {channel.label || channel.notification_type}
            </TextBold14>
            <SimpleContainer className="lw-platformSettings__channelToggles">
                <SimpleContainer className="lw-platformSettings__channelToggle">
                    <Text12 className="lw-platformSettings__channelToggleLabel">Push</Text12>
                    <input
                        type="checkbox"
                        checked={channel.push_enabled}
                        onChange={() => onToggle(channel.notification_type, "pushEnabled", !channel.push_enabled)}
                    />
                </SimpleContainer>
                <SimpleContainer className="lw-platformSettings__channelToggle">
                    <Text12 className="lw-platformSettings__channelToggleLabel">אימייל</Text12>
                    <input
                        type="checkbox"
                        checked={channel.email_enabled}
                        onChange={() => onToggle(channel.notification_type, "emailEnabled", !channel.email_enabled)}
                    />
                </SimpleContainer>
                <SimpleContainer className="lw-platformSettings__channelToggle">
                    <Text12 className="lw-platformSettings__channelToggleLabel">SMS</Text12>
                    <input
                        type="checkbox"
                        checked={channel.sms_enabled}
                        onChange={() => onToggle(channel.notification_type, "smsEnabled", !channel.sms_enabled)}
                    />
                </SimpleContainer>
                <SimpleContainer className="lw-platformSettings__channelToggle">
                    <Text12 className="lw-platformSettings__channelToggleLabel">מנהל תיק</Text12>
                    <input
                        type="checkbox"
                        checked={channel.manager_cc}
                        onChange={() => onToggle(channel.notification_type, "managerCc", !channel.manager_cc)}
                    />
                </SimpleContainer>
                <SimpleContainer className="lw-platformSettings__channelToggle">
                    <Text12 className="lw-platformSettings__channelToggleLabel">מנהל מערכת</Text12>
                    <input
                        type="checkbox"
                        checked={channel.admin_cc}
                        onChange={() => onToggle(channel.notification_type, "adminCc", !channel.admin_cc)}
                    />
                </SimpleContainer>
            </SimpleContainer>
        </SimpleContainer>
    );
}

// ─── Admin Row ──────────────────────────────────────────────────────
function AdminRow({ admin, onRemove, currentUserId }) {
    const isCurrentUser = admin.user_id === currentUserId;
    return (
        <SimpleContainer className="lw-platformSettings__adminRow">
            <SimpleContainer className="lw-platformSettings__adminInfo">
                <TextBold14 className="lw-platformSettings__adminName">{admin.user_name || "ללא שם"}</TextBold14>
                <Text12 className="lw-platformSettings__adminPhone">{admin.phone}</Text12>
            </SimpleContainer>
            {!isCurrentUser && (
                <SecondaryButton
                    className="lw-platformSettings__removeBtn"
                    onPress={() => onRemove(admin.user_id)}
                >
                    הסר
                </SecondaryButton>
            )}
        </SimpleContainer>
    );
}

// ─── SMS Variable Buttons (for templates tab) ───────────────────────
// Keys MUST match the camelCase names used by backend renderTemplate()
const SMS_TEMPLATE_VARS = {
    // ── Case lifecycle ──
    CASE_CREATED_SMS: ["recipientName", "caseName", "caseNumber", "stageName", "managerName", "websiteUrl"],
    CASE_STAGE_CHANGED_SMS: ["recipientName", "caseName", "caseNumber", "stageName", "managerName", "websiteUrl"],
    CASE_CLOSED_SMS: ["recipientName", "caseName", "caseNumber", "stageName", "managerName", "websiteUrl"],
    CASE_REOPENED_SMS: ["recipientName", "caseName", "caseNumber", "stageName", "managerName", "websiteUrl"],
    // ── Per-field case changes ──
    CASE_NAME_CHANGE_SMS: ["recipientName", "caseName", "caseNumber", "managerName", "websiteUrl"],
    CASE_TYPE_CHANGE_SMS: ["recipientName", "caseName", "caseNumber", "managerName", "websiteUrl"],
    CASE_MANAGER_CHANGE_SMS: ["recipientName", "caseName", "caseNumber", "managerName", "websiteUrl"],
    CASE_COMPANY_CHANGE_SMS: ["recipientName", "caseName", "caseNumber", "websiteUrl"],
    CASE_EST_DATE_CHANGE_SMS: ["recipientName", "caseName", "caseNumber", "websiteUrl"],
    CASE_LICENSE_CHANGE_SMS: ["recipientName", "caseName", "caseNumber", "websiteUrl"],
    CASE_TAGGED_SMS: ["recipientName", "caseName", "websiteUrl"],
    // ── Signing ──
    SIGN_INVITE_SMS: ["recipientName", "documentName", "websiteUrl"],
    DOC_SIGNED_SMS: ["recipientName", "documentName", "websiteUrl"],
    DOC_REJECTED_SMS: ["recipientName", "documentName", "rejectionReason", "websiteUrl"],
    SIGN_REMINDER_SMS: ["recipientName", "documentName", "websiteUrl"],
    // ── Other ──
    BIRTHDAY_SMS: ["recipientName", "firmName", "websiteUrl"],
    GENERAL_SMS: ["recipientName", "firmName", "websiteUrl"],
    PAYMENT_SMS: ["recipientName", "firmName", "websiteUrl"],
    LICENSE_RENEWAL_SMS: ["recipientName", "firmName", "websiteUrl"],
    // ── Client ──
    NEW_CLIENT_SMS: ["recipientName", "firmName", "websiteUrl"],
};

// Hebrew labels for SMS template variables (camelCase keys)
const VAR_LABELS = {
    recipientName: "שם הנמען",
    caseName: "שם תיק",
    caseNumber: "מספר תיק",
    stageName: "שלב נוכחי",
    managerName: "שם מנהל התיק",
    firmName: "שם המשרד",
    websiteUrl: "קישור לאתר",
    documentName: "שם מסמך",
    rejectionReason: "סיבת דחייה",
    // Email template variables (snake_case — used by [[placeholder]] system)
    recipient_name: "שם הנמען",
    case_title: "שם תיק",
    case_number: "מספר תיק",
    case_stage: "שלב נוכחי",
    manager_name: "שם מנהל התיק",
    lawyer_name: "עו״ד מטפל",
    document_name: "שם מסמך",
    action_url: "קישור פעולה",
    firm_name: "שם המשרד",
    rejection_reason: "סיבת דחייה",
    signed_document_url: "קישור מסמך חתום",
    evidence_certificate_url: "קישור אישור ראייתי",
};

// ─── Mapping: template key → notification_type (for channel-based filtering) ──
// Email template keys
const EMAIL_KEY_TO_NOTIF_TYPE = {
    CASE_CREATED: 'CASE_CREATED',
    CASE_NAME_CHANGE: 'CASE_NAME_CHANGE',
    CASE_TYPE_CHANGE: 'CASE_TYPE_CHANGE',
    CASE_STAGE_CHANGE: 'CASE_STAGE_CHANGE',
    CASE_CLOSED: 'CASE_CLOSED',
    CASE_REOPENED: 'CASE_REOPENED',
    CASE_MANAGER_CHANGE: 'CASE_MANAGER_CHANGE',
    CASE_EST_DATE_CHANGE: 'CASE_EST_DATE_CHANGE',
    CASE_LICENSE_CHANGE: 'CASE_LICENSE_CHANGE',
    CASE_COMPANY_CHANGE: 'CASE_COMPANY_CHANGE',
    CASE_TAGGED: 'CASE_TAGGED',
    SIGN_INVITE: 'SIGN_INVITE',
    SIGN_REMINDER: 'SIGN_REMINDER',
    DOC_SIGNED: 'DOC_SIGNED',
    DOC_SIGNED_ATTACHMENTS: 'DOC_SIGNED',
    DOC_REJECTED: 'DOC_REJECTED',
    NEW_CLIENT: 'NEW_CLIENT',
};
// SMS template keys (setting_key → notification_type)
const SMS_KEY_TO_NOTIF_TYPE = {
    CASE_CREATED_SMS: 'CASE_CREATED',
    CASE_STAGE_CHANGED_SMS: 'CASE_STAGE_CHANGE',
    CASE_CLOSED_SMS: 'CASE_CLOSED',
    CASE_REOPENED_SMS: 'CASE_REOPENED',
    CASE_NAME_CHANGE_SMS: 'CASE_NAME_CHANGE',
    CASE_TYPE_CHANGE_SMS: 'CASE_TYPE_CHANGE',
    CASE_MANAGER_CHANGE_SMS: 'CASE_MANAGER_CHANGE',
    CASE_COMPANY_CHANGE_SMS: 'CASE_COMPANY_CHANGE',
    CASE_EST_DATE_CHANGE_SMS: 'CASE_EST_DATE_CHANGE',
    CASE_LICENSE_CHANGE_SMS: 'CASE_LICENSE_CHANGE',
    CASE_TAGGED_SMS: 'CASE_TAGGED',
    SIGN_INVITE_SMS: 'SIGN_INVITE',
    DOC_SIGNED_SMS: 'DOC_SIGNED',
    DOC_REJECTED_SMS: 'DOC_REJECTED',
    SIGN_REMINDER_SMS: 'SIGN_REMINDER',
    BIRTHDAY_SMS: 'BIRTHDAY',
    GENERAL_SMS: 'GENERAL',
    PAYMENT_SMS: 'PAYMENT',
    LICENSE_RENEWAL_SMS: 'LICENSE_RENEWAL',
    NEW_CLIENT_SMS: 'NEW_CLIENT',
};

function SmsVarButtons({ templateKey, onInsert }) {
    const vars = SMS_TEMPLATE_VARS[templateKey];
    if (!vars || vars.length === 0) return null;
    return (
        <SimpleContainer className="lw-platformSettings__varButtons">
            <Text12 className="lw-platformSettings__varButtonsLabel">משתנים זמינים:</Text12>
            <SimpleContainer className="lw-platformSettings__varButtonsRow">
                {vars.map(v => (
                    <TertiaryButton
                        key={v}
                        onPress={() => onInsert(`{{${v}}}`)}
                    >
                        {VAR_LABELS[v] || v}
                    </TertiaryButton>
                ))}
            </SimpleContainer>
        </SimpleContainer>
    );
}

// ─── Email Template Editor ──────────────────────────────────────────
const CONTENT_DIV_REGEX = /(<div style="font-size:16px;line-height:1\.7;">)([\s\S]*?)(<\/div>)/;

function htmlToPlainText(html) {
    const match = html.match(CONTENT_DIV_REGEX);
    if (!match) return "";
    let text = match[2];
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<span[^>]*>/gi, "").replace(/<\/span>/gi, "");
    text = text.replace(/&nbsp;/g, " ");
    text = text.replace(/<[^>]+>/g, "");
    return text.trim();
}

function plainTextToHtml(fullHtml, newText) {
    let htmlContent = newText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
    htmlContent = htmlContent.replace(
        /\[\[([^\]]+)\]\]/g,
        '<span style="font-weight:600;color:#1A365D;">[[$1]]</span>'
    );
    return fullHtml.replace(CONTENT_DIV_REGEX, `$1${htmlContent}$3`);
}

function EmailTemplateEditor({ template, onSave, saving }) {
    const [subject, setSubject] = useState(template.subject_template || "");
    const [htmlBody, setHtmlBody] = useState(template.html_body || "");
    const [messageText, setMessageText] = useState(() => htmlToPlainText(template.html_body || ""));
    const [showCode, setShowCode] = useState(false);
    const iframeRef = useRef(null);
    const textareaRef = useRef(null);

    useEffect(() => {
        setSubject(template.subject_template || "");
        setHtmlBody(template.html_body || "");
        setMessageText(htmlToPlainText(template.html_body || ""));
        setShowCode(false);
    }, [template.template_key]);

    const availableVars = useMemo(() => {
        try {
            return Array.isArray(template.available_vars) ? template.available_vars : JSON.parse(template.available_vars || "[]");
        } catch { return []; }
    }, [template.available_vars]);

    const hasChanges = subject !== (template.subject_template || "") || htmlBody !== (template.html_body || "");

    // Handle plain-text message changes → update htmlBody
    const handleMessageChange = useCallback((val) => {
        setMessageText(val);
        setHtmlBody(prev => plainTextToHtml(prev, val));
    }, []);

    // Handle raw HTML changes → update messageText too
    const handleHtmlChange = useCallback((e) => {
        const newHtml = e.target.value;
        setHtmlBody(newHtml);
        setMessageText(htmlToPlainText(newHtml));
    }, []);

    // Insert variable into message text
    const insertVar = useCallback((varName) => {
        const placeholder = `[[${varName}]]`;
        if (showCode && textareaRef.current) {
            const ta = textareaRef.current;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const newHtml = htmlBody.substring(0, start) + placeholder + htmlBody.substring(end);
            setHtmlBody(newHtml);
            setMessageText(htmlToPlainText(newHtml));
            setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + placeholder.length; }, 0);
        } else {
            setMessageText(prev => {
                const newText = prev + placeholder;
                setHtmlBody(h => plainTextToHtml(h, newText));
                return newText;
            });
        }
    }, [htmlBody, showCode]);

    // Update preview iframe
    useEffect(() => {
        if (iframeRef.current) {
            const doc = iframeRef.current.contentDocument;
            doc.open();
            doc.write(htmlBody);
            doc.close();
        }
    }, [htmlBody]);

    return (
        <SimpleContainer className="lw-platformSettings__emailEditor">
            <SimpleContainer className="lw-platformSettings__emailEditorHeader">
                <TextBold14>{template.label}</TextBold14>
            </SimpleContainer>

            {/* Subject */}
            <SimpleContainer className="lw-platformSettings__emailEditorField">
                <Text12 className="lw-platformSettings__emailEditorLabel">נושא האימייל:</Text12>
                <SimpleInput
                    className="lw-platformSettings__input"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    title="נושא"
                    timeToWaitInMilli={0}
                />
            </SimpleContainer>

            {/* Message text (simple mode) or HTML code (advanced) */}
            <SimpleContainer className="lw-platformSettings__emailEditorField">
                <SimpleContainer className="lw-platformSettings__emailEditorLabelRow">
                    <Text12 className="lw-platformSettings__emailEditorLabel">
                        {showCode ? "קוד HTML:" : "תוכן ההודעה:"}
                    </Text12>
                    <TertiaryButton onPress={() => setShowCode(prev => !prev)}>
                        {showCode ? "חזרה למצב פשוט" : "עריכת קוד HTML"}
                    </TertiaryButton>
                </SimpleContainer>

                {showCode ? (
                    <textarea
                        ref={textareaRef}
                        className="lw-platformSettings__emailEditorTextarea"
                        value={htmlBody}
                        onChange={handleHtmlChange}
                        dir="ltr"
                        rows={20}
                    />
                ) : (
                    <SimpleTextArea
                        className="lw-platformSettings__textarea"
                        value={messageText}
                        onChange={handleMessageChange}
                        title="תוכן ההודעה"
                        rows={6}
                        dir="rtl"
                    />
                )}
            </SimpleContainer>

            {/* Variable chips */}
            <SimpleContainer className="lw-platformSettings__varButtons">
                <Text12 className="lw-platformSettings__varButtonsLabel">משתנים זמינים (לחץ להוספה):</Text12>
                <SimpleContainer className="lw-platformSettings__varButtonsRow">
                    {availableVars.map(v => (
                        <TertiaryButton
                            key={v}
                            onPress={() => insertVar(v)}
                        >
                            {VAR_LABELS[v] || v}
                        </TertiaryButton>
                    ))}
                </SimpleContainer>
            </SimpleContainer>

            {/* Live preview */}
            <SimpleContainer className="lw-platformSettings__emailEditorField">
                <Text12 className="lw-platformSettings__emailEditorLabel">תצוגה מקדימה:</Text12>
                <iframe
                    ref={iframeRef}
                    className="lw-platformSettings__emailPreviewFrame"
                    title="Email Preview"
                    sandbox="allow-same-origin"
                />
            </SimpleContainer>

            {hasChanges && (
                <SimpleContainer className="lw-platformSettings__emailEditorActions">
                    <PrimaryButton
                        onPress={() => onSave(template.template_key, { subjectTemplate: subject, htmlBody })}
                        disabled={saving}
                        isPerforming={saving}
                    >
                        {saving ? "שומר..." : "שמור תבנית"}
                    </PrimaryButton>
                    <SecondaryButton
                        onPress={() => { setSubject(template.subject_template || ""); setHtmlBody(template.html_body || ""); setMessageText(htmlToPlainText(template.html_body || "")); }}
                    >
                        ביטול
                    </SecondaryButton>
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
}

// ─── Main Screen ────────────────────────────────────────────────────
export default function PlatformSettingsScreen() {
    useTranslation();
    const { isSmallScreen } = useScreenSize();

    const [activeTab, setActiveTab] = useState("messaging");
    const [editedValues, setEditedValues] = useState({});
    const [editedChannels, setEditedChannels] = useState({});
    const [localChannels, setLocalChannels] = useState(null);
    const [newAdminPhone, setNewAdminPhone] = useState("");
    const [saveMessage, setSaveMessage] = useState("");

    // Email templates state
    const [emailTemplates, setEmailTemplates] = useState([]);
    const [selectedEmailKey, setSelectedEmailKey] = useState(null);
    const [emailSaving, setEmailSaving] = useState(false);

    // Load all settings
    const { result: data, isPerforming: isLoading, performRequest: reload } = useAutoHttpRequest(
        platformSettingsApi.getAll,
        {
            onSuccess: (d) => {
                if (d?.channels) setLocalChannels(d.channels);
            },
            onFailure: () => { },
        }
    );

    // Load admins
    const { result: adminsData, performRequest: reloadAdmins } = useAutoHttpRequest(
        platformSettingsApi.getAdmins,
        { onFailure: () => { } }
    );

    // Load email templates
    const { isPerforming: isLoadingEmailTemplates, performRequest: reloadEmailTemplates } = useAutoHttpRequest(
        platformSettingsApi.getEmailTemplates,
        {
            onSuccess: (d) => {
                const list = d?.templates || d || [];
                setEmailTemplates(list);
                if (list.length > 0 && !selectedEmailKey) setSelectedEmailKey(list[0].template_key);
            },
            onFailure: () => { },
        }
    );

    // Save email template handler
    const handleSaveEmailTemplate = useCallback(async (templateKey, data) => {
        setEmailSaving(true);
        try {
            await platformSettingsApi.updateEmailTemplate(templateKey, data);
            setSaveMessage("✅ התבנית נשמרה בהצלחה");
            setTimeout(() => setSaveMessage(""), 3000);
            await reloadEmailTemplates();
        } catch (err) {
            setSaveMessage("❌ שגיאה בשמירת התבנית");
            setTimeout(() => setSaveMessage(""), 3000);
        } finally {
            setEmailSaving(false);
        }
    }, [reloadEmailTemplates]);

    // Save state (manual — we call the API directly to properly handle errors)
    const [isSaving, setIsSaving] = useState(false);

    // Add admin handler
    const { isPerforming: isAddingAdmin, performRequest: doAddAdmin } = useHttpRequest(
        platformSettingsApi.addAdmin,
        () => {
            setNewAdminPhone("");
            reloadAdmins();
            setSaveMessage("✅ מנהל נוסף בהצלחה");
            setTimeout(() => setSaveMessage(""), 3000);
        }
    );

    // Remove admin handler
    const { performRequest: doRemoveAdmin } = useHttpRequest(
        platformSettingsApi.removeAdmin,
        () => {
            reloadAdmins();
            setSaveMessage("✅ מנהל הוסר");
            setTimeout(() => setSaveMessage(""), 3000);
        }
    );

    // Channel toggle handler (deferred — saved on "שמור שינויים")
    const handleChannelToggle = useCallback((type, field, value) => {
        const fieldMap = {
            pushEnabled: 'push_enabled',
            emailEnabled: 'email_enabled',
            smsEnabled: 'sms_enabled',
            adminCc: 'admin_cc',
            managerCc: 'manager_cc',
        };
        const dbField = fieldMap[field] || field;
        setLocalChannels(prev => prev?.map(ch =>
            ch.notification_type === type
                ? { ...ch, [dbField]: value }
                : ch
        ));
        setEditedChannels(prev => {
            const existing = prev[type] || {};
            return { ...prev, [type]: { ...existing, [field]: value } };
        });
    }, []);

    // Setting change handler
    const handleSettingChange = useCallback((category, key, value) => {
        setEditedValues(prev => ({ ...prev, [`${category}:${key}`]: { category, key, value } }));
    }, []);

    // Save all edited settings + channels
    const handleSave = useCallback(async () => {
        const settingsArray = Object.values(editedValues);
        const channelEntries = Object.entries(editedChannels);

        if (settingsArray.length === 0 && channelEntries.length === 0) return;

        setIsSaving(true);
        try {
            // Save settings — call API directly so we can check response status
            if (settingsArray.length > 0) {
                const res = await platformSettingsApi.updateSettings(settingsArray);
                if (res.status !== 200 && res.status !== 201) {
                    const serverMsg = res.data?.message || 'שגיאה בשמירת הגדרות';
                    setSaveMessage(`❌ ${serverMsg}`);
                    setTimeout(() => setSaveMessage(""), 6000);
                    setIsSaving(false);
                    return; // Don't proceed — let the user fix the issue first
                }
            }
            // Save channels
            for (const [type, fields] of channelEntries) {
                const res = await platformSettingsApi.updateChannel(type, fields);
                if (res.status !== 200 && res.status !== 201) {
                    const serverMsg = res.data?.message || 'שגיאה בעדכון ערוץ התראה';
                    setSaveMessage(`❌ ${serverMsg}`);
                    setTimeout(() => setSaveMessage(""), 6000);
                    setIsSaving(false);
                    return;
                }
            }
            setEditedChannels({});
            setEditedValues({});
            setSaveMessage("✅ ההגדרות נשמרו בהצלחה");
            reload();
            setTimeout(() => setSaveMessage(""), 3000);
        } catch (err) {
            const serverMsg = err?.response?.data?.message || err?.data?.message || err?.message || '';
            setSaveMessage(`❌ ${serverMsg || 'שגיאה בשמירה'}`);
            setTimeout(() => setSaveMessage(""), 6000);
        } finally {
            setIsSaving(false);
        }
    }, [editedValues, editedChannels, reload]);

    // Add admin
    const handleAddAdmin = useCallback(() => {
        if (!newAdminPhone.trim()) return;
        doAddAdmin({ phoneNumber: newAdminPhone.trim() });
    }, [newAdminPhone, doAddAdmin]);

    // Remove admin
    const handleRemoveAdmin = useCallback((userId) => {
        if (!window.confirm("האם אתה בטוח שברצונך להסיר מנהל זה?")) return;
        doRemoveAdmin(userId);
    }, [doRemoveAdmin]);

    const settings = data?.settings || {};
    const channels = localChannels || data?.channels || [];
    const admins = adminsData?.admins || [];
    const hasEdits = Object.keys(editedValues).length > 0 || Object.keys(editedChannels).length > 0;

    const currentUserId = useMemo(() => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return null;
            const payload = JSON.parse(atob(token.split(".")[1]));
            return payload?.userid || payload?.UserId;
        } catch { return null; }
    }, []);

    // Render category content
    const renderContent = () => {
        if (isLoading) {
            return (
                <SimpleContainer className="lw-platformSettings__loading">
                    <SimpleLoader />
                </SimpleContainer>
            );
        }

        // Channels tab
        if (activeTab === "channels") {
            return (
                <SimpleCard className="lw-platformSettings__card">
                    <TextBold18>ערוצי התראות</TextBold18>
                    <Text14 className="lw-platformSettings__subtitle">
                        בחר אילו ערוצים יהיו פעילים עבור כל סוג התראה
                    </Text14>
                    <SimpleContainer className="lw-platformSettings__channelGrid">
                        <SimpleContainer className="lw-platformSettings__channelHeader">
                            <TextBold14 className="lw-platformSettings__channelName">סוג התראה</TextBold14>
                            <SimpleContainer className="lw-platformSettings__channelToggles">
                                <SimpleContainer className="lw-platformSettings__channelToggle">
                                    <Text12>Push</Text12>
                                </SimpleContainer>
                                <SimpleContainer className="lw-platformSettings__channelToggle">
                                    <Text12>אימייל</Text12>
                                </SimpleContainer>
                                <SimpleContainer className="lw-platformSettings__channelToggle">
                                    <Text12>SMS</Text12>
                                </SimpleContainer>
                                <SimpleContainer className="lw-platformSettings__channelToggle">
                                    <Text12>העתק למנהל תיק</Text12>
                                </SimpleContainer>
                                <SimpleContainer className="lw-platformSettings__channelToggle">
                                    <Text12>העתק למנהל מערכת</Text12>
                                </SimpleContainer>
                            </SimpleContainer>
                        </SimpleContainer>
                        {channels.map(ch => (
                            <ChannelRow
                                key={ch.notification_type}
                                channel={ch}
                                onToggle={handleChannelToggle}
                            />
                        ))}
                    </SimpleContainer>
                </SimpleCard>
            );
        }

        // Admins tab
        if (activeTab === "admins") {
            return (
                <SimpleCard className="lw-platformSettings__card">
                    <TextBold18>מנהלי פלטפורמה</TextBold18>
                    <Text14 className="lw-platformSettings__subtitle">
                        נהל את רשימת מנהלי הפלטפורמה שיכולים לגשת לדף זה
                    </Text14>

                    <SimpleContainer className="lw-platformSettings__adminList">
                        {admins.map(admin => (
                            <AdminRow
                                key={admin.user_id}
                                admin={admin}
                                onRemove={handleRemoveAdmin}
                                currentUserId={currentUserId}
                            />
                        ))}

                    </SimpleContainer>

                    <SimpleContainer className="lw-platformSettings__addAdmin">
                        <SimpleInput
                            className="lw-platformSettings__addAdminInput"
                            title="מספר טלפון של מנהל חדש"
                            value={newAdminPhone}
                            onChange={(e) => setNewAdminPhone(e.target.value)}
                            inputSize="Small"
                            timeToWaitInMilli={0}
                        />
                        <PrimaryButton
                            className="lw-platformSettings__addBtn"
                            onPress={handleAddAdmin}
                            disabled={isAddingAdmin || !newAdminPhone.trim()}
                        >
                            {isAddingAdmin ? "מוסיף..." : "הוסף מנהל"}
                        </PrimaryButton>
                    </SimpleContainer>
                </SimpleCard>
            );
        }

        // Email templates tab
        if (activeTab === "emailTemplates") {
            if (isLoadingEmailTemplates) {
                return (
                    <SimpleContainer className="lw-platformSettings__loading">
                        <SimpleLoader />
                    </SimpleContainer>
                );
            }

            const selectedTemplate = emailTemplates.find(t => t.template_key === selectedEmailKey);

            // Filter email templates: only show templates whose notification type has email enabled
            const channelsArr = localChannels || data?.channels || [];
            const channelMap = {};
            channelsArr.forEach(ch => { channelMap[ch.notification_type] = ch; });
            const filteredEmailTemplates = emailTemplates.filter(t => {
                const notifType = EMAIL_KEY_TO_NOTIF_TYPE[t.template_key];
                if (!notifType) return true; // unknown mapping → show by default
                const ch = channelMap[notifType];
                if (!ch) return true; // no channel config → show by default
                return ch.email_enabled;
            });

            if (filteredEmailTemplates.length === 0) {
                return (
                    <SimpleCard className="lw-platformSettings__card">
                        <TextBold18>תבניות אימייל</TextBold18>
                        <Text14 className="lw-platformSettings__empty">
                            אין תבניות אימייל פעילות. הפעל ערוץ אימייל עבור סוגי התראות בלשונית "ערוצי התראות" כדי לערוך תבניות.
                        </Text14>
                    </SimpleCard>
                );
            }

            // If selected key is not in filtered list, auto-select first
            const activeSelectedTemplate = filteredEmailTemplates.find(t => t.template_key === selectedEmailKey);
            const effectiveSelectedKey = activeSelectedTemplate ? selectedEmailKey : filteredEmailTemplates[0]?.template_key;
            const effectiveTemplate = filteredEmailTemplates.find(t => t.template_key === effectiveSelectedKey);

            return (
                <SimpleContainer className="lw-platformSettings__emailTemplatesLayout">
                    {/* Template list */}
                    <SimpleContainer className="lw-platformSettings__emailTemplateList">
                        <TextBold14 className="lw-platformSettings__emailTemplateListTitle">בחר תבנית</TextBold14>
                        <SimpleContainer className="lw-platformSettings__emailTemplateButtons">
                            {filteredEmailTemplates.map(t => {
                                const isSelected = effectiveSelectedKey === t.template_key;
                                const Button = isSelected ? PrimaryButton : SecondaryButton;
                                return (
                                    <Button
                                        key={t.template_key}
                                        className="lw-platformSettings__emailTemplateBtn"
                                        onPress={() => setSelectedEmailKey(t.template_key)}
                                    >
                                        {t.label}
                                    </Button>
                                );
                            })}
                        </SimpleContainer>
                    </SimpleContainer>

                    {/* Editor area */}
                    <SimpleContainer className="lw-platformSettings__emailTemplateEditorArea">
                        {effectiveTemplate ? (
                            <EmailTemplateEditor
                                key={effectiveTemplate.template_key}
                                template={effectiveTemplate}
                                onSave={handleSaveEmailTemplate}
                                saving={emailSaving}
                            />
                        ) : (
                            <SimpleCard className="lw-platformSettings__card">
                                <Text14>בחר תבנית מהרשימה</Text14>
                            </SimpleCard>
                        )}
                    </SimpleContainer>
                </SimpleContainer>
            );
        }

        // Settings tabs (messaging, signing, firm, reminders, security)
        const categorySettings = settings[activeTab] || {};
        let settingKeys = Object.keys(categorySettings);

        // Filter SMS templates by channel config (sms_enabled)
        if (activeTab === "templates") {
            const channelsArr = localChannels || data?.channels || [];
            const channelMap = {};
            channelsArr.forEach(ch => { channelMap[ch.notification_type] = ch; });
            settingKeys = settingKeys.filter(key => {
                const notifType = SMS_KEY_TO_NOTIF_TYPE[key];
                if (!notifType) return true; // unknown mapping → show by default
                const ch = channelMap[notifType];
                if (!ch) return true; // no channel config → show by default
                return ch.sms_enabled;
            });
        }

        if (settingKeys.length === 0) {
            const emptyMsg = activeTab === "templates"
                ? 'אין תבניות SMS פעילות. הפעל ערוץ SMS עבור סוגי התראות בלשונית "ערוצי התראות" כדי לערוך תבניות.'
                : "אין הגדרות מוגדרות עבור קטגוריה זו";
            return (
                <SimpleCard className="lw-platformSettings__card">
                    {activeTab === "templates" && <TextBold18>תבניות SMS</TextBold18>}
                    <Text14 className="lw-platformSettings__empty">
                        {emptyMsg}
                    </Text14>
                </SimpleCard>
            );
        }

        return (
            <SimpleCard className="lw-platformSettings__card">
                <TextBold18>{CATEGORIES.find(c => c.key === activeTab)?.label}</TextBold18>
                <SimpleContainer className="lw-platformSettings__settingsList">
                    {settingKeys.map(key => {
                        const setting = categorySettings[key];
                        const editKey = `${activeTab}:${key}`;
                        const editedValue = editedValues[editKey]?.value;
                        const currentValue = editedValue ?? setting.effectiveValue ?? "";

                        return (
                            <SimpleContainer key={key} className="lw-platformSettings__settingRow">
                                <SimpleContainer className="lw-platformSettings__settingLabel">
                                    <TextBold14 className="lw-platformSettings__settingName">
                                        {setting.label || key}
                                    </TextBold14>
                                    {activeTab !== "templates" && setting.description && (
                                        <Text12 className="lw-platformSettings__settingDescription">
                                            {setting.description}
                                        </Text12>
                                    )}
                                </SimpleContainer>
                                <SimpleContainer className="lw-platformSettings__settingInput">
                                    <SettingInput
                                        setting={setting}
                                        value={editedValue}
                                        onChange={(val) => handleSettingChange(activeTab, key, val)}
                                        isTemplate={activeTab === "templates"}
                                    />
                                    {/* SMS variable insertion buttons for templates tab */}
                                    {activeTab === "templates" && SMS_TEMPLATE_VARS[key] && (
                                        <SmsVarButtons
                                            templateKey={key}
                                            onInsert={(varStr) => {
                                                const newVal = currentValue + varStr;
                                                handleSettingChange(activeTab, key, newVal);
                                            }}
                                        />
                                    )}
                                </SimpleContainer>
                                {/* SMS template preview */}
                                {activeTab === "templates" && currentValue && (
                                    <SimpleContainer className="lw-platformSettings__smsPreview">
                                        <Text12 className="lw-platformSettings__smsPreviewLabel">תצוגה מקדימה:</Text12>
                                        <SimpleContainer className="lw-platformSettings__smsPreviewBox">
                                            <Text12>{currentValue}</Text12>
                                        </SimpleContainer>
                                    </SimpleContainer>
                                )}
                            </SimpleContainer>
                        );
                    })}
                </SimpleContainer>
            </SimpleCard>
        );
    };

    return (
        <SimpleScreen className="lw-platformSettings">
            {isSmallScreen && <TopToolBarSmallScreen navBarData={getNavBarData} />}
            <SimpleScrollView className="lw-platformSettings__scroll">
                <SimpleContainer className="lw-platformSettings__header">
                    <TextBold24>הגדרות פלטפורמה</TextBold24>
                    {saveMessage && (
                        <Text14 className="lw-platformSettings__saveMessage">{saveMessage}</Text14>
                    )}
                </SimpleContainer>

                <SimpleContainer className="lw-platformSettings__layout">
                    {/* Tabs sidebar */}
                    <SimpleContainer className="lw-platformSettings__tabs">
                        {CATEGORIES.map(cat => (
                            <SimpleButton
                                key={cat.key}
                                className={`lw-platformSettings__tab ${activeTab === cat.key ? "lw-platformSettings__tab--active" : ""}`}
                                onPress={() => setActiveTab(cat.key)}
                            >
                                <Text14 className="lw-platformSettings__tabIcon">{cat.icon}</Text14>
                                <Text14 className="lw-platformSettings__tabLabel">{cat.label}</Text14>
                            </SimpleButton>
                        ))}
                    </SimpleContainer>

                    {/* Content area */}
                    <SimpleContainer className="lw-platformSettings__content">
                        {renderContent()}

                        {/* Save bar (only for settings tabs, not channels/admins/emailTemplates) */}
                        {activeTab !== "admins" && activeTab !== "emailTemplates" && (
                            <SimpleContainer className="lw-platformSettings__saveBar">
                                <PrimaryButton
                                    className="lw-platformSettings__saveBtn"
                                    onPress={handleSave}
                                    disabled={isSaving || !hasEdits}
                                    isPerforming={isSaving}
                                >
                                    {isSaving ? "שומר..." : "שמור שינויים"}
                                </PrimaryButton>
                                {hasEdits && (
                                    <SecondaryButton
                                        className="lw-platformSettings__cancelBtn"
                                        onPress={() => { setEditedValues({}); setEditedChannels({}); reload(); }}
                                    >
                                        ביטול
                                    </SecondaryButton>
                                )}
                            </SimpleContainer>
                        )}
                    </SimpleContainer>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
