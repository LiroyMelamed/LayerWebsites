import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { staffRolesApi } from "../../api/staffRolesApi";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimplePopUp from "../../components/simpleComponents/SimplePopUp";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import GenericButton from "../../components/styledComponents/buttons/GenericButton";
import SimpleInput from "../../components/simpleComponents/SimpleInput";
import { AdminStackName, MainScreenName } from "../../navigation/screenPaths";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { images } from "../../assets/images/images";
import { buttonSizes } from "../../styles/buttons/buttonSizes";
import { colors } from "../../constant/colors";

import "./FirmStaffRolesScreen.scss";

export const FirmStaffRolesScreenName = "/FirmStaffRoles";

function emptyAreaState(catalog) {
    const areas = {};
    for (const a of catalog?.areas || []) {
        areas[a.id] = {
            visible: false,
            actions: [],
            ...(a.supportsDataScope ? { dataScope: "assigned_only" } : {}),
        };
    }
    return areas;
}

function assignedUsersLabel(count, t) {
    const n = Number(count) || 0;
    if (n === 0) return t("firmStaffRoles.assignedNone", "אין משתמשים משויכים");
    if (n === 1) return t("firmStaffRoles.assignedOne", "משויך למשתמש אחד");
    return t("firmStaffRoles.assignedMany", "משויך ל-{{count}} משתמשים", { count: n });
}

function rolePermissionSummary(role, catalog, t) {
    const areas = role?.permissions?.areas || {};
    const visible = (catalog?.areas || []).filter((a) => areas[a.id]?.visible);
    if (!visible.length) {
        return t("firmStaffRoles.noPermissions", "ללא הרשאות פעילות");
    }
    const labels = visible.slice(0, 4).map((a) => t(`firmStaffRoles.areas.${a.id}`, a.id));
    const rest = visible.length > 4 ? ` +${visible.length - 4}` : "";
    return labels.join(" · ") + rest;
}

function RoleEditor({ catalog, initial, assignedUserCount, onSave, onCancel, saving, isCreate }) {
    const { t } = useTranslation();
    const [name, setName] = useState(initial?.name || "");
    const [areas, setAreas] = useState(() => initial?.permissions?.areas || emptyAreaState(catalog));

    useEffect(() => {
        if (initial?.permissions?.areas) setAreas(initial.permissions.areas);
    }, [initial]);

    const toggleVisible = (areaId) => {
        setAreas((prev) => ({
            ...prev,
            [areaId]: { ...prev[areaId], visible: !prev[areaId]?.visible },
        }));
    };

    const toggleAction = (areaId, action) => {
        setAreas((prev) => {
            const cur = prev[areaId] || { visible: false, actions: [] };
            const set = new Set(cur.actions || []);
            if (set.has(action)) set.delete(action);
            else set.add(action);
            return { ...prev, [areaId]: { ...cur, actions: [...set] } };
        });
    };

    const setDataScope = (areaId, dataScope) => {
        setAreas((prev) => ({
            ...prev,
            [areaId]: { ...prev[areaId], dataScope },
        }));
    };

    return (
        <SimpleContainer className="lw-firmStaffRoles__editor">
            <h2 className="lw-firmStaffRoles__editorTitle">
                {isCreate
                    ? t("firmStaffRoles.createRoleTitle", "תפקיד חדש")
                    : t("firmStaffRoles.editRoleTitle", "עריכת תפקיד")}
            </h2>
            <label className="lw-firmStaffRoles__fieldLabel">{t("firmStaffRoles.roleName", "שם תפקיד")}</label>
            <SimpleInput
                className="lw-firmStaffRoles__fieldInput"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("firmStaffRoles.roleNamePlaceholder", "לדוגמה: מזכירות")}
            />
            {!isCreate && assignedUserCount > 0 && (
                <p className="lw-firmStaffRoles__affected">
                    {t("firmStaffRoles.affectedCount", "{{count}} משתמשים יושפעו משינוי זה", {
                        count: assignedUserCount,
                    })}
                </p>
            )}
            <p className="lw-firmStaffRoles__editorHint">
                {t("firmStaffRoles.permissionsHint", "סמן אילו אזורים במערכת התפקיד יכול לראות ומה מותר לו לעשות.")}
            </p>
            <SimpleContainer className="lw-firmStaffRoles__permissionMatrix">
                {(catalog?.areas || []).map((area) => (
                    <SimpleContainer key={area.id} className="lw-firmStaffRoles__areaBlock">
                        <label className="lw-firmStaffRoles__areaTitle">
                            <input
                                type="checkbox"
                                checked={Boolean(areas[area.id]?.visible)}
                                onChange={() => toggleVisible(area.id)}
                            />
                            <span>{t(`firmStaffRoles.areas.${area.id}`, area.id)}</span>
                        </label>
                        {area.supportsDataScope && areas[area.id]?.visible && (
                            <SimpleContainer className="lw-firmStaffRoles__scopeRow">
                                <span className="lw-firmStaffRoles__scopeLabel">
                                    {t("firmStaffRoles.dataScopeLabel", "היקף נתונים")}
                                </span>
                                <label className="lw-firmStaffRoles__scopeOption">
                                    <input
                                        type="radio"
                                        name={`scope-${area.id}`}
                                        checked={areas[area.id]?.dataScope !== "all_firm"}
                                        onChange={() => setDataScope(area.id, "assigned_only")}
                                    />
                                    {t("firmStaffRoles.scopeAssigned", "רשומות משויכות בלבד")}
                                </label>
                                <label className="lw-firmStaffRoles__scopeOption">
                                    <input
                                        type="radio"
                                        name={`scope-${area.id}`}
                                        checked={areas[area.id]?.dataScope === "all_firm"}
                                        onChange={() => setDataScope(area.id, "all_firm")}
                                    />
                                    {t("firmStaffRoles.scopeAllFirm", "כל המשרד")}
                                </label>
                            </SimpleContainer>
                        )}
                        {areas[area.id]?.visible && (
                            <SimpleContainer className="lw-firmStaffRoles__actionsGrid">
                                {(area.actions || []).map((action) => (
                                    <label key={action} className="lw-firmStaffRoles__action">
                                        <input
                                            type="checkbox"
                                            checked={(areas[area.id]?.actions || []).includes(action)}
                                            onChange={() => toggleAction(area.id, action)}
                                        />
                                        <span>{t(`firmStaffRoles.actions.${area.id}.${action}`, action)}</span>
                                    </label>
                                ))}
                            </SimpleContainer>
                        )}
                    </SimpleContainer>
                ))}
            </SimpleContainer>
            <SimpleContainer className="lw-firmStaffRoles__editorActions">
                <PrimaryButton
                    size={buttonSizes.MEDIUM}
                    className="lw-firmStaffRoles__btnInline"
                    disabled={saving || !name.trim()}
                    onPress={() => onSave({ name: name.trim(), permissions: { areas } })}
                >
                    {t("common.save", "שמירה")}
                </PrimaryButton>
                <SecondaryButton size={buttonSizes.MEDIUM} className="lw-firmStaffRoles__btnInline" onPress={onCancel}>
                    {t("common.cancel", "ביטול")}
                </SecondaryButton>
            </SimpleContainer>
        </SimpleContainer>
    );
}

export default function FirmStaffRolesScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();
    const [catalog, setCatalog] = useState(null);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [rollout, setRollout] = useState(null);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const [cat, r, rolloutSummary] = await Promise.all([
                staffRolesApi.getPermissionCatalog(),
                staffRolesApi.listRoles(),
                staffRolesApi.getRolloutSummary().catch(() => null),
            ]);
            setCatalog(cat);
            setRoles(r);
            setRollout(rolloutSummary);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    const onSaveRole = async (payload) => {
        setSaving(true);
        try {
            if (editing?.id) {
                await staffRolesApi.updateRole(editing.id, payload);
            } else {
                await staffRolesApi.createRole(payload);
            }
            setEditing(null);
            setCreating(false);
            await reload();
        } finally {
            setSaving(false);
        }
    };

    const onDeactivateRole = async (role) => {
        if (!role?.id || saving) return;
        const count = role.assignedUserCount ?? 0;
        if (count > 0) return;
        const ok = window.confirm(
            t(
                "firmStaffRoles.deactivateConfirm",
                "להשבית את התפקיד «{{name}}»? לא ניתן לשחזר מהממשק.",
                { name: role.name },
            ),
        );
        if (!ok) return;
        setSaving(true);
        try {
            await staffRolesApi.deactivateRole(role.id);
            if (editing?.id === role.id) {
                setEditing(null);
            }
            await reload();
        } catch (e) {
            const msg = e?.data?.message || e?.message || t("firmStaffRoles.deactivateFailed", "השבתת התפקיד נכשלה");
            window.alert(msg);
        } finally {
            setSaving(false);
        }
    };

    const roleEditorOpen = Boolean(catalog && (creating || editing));

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && (
                <TopToolBarSmallScreen chosenNavKey="firmStaffRoles" LogoNavigate={AdminStackName + MainScreenName} />
            )}
            <SimpleScrollView className="lw-firmStaffRoles__scroll">
                <SimpleContainer className="lw-firmStaffRoles">
                    <SimpleContainer className="lw-firmStaffRoles__header">
                        <SimpleContainer className="lw-firmStaffRoles__headerText">
                            <h1 className="lw-firmStaffRoles__title">{t("firmStaffRoles.title", "תפקידים והרשאות")}</h1>
                            <p className="lw-firmStaffRoles__subtitle">
                                {t(
                                    "firmStaffRoles.subtitleRolesOnly",
                                    "הגדרת תפקידים והרשאות. שיוך למשתמשים מתבצע בכרטיס המנהל/עורך הדין.",
                                )}
                            </p>
                            {rollout && typeof rollout.withoutCustomRole === "number" ? (
                                <p className="lw-firmStaffRoles__rollout">
                                    {t("firmStaffRoles.rolloutSummary", "משתמשי משרד ללא תפקיד מותאם: {{count}} מתוך {{total}}", {
                                        count: rollout.withoutCustomRole,
                                        total: rollout.totalOfficeUsers,
                                    })}
                                </p>
                            ) : null}
                            {!loading && (
                                <PrimaryButton
                                    size={buttonSizes.MEDIUM}
                                    className="lw-firmStaffRoles__headerCta"
                                    onPress={() => {
                                        setCreating(true);
                                        setEditing(null);
                                    }}
                                >
                                    {t("firmStaffRoles.createRole", "תפקיד חדש")}
                                </PrimaryButton>
                            )}
                        </SimpleContainer>
                    </SimpleContainer>

                    {loading && <p className="lw-firmStaffRoles__loading">{t("common.loading", "טוען…")}</p>}

                    {!loading && (
                        <>
                            <SimpleContainer className="lw-firmStaffRoles__rolesGrid">
                                {roles.map((r) => {
                                    const assigned = r.assignedUserCount ?? 0;
                                    const canDeactivate = assigned === 0;
                                    return (
                                        <SimpleContainer key={r.id} className="lw-firmStaffRoles__roleCard" data-role-card>
                                            <SimpleContainer className="lw-firmStaffRoles__roleCardBody">
                                                <h3 className="lw-firmStaffRoles__roleName" title={r.name}>
                                                    {r.name}
                                                </h3>
                                                <span
                                                    className={
                                                        assigned > 0
                                                            ? "lw-firmStaffRoles__badge lw-firmStaffRoles__badge--assigned"
                                                            : "lw-firmStaffRoles__badge"
                                                    }
                                                >
                                                    {assignedUsersLabel(assigned, t)}
                                                </span>
                                                <p className="lw-firmStaffRoles__roleSummary">
                                                    {rolePermissionSummary(r, catalog, t)}
                                                </p>
                                            </SimpleContainer>
                                            <SimpleContainer className="lw-firmStaffRoles__roleCardFooter">
                                                <SecondaryButton
                                                    size={buttonSizes.MEDIUM}
                                                    className="lw-firmStaffRoles__btnInline"
                                                    onPress={() => {
                                                        setEditing(r);
                                                        setCreating(false);
                                                    }}
                                                >
                                                    {t("common.edit", "עריכה")}
                                                </SecondaryButton>
                                                {canDeactivate ? (
                                                    <GenericButton
                                                        size={buttonSizes.MEDIUM}
                                                        className="lw-firmStaffRoles__btnInline lw-firmStaffRoles__btnDanger"
                                                        backgroundColor={colors.darkRed}
                                                        pressedBackgroundColor={colors.negative}
                                                        disabledBackgroundColor={colors.disabled}
                                                        contentColor={colors.white}
                                                        pressedContentColor={colors.white}
                                                        disabledContentColor={colors.disabledHighlighted}
                                                        disabled={saving}
                                                        onPress={() => onDeactivateRole(r)}
                                                    >
                                                        {t("firmStaffRoles.deactivate", "השבתה")}
                                                    </GenericButton>
                                                ) : (
                                                    <SecondaryButton
                                                        size={buttonSizes.MEDIUM}
                                                        className="lw-firmStaffRoles__btnInline lw-firmStaffRoles__btnDeactivateDisabled"
                                                        disabled
                                                        title={t(
                                                            "firmStaffRoles.deactivateBlocked",
                                                            "לא ניתן להשבית — יש משתמשים משויכים לתפקיד",
                                                        )}
                                                    >
                                                        {t("firmStaffRoles.deactivate", "השבתה")}
                                                    </SecondaryButton>
                                                )}
                                            </SimpleContainer>
                                        </SimpleContainer>
                                    );
                                })}
                            </SimpleContainer>
                            {!roles.length && (
                                <p className="lw-firmStaffRoles__empty">{t("firmStaffRoles.noRoles", "אין תפקידים עדיין")}</p>
                            )}
                        </>
                    )}
                </SimpleContainer>
            </SimpleScrollView>

            <SimplePopUp
                isOpen={roleEditorOpen}
                onClose={() => {
                    setCreating(false);
                    setEditing(null);
                }}
                className="lw-firmStaffRoles__modal"
            >
                {roleEditorOpen && (
                    <RoleEditor
                        catalog={catalog}
                        initial={editing || undefined}
                        assignedUserCount={editing?.assignedUserCount ?? 0}
                        saving={saving}
                        isCreate={creating}
                        onSave={onSaveRole}
                        onCancel={() => {
                            setCreating(false);
                            setEditing(null);
                        }}
                    />
                )}
            </SimplePopUp>
        </SimpleScreen>
    );
}
