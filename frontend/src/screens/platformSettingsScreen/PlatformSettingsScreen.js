// src/screens/platformSettingsScreen/PlatformSettingsScreen.js
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useScreenSize } from "../../providers/ScreenSizeProvider";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import SimpleButton from "../../components/simpleComponents/SimpleButton";
import Skeleton from "../../components/simpleComponents/Skeleton";
import SimpleInput from "../../components/simpleComponents/SimpleInput";
import SimpleTextArea from "../../components/simpleComponents/SimpleTextArea";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import TertiaryButton from "../../components/styledComponents/buttons/TertiaryButton";

import { Text12, Text14, TextBold14, TextBold18, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";

import platformSettingsApi from "../../api/platformSettingsApi";
import remindersApi from "../../api/remindersApi";
import TemplateAttachmentsSection from "../../components/templateAttachments/TemplateAttachmentsSection";
import FileUploadBox from "../../components/styledComponents/fileUpload/FileUploadBox";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";

import { usePopup } from "../../providers/PopUpProvider";
import { images } from "../../assets/images/images";
import ConfirmationDialog from "../../components/styledComponents/popups/ConfirmationDialog";
import { AdminStackName } from "../../navigation/AdminStack";
import { MainScreenName } from "../mainScreen/MainScreen";

import "./PlatformSettingsScreen.scss";

export const PlatformSettingsScreenName = "/PlatformSettingsScreen";

// ─── Category definitions ────────────────────────────────────────────
const CATEGORIES = [
    { key: "messaging", labelKey: "platformSettings.cat_messaging", icon: "📧" },
    { key: "signing", labelKey: "platformSettings.cat_signing", icon: "✍️" },
    { key: "firm", labelKey: "platformSettings.cat_firm", icon: "🏢" },
    { key: "templates", labelKey: "platformSettings.cat_templates", icon: "📝" },
    { key: "emailTemplates", labelKey: "platformSettings.cat_emailTemplates", icon: "✉️" },
    { key: "reminders", labelKey: "platformSettings.cat_reminders", icon: "⏰" },
    { key: "channels", labelKey: "platformSettings.cat_channels", icon: "📡" },
    { key: "admins", labelKey: "platformSettings.cat_admins", icon: "👤" },
    { key: "knowledgeDocs", labelKey: "platformSettings.cat_knowledgeDocs", icon: "🤖" },
];

// ─── Setting Input Component ────────────────────────────────────────
function SettingInput({ setting, value, onChange, isTemplate = false }) {
    const { t } = useTranslation();
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
                    {inputValue === true || inputValue === "true" || inputValue === "1" ? t("platformSettings.active") : t("platformSettings.inactive")}
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
    const { t } = useTranslation();
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
                    <Text12 className="lw-platformSettings__channelToggleLabel">{t("platformSettings.email")}</Text12>
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
                    <Text12 className="lw-platformSettings__channelToggleLabel">{t("platformSettings.caseManager")}</Text12>
                    <input
                        type="checkbox"
                        checked={channel.manager_cc}
                        onChange={() => onToggle(channel.notification_type, "managerCc", !channel.manager_cc)}
                    />
                </SimpleContainer>
                <SimpleContainer className="lw-platformSettings__channelToggle">
                    <Text12 className="lw-platformSettings__channelToggleLabel">{t("platformSettings.systemAdmin")}</Text12>
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
    const { t } = useTranslation();
    const isCurrentUser = admin.user_id === currentUserId;
    return (
        <SimpleContainer className="lw-platformSettings__adminRow">
            <SimpleContainer className="lw-platformSettings__adminInfo">
                <TextBold14 className="lw-platformSettings__adminName">{admin.user_name || t("platformSettings.noName")}</TextBold14>
                <Text12 className="lw-platformSettings__adminPhone">{admin.phone}</Text12>
            </SimpleContainer>
            {!isCurrentUser && (
                <SecondaryButton
                    className="lw-platformSettings__removeBtn"
                    onPress={() => onRemove(admin.user_id)}
                >
                    {t("platformSettings.remove")}
                </SecondaryButton>
            )}
        </SimpleContainer>
    );
}

// ─── SMS Variable Buttons (for templates tab) ───────────────────────
// Keys MUST match the camelCase names used by backend renderTemplate()
const SMS_TEMPLATE_VARS = {
    // ── Case lifecycle ──
    CASE_CREATED_SMS: ["recipientName", "caseName", "stageName", "managerName", "websiteUrl"],
    CASE_STAGE_CHANGED_SMS: ["recipientName", "caseName", "stageName", "managerName", "websiteUrl"],
    CASE_CLOSED_SMS: ["recipientName", "caseName", "stageName", "managerName", "websiteUrl"],
    CASE_REOPENED_SMS: ["recipientName", "caseName", "stageName", "managerName", "websiteUrl"],
    // ── Per-field case changes ──
    CASE_NAME_CHANGE_SMS: ["recipientName", "caseName", "managerName", "websiteUrl"],
    CASE_TYPE_CHANGE_SMS: ["recipientName", "caseName", "managerName", "websiteUrl"],
    CASE_MANAGER_CHANGE_SMS: ["recipientName", "caseName", "managerName", "websiteUrl"],
    CASE_COMPANY_CHANGE_SMS: ["recipientName", "caseName", "websiteUrl"],
    CASE_EST_DATE_CHANGE_SMS: ["recipientName", "caseName", "websiteUrl"],
    CASE_LICENSE_CHANGE_SMS: ["recipientName", "caseName", "websiteUrl"],
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

// Available variables for reminder email templates
const REMINDER_TEMPLATE_VARS = ["client_name", "firm_name", "date", "subject", "body", "case_title", "document_name", "amount", "content_1", "content_2", "content_3"];

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
    const { t } = useTranslation();
    const vars = SMS_TEMPLATE_VARS[templateKey];
    if (!vars || vars.length === 0) return null;
    return (
        <SimpleContainer className="lw-platformSettings__varButtons">
            <Text12 className="lw-platformSettings__varButtonsLabel">{t("platformSettings.availableVars")}</Text12>
            <SimpleContainer className="lw-platformSettings__varButtonsRow">
                {vars.map(v => (
                    <TertiaryButton
                        key={v}
                        onPress={() => onInsert(`{{${v}}}`)}
                    >
                        {t(`platformSettings.var_${v}`, v)}
                    </TertiaryButton>
                ))}
            </SimpleContainer>
        </SimpleContainer>
    );
}

/**
 * Wrap reminder body HTML in the branded email shell (matches backend wrapEmailHtml).
 * Used for the live preview in the reminder template editor.
 */
function wrapReminderPreviewHtml(bodyHtml, { title = '', firmName = '', firmLogoUrl = '' } = {}) {
    const headerTitle = title || firmName;
    const logoHtml = firmLogoUrl
        ? `<img src="${firmLogoUrl}" width="170" alt="${firmName}" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;">`
        : '';
    return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${headerTitle}</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;">${logoHtml}<div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">${headerTitle}</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">${bodyHtml}</div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; ${firmName}</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>`;
}

/**
 * Convert reminder body HTML (no wrapper div) to plain text.
 */
function reminderHtmlToPlainText(html) {
    if (!html) return "";
    let text = html;
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<span[^>]*>/gi, "").replace(/<\/span>/gi, "");
    text = text.replace(/<strong>/gi, "").replace(/<\/strong>/gi, "");
    text = text.replace(/&nbsp;/g, " ");
    text = text.replace(/&amp;/g, "&");
    text = text.replace(/&lt;/g, "<");
    text = text.replace(/&gt;/g, ">");
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/<[^>]+>/g, "");
    return text.trim();
}

/**
 * Convert plain text to reminder body HTML (no wrapper div).
 */
function reminderPlainTextToHtml(newText) {
    let html = newText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
    html = html.replace(
        /\[\[([^\]]+)\]\]/g,
        '<span style="font-weight:600;color:#1A365D;">[[$1]]</span>'
    );
    return html;
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

function EmailTemplateEditor({ template, onSave, saving, firmSettings }) {
    const { t } = useTranslation();
    const [subject, setSubject] = useState(template.subject_template || "");
    const [htmlBody, setHtmlBody] = useState(template.html_body || "");
    const [messageText, setMessageText] = useState(() => htmlToPlainText(template.html_body || ""));
    const [showCode, setShowCode] = useState(false);
    const iframeRef = useRef(null);
    const textareaRef = useRef(null);
    const simpleTextareaRef = useRef(null);

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

    // Insert variable into message text at cursor position
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
        } else if (simpleTextareaRef.current) {
            const ta = simpleTextareaRef.current;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const newText = messageText.substring(0, start) + placeholder + messageText.substring(end);
            setMessageText(newText);
            setHtmlBody(h => plainTextToHtml(h, newText));
            setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + placeholder.length; }, 0);
        } else {
            setMessageText(prev => {
                const newText = prev + placeholder;
                setHtmlBody(h => plainTextToHtml(h, newText));
                return newText;
            });
        }
    }, [htmlBody, messageText, showCode]);

    // Update preview iframe
    useEffect(() => {
        if (iframeRef.current) {
            let previewHtml = htmlBody;
            const firmName = firmSettings?.LAW_FIRM_NAME?.effectiveValue || firmSettings?.FIRM_NAME?.effectiveValue || '';
            const firmLogoUrl = firmSettings?.FIRM_LOGO_URL?.effectiveValue || '';
            if (firmName) previewHtml = previewHtml.split('[[firm_name]]').join(firmName);
            if (firmLogoUrl) previewHtml = previewHtml.split('[[firm_logo_url]]').join(firmLogoUrl);
            const doc = iframeRef.current.contentDocument;
            doc.open();
            doc.write(previewHtml);
            doc.close();
        }
    }, [htmlBody, firmSettings]);

    return (
        <SimpleContainer className="lw-platformSettings__emailEditor">
            <SimpleContainer className="lw-platformSettings__emailEditorHeader">
                <TextBold14>{template.label}</TextBold14>
            </SimpleContainer>

            {/* Subject */}
            <SimpleContainer className="lw-platformSettings__emailEditorField">
                <Text12 className="lw-platformSettings__emailEditorLabel">{t("platformSettings.emailSubject")}</Text12>
                <SimpleInput
                    className="lw-platformSettings__input"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    title={t("platformSettings.subject")}
                    timeToWaitInMilli={0}
                />
            </SimpleContainer>

            {/* Message text (simple mode) or HTML code (advanced) */}
            <SimpleContainer className="lw-platformSettings__emailEditorField">
                <SimpleContainer className="lw-platformSettings__emailEditorLabelRow">
                    <Text12 className="lw-platformSettings__emailEditorLabel">
                        {showCode ? t("platformSettings.htmlCode") : t("platformSettings.messageContent")}
                    </Text12>
                    <TertiaryButton onPress={() => setShowCode(prev => !prev)}>
                        {showCode ? t("platformSettings.backToSimple") : t("platformSettings.editHtmlCode")}
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
                        textareaRef={simpleTextareaRef}
                        title={t("platformSettings.messageContent")}
                        rows={6}
                        dir="rtl"
                    />
                )}
            </SimpleContainer>

            {/* Variable chips */}
            <SimpleContainer className="lw-platformSettings__varButtons">
                <Text12 className="lw-platformSettings__varButtonsLabel">{t("platformSettings.availableVarsClick")}</Text12>
                <SimpleContainer className="lw-platformSettings__varButtonsRow">
                    {availableVars.map(v => (
                        <TertiaryButton
                            key={v}
                            onPress={() => insertVar(v)}
                        >
                            {t(`platformSettings.var_${v}`, v)}
                        </TertiaryButton>
                    ))}
                </SimpleContainer>
            </SimpleContainer>

            {/* Live preview */}
            <SimpleContainer className="lw-platformSettings__emailEditorField">
                <Text12 className="lw-platformSettings__emailEditorLabel">{t("platformSettings.preview")}</Text12>
                <iframe
                    ref={iframeRef}
                    className="lw-platformSettings__emailPreviewFrame"
                    title="Email Preview"
                    sandbox="allow-same-origin"
                />
            </SimpleContainer>

            {/* Template attachments */}
            <TemplateAttachmentsSection templateType="email" templateKey={template.template_key} />

            {hasChanges && (
                <SimpleContainer className="lw-platformSettings__emailEditorActions">
                    <PrimaryButton
                        onPress={() => onSave(template.template_key, { subjectTemplate: subject, htmlBody })}
                        disabled={saving}
                        isPerforming={saving}
                    >
                        {saving ? t("platformSettings.saving") : t("platformSettings.saveTemplate")}
                    </PrimaryButton>
                    <SecondaryButton
                        onPress={() => { setSubject(template.subject_template || ""); setHtmlBody(template.html_body || ""); setMessageText(htmlToPlainText(template.html_body || "")); }}
                    >
                        {t("common.cancel")}
                    </SecondaryButton>
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
}

// ─── Main Screen ────────────────────────────────────────────────────
export default function PlatformSettingsScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();
    const { openPopup, closePopup } = usePopup();

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

    // Reminder templates state
    const [reminderTemplates, setReminderTemplates] = useState([]);
    const [loadingReminderTpls, setLoadingReminderTpls] = useState(false);
    const [editingReminderTpl, setEditingReminderTpl] = useState(null);
    const [reminderTplSaving, setReminderTplSaving] = useState(false);
    const [showReminderCode, setShowReminderCode] = useState(false);
    const [reminderMessageText, setReminderMessageText] = useState("");
    const reminderTextareaRef = useRef(null);
    const reminderSimpleTextareaRef = useRef(null);
    const reminderIframeRef = useRef(null);

    // Knowledge documents state
    const [knowledgeDocs, setKnowledgeDocs] = useState([]);
    const [loadingKnowledgeDocs, setLoadingKnowledgeDocs] = useState(false);
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [docTitle, setDocTitle] = useState("");
    const [selectedFileName, setSelectedFileName] = useState("");
    const [chatbotNotifEmail, setChatbotNotifEmail] = useState("");
    const [chatbotNotifEmailSaved, setChatbotNotifEmailSaved] = useState("");
    const fileInputRef = useRef(null);

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
            setSaveMessage("✅ " + t("platformSettings.templateSaved"));
            setTimeout(() => setSaveMessage(""), 3000);
            await reloadEmailTemplates();
        } catch (err) {
            setSaveMessage("❌ " + t("platformSettings.templateSaveError"));
            setTimeout(() => setSaveMessage(""), 3000);
        } finally {
            setEmailSaving(false);
        }
    }, [reloadEmailTemplates]);

    // ─── Reminder templates: load + CRUD ────────────────────────────
    useEffect(() => {
        if (activeTab !== "reminders") return;
        setLoadingReminderTpls(true);
        remindersApi.getTemplates()
            .then(res => setReminderTemplates(res.data?.templates || []))
            .catch((err) => {
                console.error('[PlatformSettingsScreen] Failed to load reminder templates:', err?.message);
            })
            .finally(() => setLoadingReminderTpls(false));
    }, [activeTab]);

    // Sync reminder plain-text when editing starts
    useEffect(() => {
        if (editingReminderTpl) {
            setReminderMessageText(reminderHtmlToPlainText(editingReminderTpl.body_html || ""));
            setShowReminderCode(false);
        }
    }, [editingReminderTpl?.id, editingReminderTpl?.key, editingReminderTpl?.isNew]);

    // Update reminder preview iframe (wrapped in branded shell)
    useEffect(() => {
        if (reminderIframeRef.current && editingReminderTpl) {
            const subjectPreview = editingReminderTpl.subject_template || editingReminderTpl.label || '';
            const firmS = data?.settings?.firm || {};
            const fullHtml = wrapReminderPreviewHtml(editingReminderTpl.body_html || '', {
                title: subjectPreview,
                firmName: firmS.LAW_FIRM_NAME?.effectiveValue || firmS.FIRM_NAME?.effectiveValue || '',
                firmLogoUrl: firmS.FIRM_LOGO_URL?.effectiveValue || '',
            });
            const doc = reminderIframeRef.current.contentDocument;
            doc.open();
            doc.write(fullHtml);
            doc.close();
        }
    }, [editingReminderTpl?.body_html, editingReminderTpl?.subject_template, editingReminderTpl?.label, data?.settings?.firm]);

    // ─── Knowledge documents: load + upload + delete ────────────────
    const loadKnowledgeDocs = useCallback(async () => {
        setLoadingKnowledgeDocs(true);
        try {
            const res = await platformSettingsApi.getKnowledgeDocs();
            setKnowledgeDocs(res.data?.documents || []);
        } catch {
            // ignore
        }
        try {
            const settingsRes = await platformSettingsApi.getAll();
            const chatbotSettings = settingsRes.data?.settings?.chatbot || {};
            const email = chatbotSettings?.CHATBOT_NOTIFICATION_EMAIL?.effectiveValue || "";
            setChatbotNotifEmail(email);
            setChatbotNotifEmailSaved(email);
        } catch {
            // ignore
        }
        setLoadingKnowledgeDocs(false);
    }, []);

    useEffect(() => {
        if (activeTab !== "knowledgeDocs") return;
        loadKnowledgeDocs();
    }, [activeTab, loadKnowledgeDocs]);

    const handleUploadKnowledgeDoc = useCallback(async (file) => {
        if (!file) return;
        setUploadingDoc(true);
        try {
            const res = await platformSettingsApi.uploadKnowledgeDoc(file, docTitle || undefined);
            const msg = res.data?.message || t("platformSettings.docUploaded");
            const chunks = res.data?.chunkCount || 0;
            setSaveMessage(`✅ ${msg} (${chunks} ${t("platformSettings.chunks")})`);
            setTimeout(() => setSaveMessage(""), 4000);
            setDocTitle("");
            setSelectedFileName("");
            if (fileInputRef.current) fileInputRef.current.value = "";
            await loadKnowledgeDocs();
        } catch (err) {
            const msg = err?.response?.data?.message || err?.data?.message || t("platformSettings.docUploadError");
            setSaveMessage(`❌ ${msg}`);
            setTimeout(() => setSaveMessage(""), 5000);
        } finally {
            setUploadingDoc(false);
        }
    }, [docTitle, loadKnowledgeDocs]);

    const handleDeleteKnowledgeDoc = useCallback((docId) => {
        openPopup(
            <ConfirmationDialog
                title={t("platformSettings.deleteDocTitle")}
                message={t("platformSettings.deleteDocMessage")}
                confirmText={t("common.remove")}
                cancelText={t("common.cancel")}
                danger
                onCancel={closePopup}
                onConfirm={async () => {
                    closePopup();
                    try {
                        await platformSettingsApi.deleteKnowledgeDoc(docId);
                        setSaveMessage("✅ " + t("platformSettings.docDeleted"));
                        setTimeout(() => setSaveMessage(""), 3000);
                        await loadKnowledgeDocs();
                    } catch {
                        setSaveMessage("❌ " + t("platformSettings.docDeleteError"));
                        setTimeout(() => setSaveMessage(""), 3000);
                    }
                }}
            />
        );
    }, [loadKnowledgeDocs, openPopup, closePopup, t]);

    const handleSaveChatbotNotifEmail = useCallback(async () => {
        try {
            await platformSettingsApi.updateSingle("chatbot", "CHATBOT_NOTIFICATION_EMAIL", chatbotNotifEmail.trim());
            setChatbotNotifEmailSaved(chatbotNotifEmail.trim());
            setSaveMessage("✅ " + t("platformSettings.notifEmailSaved"));
            setTimeout(() => setSaveMessage(""), 3000);
        } catch {
            setSaveMessage("❌ " + t("platformSettings.notifEmailSaveError"));
            setTimeout(() => setSaveMessage(""), 3000);
        }
    }, [chatbotNotifEmail]);

    const handleSaveReminderTemplate = useCallback(async () => {
        if (!editingReminderTpl) return;
        const { isNew, id, key, label, description, subject_template, body_html } = editingReminderTpl;
        if (!label?.trim() || !subject_template?.trim()) {
            setSaveMessage("❌ " + t("platformSettings.fillNameAndSubject"));
            setTimeout(() => setSaveMessage(""), 3000);
            return;
        }
        setReminderTplSaving(true);
        try {
            if (isNew) {
                await remindersApi.createCustomTemplate({ label, description, subject_template, body_html, template_key: key || undefined });
            } else {
                await remindersApi.updateCustomTemplate(id, { label, description, subject_template, body_html });
            }
            setSaveMessage("✅ " + t("platformSettings.reminderTemplateSaved"));
            setTimeout(() => setSaveMessage(""), 3000);
            setEditingReminderTpl(null);
            const res = await remindersApi.getTemplates();
            setReminderTemplates(res.data?.templates || []);
        } catch {
            setSaveMessage("❌ " + t("platformSettings.templateSaveError"));
            setTimeout(() => setSaveMessage(""), 3000);
        } finally {
            setReminderTplSaving(false);
        }
    }, [editingReminderTpl]);

    const handleDeleteReminderTemplate = useCallback((id) => {
        openPopup(
            <ConfirmationDialog
                title={t("platformSettings.deleteTemplateTitle")}
                message={t("platformSettings.deleteTemplateMessage")}
                confirmText={t("common.remove")}
                cancelText={t("common.cancel")}
                danger
                onCancel={closePopup}
                onConfirm={async () => {
                    closePopup();
                    try {
                        await remindersApi.deleteCustomTemplate(id);
                        setSaveMessage("✅ " + t("platformSettings.templateDeleted"));
                        setTimeout(() => setSaveMessage(""), 3000);
                        const res = await remindersApi.getTemplates();
                        setReminderTemplates(res.data?.templates || []);
                    } catch {
                        setSaveMessage("❌ " + t("platformSettings.templateDeleteError"));
                        setTimeout(() => setSaveMessage(""), 3000);
                    }
                }}
            />
        );
    }, [openPopup, closePopup, t]);

    const handleDownloadReminderExcel = useCallback(async (key) => {
        try {
            await remindersApi.downloadTemplateExcel(key);
        } catch {
            setSaveMessage("❌ " + t("platformSettings.excelDownloadError"));
            setTimeout(() => setSaveMessage(""), 3000);
        }
    }, []);

    // Save state (manual — we call the API directly to properly handle errors)
    const [isSaving, setIsSaving] = useState(false);

    // Add admin handler
    const { isPerforming: isAddingAdmin, performRequest: doAddAdmin } = useHttpRequest(
        platformSettingsApi.addAdmin,
        () => {
            setNewAdminPhone("");
            reloadAdmins();
            setSaveMessage("✅ " + t("platformSettings.adminAdded"));
            setTimeout(() => setSaveMessage(""), 3000);
        }
    );

    // Remove admin handler
    const { performRequest: doRemoveAdmin } = useHttpRequest(
        platformSettingsApi.removeAdmin,
        () => {
            reloadAdmins();
            setSaveMessage("✅ " + t("platformSettings.adminRemoved"));
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
                    const serverMsg = res.data?.message || t("platformSettings.settingsSaveError");
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
                    const serverMsg = res.data?.message || t("platformSettings.channelUpdateError");
                    setSaveMessage(`❌ ${serverMsg}`);
                    setTimeout(() => setSaveMessage(""), 6000);
                    setIsSaving(false);
                    return;
                }
            }
            setEditedChannels({});
            setEditedValues({});
            setSaveMessage("✅ " + t("platformSettings.settingsSaved"));
            reload();
            setTimeout(() => setSaveMessage(""), 3000);
        } catch (err) {
            const serverMsg = err?.response?.data?.message || err?.data?.message || err?.message || '';
            setSaveMessage(`❌ ${serverMsg || t("platformSettings.saveError")}`);            setTimeout(() => setSaveMessage(""), 6000);
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
        openPopup(
            <ConfirmationDialog
                title={t("platformSettings.removeAdminTitle")}
                message={t("platformSettings.removeAdminMessage")}
                confirmText={t("common.remove")}
                cancelText={t("common.cancel")}
                danger
                onCancel={closePopup}
                onConfirm={() => {
                    closePopup();
                    doRemoveAdmin(userId);
                }}
            />
        );
    }, [doRemoveAdmin, openPopup, closePopup, t]);

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
                    <SimpleCard>
                        {[1, 2, 3].map(i => (
                            <SimpleContainer key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
                                <Skeleton width="40%" height={14} />
                                <Skeleton width="30%" height={14} />
                            </SimpleContainer>
                        ))}
                    </SimpleCard>
                </SimpleContainer>
            );
        }

        // Channels tab
        if (activeTab === "channels") {
            return (
                <SimpleCard className="lw-platformSettings__card">
                    <TextBold18>{t("platformSettings.notificationChannels")}</TextBold18>
                    <Text14 className="lw-platformSettings__subtitle">
                        {t("platformSettings.channelsSubtitle")}
                    </Text14>
                    <SimpleContainer className="lw-platformSettings__channelGrid">
                        <SimpleContainer className="lw-platformSettings__channelHeader">
                            <TextBold14 className="lw-platformSettings__channelName">{t("platformSettings.notificationType")}</TextBold14>
                            <SimpleContainer className="lw-platformSettings__channelToggles">
                                <SimpleContainer className="lw-platformSettings__channelToggle">
                                    <Text12>Push</Text12>
                                </SimpleContainer>
                                <SimpleContainer className="lw-platformSettings__channelToggle">
                                    <Text12>{t("platformSettings.email")}</Text12>
                                </SimpleContainer>
                                <SimpleContainer className="lw-platformSettings__channelToggle">
                                    <Text12>SMS</Text12>
                                </SimpleContainer>
                                <SimpleContainer className="lw-platformSettings__channelToggle">
                                    <Text12>{t("platformSettings.ccCaseManager")}</Text12>
                                </SimpleContainer>
                                <SimpleContainer className="lw-platformSettings__channelToggle">
                                    <Text12>{t("platformSettings.ccSystemAdmin")}</Text12>
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
                    <TextBold18>{t("platformSettings.platformAdmins")}</TextBold18>
                    <Text14 className="lw-platformSettings__subtitle">
                        {t("platformSettings.adminsSubtitle")}
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
                            title={t("platformSettings.newAdminPhone")}
                            value={newAdminPhone}
                            onChange={(e) => setNewAdminPhone(e.target.value)}
                            inputSize="Small"
                            timeToWaitInMilli={0}
                        />
                        <PrimaryButton
                            className="lw-platformSettings__addBtn"
                            onPress={handleAddAdmin}
                            disabled={isAddingAdmin || !newAdminPhone.trim()}
                            isPerforming={isAddingAdmin}
                        >
                            {isAddingAdmin ? t("platformSettings.adding") : t("platformSettings.addAdmin")}
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
                        <SimpleCard>
                            {[1, 2, 3].map(i => (
                                <SimpleContainer key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
                                    <Skeleton width="40%" height={14} />
                                    <Skeleton width="30%" height={14} />
                                </SimpleContainer>
                            ))}
                        </SimpleCard>
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
                        <TextBold18>{t("platformSettings.emailTemplatesTitle")}</TextBold18>
                        <Text14 className="lw-platformSettings__empty">
                            {t("platformSettings.noActiveEmailTemplates")}
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
                        <TextBold14 className="lw-platformSettings__emailTemplateListTitle">{t("platformSettings.selectTemplate")}</TextBold14>
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
                                firmSettings={settings.firm}
                            />
                        ) : (
                            <SimpleCard className="lw-platformSettings__card">
                                <Text14>{t("platformSettings.selectFromList")}</Text14>
                            </SimpleCard>
                        )}
                    </SimpleContainer>
                </SimpleContainer>
            );
        }

        // Knowledge documents tab
        if (activeTab === "knowledgeDocs") {
            return (
                <SimpleCard className="lw-platformSettings__card">
                    <TextBold18>{t("platformSettings.knowledgeDocsTitle")}</TextBold18>
                    <Text14 className="lw-platformSettings__subtitle">
                        {t("platformSettings.knowledgeDocsSubtitle")}
                    </Text14>

                    {/* Notification email setting */}
                    <SimpleContainer className="lw-platformSettings__knowledgeNotifSection">
                        <TextBold14>{t("platformSettings.leadNotifEmail")}</TextBold14>
                        <Text12 className="lw-platformSettings__knowledgeMeta">
                            {t("platformSettings.leadNotifEmailDesc")}
                        </Text12>
                        <SimpleContainer className="lw-platformSettings__knowledgeUploadRow">
                            <SimpleInput
                                className="lw-platformSettings__input lw-platformSettings__knowledgeTitleInput"
                                type="email"
                                value={chatbotNotifEmail}
                                onChange={(e) => setChatbotNotifEmail(e.target.value)}
                                title={t("platformSettings.notifEmailPlaceholder")}
                                timeToWaitInMilli={0}
                            />
                            {chatbotNotifEmail.trim() !== chatbotNotifEmailSaved && (
                                <PrimaryButton onPress={handleSaveChatbotNotifEmail}>
                                    {t("platformSettings.save")}
                                </PrimaryButton>
                            )}
                        </SimpleContainer>
                    </SimpleContainer>

                    {/* Upload section */}
                    <SimpleContainer className="lw-platformSettings__knowledgeUpload">
                        <SimpleContainer className="lw-platformSettings__knowledgeUploadRow">
                            <SimpleInput
                                className="lw-platformSettings__input lw-platformSettings__knowledgeTitleInput"
                                type="text"
                                value={docTitle}
                                onChange={(e) => setDocTitle(e.target.value)}
                                title={t("platformSettings.docTitlePlaceholder")}
                                timeToWaitInMilli={0}
                            />
                        </SimpleContainer>
                        <FileUploadBox
                            accept=".pdf,.txt"
                            onFileSelected={(file) => {
                                setSelectedFileName(file.name);
                                handleUploadKnowledgeDoc(file);
                            }}
                            uploading={uploadingDoc}
                            fileName={selectedFileName}
                            label={t("platformSettings.chooseFile")}
                            hint=".pdf / .txt"
                        />
                    </SimpleContainer>

                    {/* Documents list */}
                    {loadingKnowledgeDocs ? (
                        <SimpleCard>
                            {[1, 2].map(i => (
                                <SimpleContainer key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
                                    <Skeleton width="50%" height={14} />
                                    <Skeleton width="20%" height={14} />
                                </SimpleContainer>
                            ))}
                        </SimpleCard>
                    ) : (
                        <SimpleContainer className="lw-platformSettings__knowledgeList">
                            {knowledgeDocs.map(doc => (
                                <SimpleContainer key={doc.id} className="lw-platformSettings__knowledgeRow">
                                    <SimpleContainer className="lw-platformSettings__knowledgeInfo">
                                        <TextBold14>{doc.title}</TextBold14>
                                        <Text12 className="lw-platformSettings__knowledgeMeta">
                                            {doc.source_file} · {doc.chunk_count} {t("platformSettings.chunks")} · {new Date(doc.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                        </Text12>
                                    </SimpleContainer>
                                    <SecondaryButton
                                        className="lw-platformSettings__removeBtn"
                                        onPress={() => handleDeleteKnowledgeDoc(doc.id)}
                                    >
                                        {t("platformSettings.delete")}
                                    </SecondaryButton>
                                </SimpleContainer>
                            ))}
                            {knowledgeDocs.length === 0 && (
                                <Text14 className="lw-platformSettings__empty">
                                    {t("platformSettings.noDocsYet")}
                                </Text14>
                            )}
                        </SimpleContainer>
                    )}
                </SimpleCard>
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
            if (activeTab === "templates") {
                return (
                    <SimpleCard className="lw-platformSettings__card">
                        <TextBold18>{t("platformSettings.smsTemplatesTitle")}</TextBold18>
                        <Text14 className="lw-platformSettings__empty">
                            {t("platformSettings.noActiveSmsTemplates")}
                        </Text14>
                    </SimpleCard>
                );
            }
            // For tabs like "reminders" that may have no settings but have other sections (e.g. templates), skip the empty card
            return null;
        }

        return (
            <SimpleCard className="lw-platformSettings__card">
                <TextBold18>{CATEGORIES.find(c => c.key === activeTab)?.labelKey ? t(CATEGORIES.find(c => c.key === activeTab).labelKey) : activeTab}</TextBold18>
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
                                        <Text12 className="lw-platformSettings__smsPreviewLabel">{t("platformSettings.preview")}</Text12>
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

    // ─── Render reminder templates section ──────────────────────────
    const renderReminderTemplatesSection = () => (
        <SimpleCard className="lw-platformSettings__card" style={{ marginTop: 24 }}>
            <SimpleContainer className="lw-platformSettings__reminderTplHeader">
                <TextBold18>{t("platformSettings.reminderEmailTemplates")}</TextBold18>
                <PrimaryButton
                    onPress={() => setEditingReminderTpl({
                        isNew: true, label: "", description: "", subject_template: "", body_html: ""
                    })}
                >
                    {t("platformSettings.addNewTemplate")}
                </PrimaryButton>
            </SimpleContainer>

            {loadingReminderTpls ? (
                <SimpleCard>
                    {[1, 2].map(i => (
                        <SimpleContainer key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
                            <Skeleton width="50%" height={14} />
                            <Skeleton width="20%" height={14} />
                        </SimpleContainer>
                    ))}
                </SimpleCard>
            ) : (
                <SimpleContainer className="lw-platformSettings__reminderTplList">
                    {reminderTemplates.map(tpl => (
                        <SimpleContainer key={tpl.key} className="lw-platformSettings__reminderTplRow">
                            <SimpleContainer className="lw-platformSettings__reminderTplInfo">
                                <SimpleContainer className="lw-platformSettings__reminderTplNameRow">
                                    <TextBold14>{tpl.label}</TextBold14>
                                    {tpl.isBuiltin && <Text12 className="lw-platformSettings__reminderTplBadge">{t("platformSettings.builtin")}</Text12>}
                                </SimpleContainer>
                                {tpl.description && <Text12 className="lw-platformSettings__reminderTplDesc">{tpl.description}</Text12>}
                            </SimpleContainer>
                            <SimpleContainer className="lw-platformSettings__reminderTplActions">
                                <TertiaryButton onPress={() => handleDownloadReminderExcel(tpl.key)}>
                                    {t("platformSettings.excelSample")}
                                </TertiaryButton>
                                <TertiaryButton onPress={() => setEditingReminderTpl({
                                    isNew: !tpl.id, id: tpl.id || null, key: tpl.key,
                                    label: tpl.label, description: tpl.description || "",
                                    subject_template: tpl.subject, body_html: tpl.bodyHtml || ""
                                })}>
                                    {t("platformSettings.edit")}
                                </TertiaryButton>
                                {!tpl.isBuiltin && tpl.id && (
                                    <TertiaryButton onPress={() => handleDeleteReminderTemplate(tpl.id)}>
                                        {t("platformSettings.deleteAction")}
                                    </TertiaryButton>
                                )}
                            </SimpleContainer>
                        </SimpleContainer>
                    ))}
                    {reminderTemplates.length === 0 && (
                        <Text14 className="lw-platformSettings__empty">{t("platformSettings.noTemplatesYet")}</Text14>
                    )}
                </SimpleContainer>
            )}

            {editingReminderTpl && (
                <SimpleContainer className="lw-platformSettings__reminderEditor">
                    <TextBold14 className="lw-platformSettings__reminderEditorTitle">
                        {editingReminderTpl.isNew ? t("platformSettings.newTemplate") : t("platformSettings.editTemplate")}
                    </TextBold14>

                    <SimpleContainer className="lw-platformSettings__reminderEditorField">
                        <Text12>{t("platformSettings.templateNameLabel")}</Text12>
                        <SimpleInput
                            className="lw-platformSettings__input"
                            type="text"
                            value={editingReminderTpl.label}
                            onChange={(e) => setEditingReminderTpl(prev => ({ ...prev, label: e.target.value }))}
                            title={t("platformSettings.templateNamePlaceholder")}
                            timeToWaitInMilli={0}
                        />
                    </SimpleContainer>

                    <SimpleContainer className="lw-platformSettings__reminderEditorField">
                        <Text12>{t("platformSettings.descriptionLabel")}</Text12>
                        <SimpleInput
                            className="lw-platformSettings__input"
                            type="text"
                            value={editingReminderTpl.description}
                            onChange={(e) => setEditingReminderTpl(prev => ({ ...prev, description: e.target.value }))}
                            title={t("platformSettings.descriptionPlaceholder")}
                            timeToWaitInMilli={0}
                        />
                    </SimpleContainer>

                    <SimpleContainer className="lw-platformSettings__reminderEditorField">
                        <Text12>{t("platformSettings.emailSubject")}</Text12>
                        <SimpleInput
                            className="lw-platformSettings__input"
                            type="text"
                            value={editingReminderTpl.subject_template}
                            onChange={(e) => setEditingReminderTpl(prev => ({ ...prev, subject_template: e.target.value }))}
                            title={t("platformSettings.subject")}
                            timeToWaitInMilli={0}
                        />
                    </SimpleContainer>

                    {/* Message text (simple mode) or HTML code (advanced) */}
                    <SimpleContainer className="lw-platformSettings__emailEditorField">
                        <SimpleContainer className="lw-platformSettings__emailEditorLabelRow">
                            <Text12 className="lw-platformSettings__emailEditorLabel">
                                {showReminderCode ? t("platformSettings.htmlCode") : t("platformSettings.messageContent")}
                            </Text12>
                            <TertiaryButton onPress={() => setShowReminderCode(prev => !prev)}>
                                {showReminderCode ? t("platformSettings.backToSimple") : t("platformSettings.editHtmlCode")}
                            </TertiaryButton>
                        </SimpleContainer>

                        {showReminderCode ? (
                            <textarea
                                ref={reminderTextareaRef}
                                className="lw-platformSettings__emailEditorTextarea"
                                value={editingReminderTpl.body_html}
                                onChange={(e) => {
                                    const newHtml = e.target.value;
                                    setEditingReminderTpl(prev => ({ ...prev, body_html: newHtml }));
                                    setReminderMessageText(reminderHtmlToPlainText(newHtml));
                                }}
                                dir="ltr"
                                rows={20}
                            />
                        ) : (
                            <SimpleTextArea
                                className="lw-platformSettings__textarea"
                                value={reminderMessageText}
                                onChange={(val) => {
                                    setReminderMessageText(val);
                                    setEditingReminderTpl(prev => ({
                                        ...prev, body_html: reminderPlainTextToHtml(val)
                                    }));
                                }}
                                textareaRef={reminderSimpleTextareaRef}
                                title={t("platformSettings.messageContent")}
                                rows={6}
                                dir="rtl"
                            />
                        )}
                    </SimpleContainer>

                    {/* Variable chips */}
                    <SimpleContainer className="lw-platformSettings__varButtons">
                        <Text12 className="lw-platformSettings__varButtonsLabel">{t("platformSettings.availableVarsClick")}</Text12>
                        <SimpleContainer className="lw-platformSettings__varButtonsRow">
                            {REMINDER_TEMPLATE_VARS.map(v => (
                                <TertiaryButton
                                    key={v}
                                    onPress={() => {
                                        const placeholder = `[[${v}]]`;
                                        if (showReminderCode && reminderTextareaRef.current) {
                                            const ta = reminderTextareaRef.current;
                                            const start = ta.selectionStart;
                                            const end = ta.selectionEnd;
                                            const newHtml = (editingReminderTpl.body_html || "").substring(0, start) + placeholder + (editingReminderTpl.body_html || "").substring(end);
                                            setEditingReminderTpl(prev => ({ ...prev, body_html: newHtml }));
                                            setReminderMessageText(reminderHtmlToPlainText(newHtml));
                                            setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + placeholder.length; }, 0);
                                        } else if (reminderSimpleTextareaRef.current) {
                                            const ta = reminderSimpleTextareaRef.current;
                                            const start = ta.selectionStart;
                                            const end = ta.selectionEnd;
                                            const newText = reminderMessageText.substring(0, start) + placeholder + reminderMessageText.substring(end);
                                            setReminderMessageText(newText);
                                            setEditingReminderTpl(p => ({
                                                ...p, body_html: reminderPlainTextToHtml(newText)
                                            }));
                                            setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + placeholder.length; }, 0);
                                        } else {
                                            setReminderMessageText(prev => {
                                                const newText = prev + placeholder;
                                                setEditingReminderTpl(p => ({
                                                    ...p, body_html: reminderPlainTextToHtml(newText)
                                                }));
                                                return newText;
                                            });
                                        }
                                    }}
                                >
                                    {t(`platformSettings.var_${v}`, v)}
                                </TertiaryButton>
                            ))}
                        </SimpleContainer>
                    </SimpleContainer>

                    {/* Live preview */}
                    <SimpleContainer className="lw-platformSettings__emailEditorField">
                        <Text12 className="lw-platformSettings__emailEditorLabel">{t("platformSettings.preview")}</Text12>
                        <iframe
                            ref={reminderIframeRef}
                            className="lw-platformSettings__emailPreviewFrame"
                            title="Reminder Template Preview"
                            sandbox="allow-same-origin"
                        />
                    </SimpleContainer>

                    {/* Template attachments */}
                    {editingReminderTpl.key && (
                        <TemplateAttachmentsSection templateType="reminder" templateKey={editingReminderTpl.key} />
                    )}

                    <SimpleContainer className="lw-platformSettings__reminderEditorActions">
                        <PrimaryButton
                            onPress={handleSaveReminderTemplate}
                            disabled={reminderTplSaving}
                            isPerforming={reminderTplSaving}
                        >
                            {reminderTplSaving ? t("platformSettings.saving") : t("platformSettings.saveTemplate")}
                        </PrimaryButton>
                        <SecondaryButton onPress={() => setEditingReminderTpl(null)}>
                            {t("common.cancel")}
                        </SecondaryButton>
                    </SimpleContainer>
                </SimpleContainer>
            )}
        </SimpleCard>
    );

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground} className="lw-platformSettings">
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={AdminStackName + MainScreenName} GetNavBarData={getNavBarData} />}
            <SimpleScrollView className="lw-platformSettings__scroll">
                <SimpleContainer className="lw-platformSettings__header">
                    <TextBold24>{t("platformSettings.title")}</TextBold24>
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
                                <Text14 className="lw-platformSettings__tabLabel">{t(cat.labelKey)}</Text14>
                            </SimpleButton>
                        ))}
                    </SimpleContainer>

                    {/* Content area */}
                    <SimpleContainer className="lw-platformSettings__content">
                        {renderContent()}

                        {/* Reminder email templates management (under reminders tab) */}
                        {activeTab === "reminders" && renderReminderTemplatesSection()}

                        {/* Save bar (only for settings tabs, not channels/admins/emailTemplates) */}
                        {activeTab !== "admins" && activeTab !== "emailTemplates" && (
                            <SimpleContainer className="lw-platformSettings__saveBar">
                                {saveMessage && (
                                    <Text14 className="lw-platformSettings__saveMessage">{saveMessage}</Text14>
                                )}
                                <PrimaryButton
                                    className="lw-platformSettings__saveBtn"
                                    onPress={handleSave}
                                    disabled={isSaving || !hasEdits}
                                    isPerforming={isSaving}
                                >
                                    {isSaving ? t("platformSettings.saving") : t("platformSettings.saveChanges")}
                                </PrimaryButton>
                                {hasEdits && (
                                    <SecondaryButton
                                        className="lw-platformSettings__cancelBtn"
                                        onPress={() => { setEditedValues({}); setEditedChannels({}); reload(); }}
                                    >
                                        {t("common.cancel")}
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
