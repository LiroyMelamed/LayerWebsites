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
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getNavBarData } from "../../components/navBars/data/NavBarData";

import { Text14, TextBold24, TextBold18 } from "../../components/specializedComponents/text/AllTextKindFile";

import platformSettingsApi from "../../api/platformSettingsApi";
import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import useHttpRequest from "../../hooks/useHttpRequest";

import "./PlatformSettingsScreen.scss";

export const PlatformSettingsScreenName = "/PlatformSettings";

// ─── Category definitions with Hebrew labels ────────────────────────
const CATEGORIES = [
    { key: "messaging", label: "הודעות ואימייל", icon: "📧" },
    { key: "signing", label: "חתימה דיגיטלית", icon: "✍️" },
    { key: "firm", label: "פרטי המשרד", icon: "🏢" },
    { key: "reminders", label: "תזכורות", icon: "⏰" },
    { key: "security", label: "אבטחה", icon: "🔒" },
    { key: "channels", label: "ערוצי התראות", icon: "📡" },
    { key: "admins", label: "מנהלי פלטפורמה", icon: "👤" },
];

// ─── Setting Input Component ────────────────────────────────────────
function SettingInput({ setting, value, onChange }) {
    const inputValue = value ?? setting.effectiveValue ?? "";

    if (setting.valueType === "boolean") {
        return (
            <label className="lw-platformSettings__toggle">
                <input
                    type="checkbox"
                    checked={inputValue === true || inputValue === "true" || inputValue === "1"}
                    onChange={(e) => onChange(e.target.checked ? "true" : "false")}
                />
                <span className="lw-platformSettings__toggleSlider" />
                <span className="lw-platformSettings__toggleLabel">
                    {inputValue === true || inputValue === "true" || inputValue === "1" ? "פעיל" : "לא פעיל"}
                </span>
            </label>
        );
    }

    if (setting.valueType === "number") {
        return (
            <input
                className="lw-platformSettings__input"
                type="number"
                value={inputValue}
                onChange={(e) => onChange(e.target.value)}
                placeholder={setting.description || ""}
            />
        );
    }

    return (
        <input
            className="lw-platformSettings__input"
            type="text"
            value={inputValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={setting.description || ""}
        />
    );
}

// ─── Channel Toggle Row ─────────────────────────────────────────────
function ChannelRow({ channel, onToggle }) {
    return (
        <div className="lw-platformSettings__channelRow">
            <div className="lw-platformSettings__channelName">
                {channel.label || channel.notification_type}
            </div>
            <div className="lw-platformSettings__channelToggles">
                <label className="lw-platformSettings__channelToggle">
                    <input
                        type="checkbox"
                        checked={channel.push_enabled}
                        onChange={() => onToggle(channel.notification_type, "pushEnabled", !channel.push_enabled)}
                    />
                    <span>Push</span>
                </label>
                <label className="lw-platformSettings__channelToggle">
                    <input
                        type="checkbox"
                        checked={channel.email_enabled}
                        onChange={() => onToggle(channel.notification_type, "emailEnabled", !channel.email_enabled)}
                    />
                    <span>אימייל</span>
                </label>
                <label className="lw-platformSettings__channelToggle">
                    <input
                        type="checkbox"
                        checked={channel.sms_enabled}
                        onChange={() => onToggle(channel.notification_type, "smsEnabled", !channel.sms_enabled)}
                    />
                    <span>SMS</span>
                </label>
            </div>
        </div>
    );
}

// ─── Admin Row ──────────────────────────────────────────────────────
function AdminRow({ admin, onRemove, currentUserId }) {
    const isCurrentUser = admin.user_id === currentUserId;
    return (
        <div className="lw-platformSettings__adminRow">
            <div className="lw-platformSettings__adminInfo">
                <span className="lw-platformSettings__adminName">{admin.user_name || "ללא שם"}</span>
                <span className="lw-platformSettings__adminPhone">{admin.phone}</span>
            </div>
            {!isCurrentUser && (
                <SimpleButton
                    className="lw-platformSettings__removeBtn"
                    onClick={() => onRemove(admin.user_id)}
                >
                    הסר
                </SimpleButton>
            )}
        </div>
    );
}

// ─── Main Screen ────────────────────────────────────────────────────
export default function PlatformSettingsScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();

    const [activeTab, setActiveTab] = useState("messaging");
    const [editedValues, setEditedValues] = useState({});
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
            onFailure: () => {},
        }
    );

    // Load admins
    const { result: adminsData, performRequest: reloadAdmins } = useAutoHttpRequest(
        platformSettingsApi.getAdmins,
        { onFailure: () => {} }
    );

    // Save handler
    const { isPerforming: isSaving, performRequest: doSave } = useHttpRequest(
        platformSettingsApi.updateSettings,
        () => {
            setSaveMessage("✅ ההגדרות נשמרו בהצלחה");
            setEditedValues({});
            reload();
            setTimeout(() => setSaveMessage(""), 3000);
        }
    );

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

    // Channel toggle handler
    const handleChannelToggle = useCallback(async (type, field, value) => {
        setLocalChannels(prev => prev?.map(ch =>
            ch.notification_type === type
                ? { ...ch, [field === "pushEnabled" ? "push_enabled" : field === "emailEnabled" ? "email_enabled" : "sms_enabled"]: value }
                : ch
        ));
        try {
            await platformSettingsApi.updateChannel(type, { [field]: value });
        } catch {
            // Revert on error
            reload();
        }
    }, [reload]);

    // Setting change handler
    const handleSettingChange = useCallback((category, key, value) => {
        setEditedValues(prev => ({ ...prev, [`${category}:${key}`]: { category, key, value } }));
    }, []);

    // Save all edited settings
    const handleSave = useCallback(() => {
        const settingsArray = Object.values(editedValues);
        if (settingsArray.length === 0) return;
        doSave(settingsArray);
    }, [editedValues, doSave]);

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
    const hasEdits = Object.keys(editedValues).length > 0;

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
                    <div className="lw-platformSettings__channelGrid">
                        <div className="lw-platformSettings__channelHeader">
                            <span>סוג התראה</span>
                            <div className="lw-platformSettings__channelToggles">
                                <span>Push</span>
                                <span>אימייל</span>
                                <span>SMS</span>
                            </div>
                        </div>
                        {channels.map(ch => (
                            <ChannelRow
                                key={ch.notification_type}
                                channel={ch}
                                onToggle={handleChannelToggle}
                            />
                        ))}
                    </div>
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

                    <div className="lw-platformSettings__adminList">
                        {admins.map(admin => (
                            <AdminRow
                                key={admin.user_id}
                                admin={admin}
                                onRemove={handleRemoveAdmin}
                                currentUserId={currentUserId}
                            />
                        ))}
                        {admins.length === 0 && (
                            <Text14 className="lw-platformSettings__empty">
                                אין מנהלי פלטפורמה מוגדרים במסד הנתונים.
                                המערכת משתמשת ברשימת ה-env.
                            </Text14>
                        )}
                    </div>

                    <div className="lw-platformSettings__addAdmin">
                        <input
                            className="lw-platformSettings__input"
                            type="text"
                            placeholder="מספר טלפון של מנהל חדש"
                            value={newAdminPhone}
                            onChange={(e) => setNewAdminPhone(e.target.value)}
                        />
                        <SimpleButton
                            className="lw-platformSettings__addBtn"
                            onClick={handleAddAdmin}
                            disabled={isAddingAdmin || !newAdminPhone.trim()}
                        >
                            {isAddingAdmin ? "מוסיף..." : "הוסף מנהל"}
                        </SimpleButton>
                    </div>
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
                <div className="lw-platformSettings__settingsList">
                    {settingKeys.map(key => {
                        const setting = categorySettings[key];
                        const editKey = `${activeTab}:${key}`;
                        const editedValue = editedValues[editKey]?.value;

                        return (
                            <div key={key} className="lw-platformSettings__settingRow">
                                <div className="lw-platformSettings__settingLabel">
                                    <Text14 className="lw-platformSettings__settingName">
                                        {setting.label || key}
                                    </Text14>
                                    {setting.description && (
                                        <span className="lw-platformSettings__settingDesc">
                                            {setting.description}
                                        </span>
                                    )}
                                </div>
                                <div className="lw-platformSettings__settingInput">
                                    <SettingInput
                                        setting={setting}
                                        value={editedValue}
                                        onChange={(val) => handleSettingChange(activeTab, key, val)}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
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
                    <div className="lw-platformSettings__tabs">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.key}
                                className={`lw-platformSettings__tab ${activeTab === cat.key ? "lw-platformSettings__tab--active" : ""}`}
                                onClick={() => setActiveTab(cat.key)}
                            >
                                <span className="lw-platformSettings__tabIcon">{cat.icon}</span>
                                <span className="lw-platformSettings__tabLabel">{cat.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Content area */}
                    <div className="lw-platformSettings__content">
                        {renderContent()}

                        {/* Save bar (only for settings tabs, not channels/admins) */}
                        {hasEdits && activeTab !== "channels" && activeTab !== "admins" && (
                            <div className="lw-platformSettings__saveBar">
                                <SimpleButton
                                    className="lw-platformSettings__saveBtn"
                                    onClick={handleSave}
                                    disabled={isSaving}
                                >
                                    {isSaving ? "שומר..." : "שמור שינויים"}
                                </SimpleButton>
                                <SimpleButton
                                    className="lw-platformSettings__cancelBtn"
                                    onClick={() => setEditedValues({})}
                                >
                                    ביטול
                                </SimpleButton>
                            </div>
                        )}
                    </div>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
