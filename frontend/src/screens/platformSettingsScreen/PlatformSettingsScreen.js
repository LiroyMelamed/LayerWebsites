// src/screens/platformSettingsScreen/PlatformSettingsScreen.js
import React, { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useScreenSize } from "../../providers/ScreenSizeProvider";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleCard from "../../components/simpleComponents/SimpleCard";
import SimpleButton from "../../components/simpleComponents/SimpleButton";
import SimpleLoader from "../../components/simpleComponents/SimpleLoader";
import SimpleInput from "../../components/simpleComponents/SimpleInput";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";

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
    { key: "firm", label: "פרטי המשרד", icon: "🏢" }, { key: "notifications", label: "התראות", icon: "🔔" },
    { key: "templates", label: "תבניות SMS", icon: "📝" }, { key: "reminders", label: "תזכורות", icon: "⏰" },
    { key: "channels", label: "ערוצי התראות", icon: "📡" },
    { key: "admins", label: "מנהלי פלטפורמה", icon: "👤" },
];

// ─── Setting Input Component ────────────────────────────────────────
function SettingInput({ setting, value, onChange }) {
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
                    <Text12 className="lw-platformSettings__channelToggleLabel">מנהל מערכת</Text12>
                    <input
                        type="checkbox"
                        checked={channel.admin_cc}
                        onChange={() => onToggle(channel.notification_type, "adminCc", !channel.admin_cc)}
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
                                    <Text12>העתק למנהל מערכת</Text12>
                                </SimpleContainer>
                                <SimpleContainer className="lw-platformSettings__channelToggle">
                                    <Text12>העתק למנהל תיק</Text12>
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

        // Settings tabs (messaging, signing, firm, reminders, security)
        const categorySettings = settings[activeTab] || {};
        const settingKeys = Object.keys(categorySettings);

        if (settingKeys.length === 0) {
            return (
                <SimpleCard className="lw-platformSettings__card">
                    <Text14 className="lw-platformSettings__empty">
                        אין הגדרות מוגדרות עבור קטגוריה זו
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

                        return (
                            <SimpleContainer key={key} className="lw-platformSettings__settingRow">
                                <SimpleContainer className="lw-platformSettings__settingLabel">
                                    <TextBold14 className="lw-platformSettings__settingName">
                                        {setting.label || key}
                                    </TextBold14>
                                    {setting.description && (
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
                                    />
                                </SimpleContainer>
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

                        {/* Save bar (only for settings tabs, not channels/admins) */}
                        {activeTab !== "admins" && (
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
