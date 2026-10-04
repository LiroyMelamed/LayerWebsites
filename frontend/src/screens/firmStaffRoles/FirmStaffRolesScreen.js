import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { staffRolesApi } from "../../api/staffRolesApi";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../components/styledComponents/buttons/SecondaryButton";
import SimpleInput from "../../components/simpleComponents/SimpleInput";
import { AdminStackName, MainScreenName } from "../../navigation/screenPaths";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { images } from "../../assets/images/images";

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

function RoleEditor({ catalog, initial, assignedUserCount, onSave, onCancel, saving }) {
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
            <SimpleInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("firmStaffRoles.roleName", "שם תפקיד")}
            />
            {assignedUserCount > 0 && (
                <p className="lw-firmStaffRoles__affected">
                    {t("firmStaffRoles.affectedCount", "{{count}} עובדים יושפעו משינוי זה", {
                        count: assignedUserCount,
                    })}
                </p>
            )}
            {(catalog?.areas || []).map((area) => (
                <SimpleContainer key={area.id} className="lw-firmStaffRoles__areaBlock">
                    <label className="lw-firmStaffRoles__areaTitle">
                        <input
                            type="checkbox"
                            checked={Boolean(areas[area.id]?.visible)}
                            onChange={() => toggleVisible(area.id)}
                        />
                        {t(`firmStaffRoles.areas.${area.id}`, area.id)}
                    </label>
                    {areas[area.id]?.visible && area.supportsDataScope && (
                        <SimpleContainer className="lw-firmStaffRoles__scopeRow">
                            <label>
                                <input
                                    type="radio"
                                    name={`scope-${area.id}`}
                                    checked={areas[area.id]?.dataScope === "assigned_only"}
                                    onChange={() => setDataScope(area.id, "assigned_only")}
                                />
                                {t("firmStaffRoles.scopeAssigned", "רשומות משויכות בלבד")}
                            </label>
                            <label>
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
                    {areas[area.id]?.visible &&
                        (area.actions || []).map((action) => (
                            <label key={action} className="lw-firmStaffRoles__action">
                                <input
                                    type="checkbox"
                                    checked={(areas[area.id]?.actions || []).includes(action)}
                                    onChange={() => toggleAction(area.id, action)}
                                />
                                {t(`firmStaffRoles.actions.${area.id}.${action}`, action)}
                            </label>
                        ))}
                </SimpleContainer>
            ))}
            <SimpleContainer className="lw-firmStaffRoles__editorActions">
                <PrimaryButton disabled={saving || !name.trim()} onPress={() => onSave({ name: name.trim(), permissions: { areas } })}>
                    {t("common.save", "שמירה")}
                </PrimaryButton>
                <SecondaryButton onPress={onCancel}>{t("common.cancel", "ביטול")}</SecondaryButton>
            </SimpleContainer>
        </SimpleContainer>
    );
}

export default function FirmStaffRolesScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();
    const [catalog, setCatalog] = useState(null);
    const [roles, setRoles] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [empForm, setEmpForm] = useState(null);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const [cat, r, e] = await Promise.all([
                staffRolesApi.getPermissionCatalog(),
                staffRolesApi.listRoles(),
                staffRolesApi.listEmployees(),
            ]);
            setCatalog(cat);
            setRoles(r);
            setEmployees(e);
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

    const onSaveEmployee = async () => {
        if (!empForm?.firmStaffRoleId) return;
        setSaving(true);
        try {
            if (empForm.userid) {
                await staffRolesApi.updateEmployee(empForm.userid, empForm);
            } else {
                await staffRolesApi.createEmployee(empForm);
            }
            setEmpForm(null);
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

    const roleOptions = useMemo(() => roles.map((r) => ({ id: r.id, name: r.name })), [roles]);

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && (
                <TopToolBarSmallScreen chosenNavKey="firmStaffRoles" LogoNavigate={AdminStackName + MainScreenName} />
            )}
            <SimpleScrollView>
                <SimpleContainer className="lw-firmStaffRoles">
                    <h1 className="lw-firmStaffRoles__title">{t("firmStaffRoles.title", "תפקידים והרשאות")}</h1>
                    {loading && <p>{t("common.loading", "טוען…")}</p>}

                    {!loading && !creating && !editing && (
                        <>
                            <PrimaryButton onPress={() => setCreating(true)}>
                                {t("firmStaffRoles.createRole", "תפקיד חדש")}
                            </PrimaryButton>
                            {roles.map((r) => (
                                <SimpleContainer key={r.id} className="lw-firmStaffRoles__roleCard">
                                    <strong>{r.name}</strong>
                                    <span>
                                        {t("firmStaffRoles.assignedShort", "{{count}} עובדים", {
                                            count: r.assignedUserCount ?? 0,
                                        })}
                                    </span>
                                    <SecondaryButton onPress={() => setEditing(r)}>
                                        {t("common.edit", "עריכה")}
                                    </SecondaryButton>
                                    {(r.assignedUserCount ?? 0) > 0 ? (
                                        <span className="lw-firmStaffRoles__deactivateHint" title={t("firmStaffRoles.deactivateBlocked", "לא ניתן להשבית — יש עובדים משויכים")}>
                                            {t("firmStaffRoles.deactivateBlockedShort", "לא ניתן להשבית ({{count}} עובדים)", {
                                                count: r.assignedUserCount,
                                            })}
                                        </span>
                                    ) : (
                                        <SecondaryButton disabled={saving} onPress={() => onDeactivateRole(r)}>
                                            {t("firmStaffRoles.deactivate", "השבתת תפקיד")}
                                        </SecondaryButton>
                                    )}
                                </SimpleContainer>
                            ))}

                            <h2>{t("firmStaffRoles.employees", "עובדים")}</h2>
                            <PrimaryButton
                                onPress={() =>
                                    setEmpForm({
                                        name: "",
                                        email: "",
                                        phoneNumber: "",
                                        password: "",
                                        firmStaffRoleId: roleOptions[0]?.id || "",
                                    })
                                }
                            >
                                {t("firmStaffRoles.addEmployee", "עובד חדש")}
                            </PrimaryButton>
                            {employees.map((e) => (
                                <SimpleContainer key={e.userid} className="lw-firmStaffRoles__empRow">
                                    <span>{e.name}</span>
                                    <span>{e.firm_staff_role_name || "—"}</span>
                                    <SecondaryButton
                                        onPress={() =>
                                            setEmpForm({
                                                userid: e.userid,
                                                name: e.name,
                                                email: e.email || "",
                                                phoneNumber: e.phonenumber || "",
                                                firmStaffRoleId: e.firm_staff_role_id || "",
                                            })
                                        }
                                    >
                                        {t("common.edit", "עריכה")}
                                    </SecondaryButton>
                                </SimpleContainer>
                            ))}
                        </>
                    )}

                    {(creating || editing) && catalog && (
                        <RoleEditor
                            catalog={catalog}
                            initial={editing || undefined}
                            assignedUserCount={editing?.assignedUserCount ?? 0}
                            saving={saving}
                            onSave={onSaveRole}
                            onCancel={() => {
                                setCreating(false);
                                setEditing(null);
                            }}
                        />
                    )}

                    {empForm && (
                        <SimpleContainer className="lw-firmStaffRoles__empForm">
                            <SimpleInput value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} placeholder={t("common.name", "שם")} />
                            <SimpleInput value={empForm.phoneNumber} onChange={(e) => setEmpForm({ ...empForm, phoneNumber: e.target.value })} placeholder={t("common.phone", "טלפון")} />
                            <SimpleInput value={empForm.email} onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })} placeholder={t("common.email", "אימייל")} />
                            {!empForm.userid && (
                                <SimpleInput
                                    value={empForm.password}
                                    onChange={(e) => setEmpForm({ ...empForm, password: e.target.value })}
                                    placeholder={t("common.password", "סיסמה")}
                                    type="password"
                                />
                            )}
                            <select
                                className="lw-firmStaffRoles__roleSelect"
                                value={empForm.firmStaffRoleId}
                                onChange={(ev) => setEmpForm({ ...empForm, firmStaffRoleId: ev.target.value })}
                            >
                                {roleOptions.map((o) => (
                                    <option key={o.id} value={o.id}>
                                        {o.name}
                                    </option>
                                ))}
                            </select>
                            <PrimaryButton disabled={saving} onPress={onSaveEmployee}>
                                {t("common.save", "שמירה")}
                            </PrimaryButton>
                            <SecondaryButton onPress={() => setEmpForm(null)}>{t("common.cancel", "ביטול")}</SecondaryButton>
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
