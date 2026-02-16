import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import { Text20, Text14, Text12 } from "../../../components/specializedComponents/text/AllTextKindFile";
import useHttpRequest from "../../../hooks/useHttpRequest";
import remindersApi from "../../../api/remindersApi";

import "./ReminderDetailPopup.scss";

function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function toDatetimeLocal(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DetailRow({ label, children }) {
    return (
        <SimpleContainer className="lw-reminderDetail__row">
            <Text12 className="lw-reminderDetail__label">{label}</Text12>
            <SimpleContainer className="lw-reminderDetail__value">{children}</SimpleContainer>
        </SimpleContainer>
    );
}

export default function ReminderDetailPopup({ reminder, closePopUpFunction, onCancel, onDelete, onUpdated }) {
    const { t } = useTranslation();
    const isPending = reminder?.status === "PENDING";

    const [editing, setEditing] = useState(false);
    const [editData, setEditData] = useState({
        client_name: reminder?.client_name || "",
        to_email: reminder?.to_email || "",
        subject: reminder?.subject || "",
        scheduled_for: toDatetimeLocal(reminder?.scheduled_for),
    });

    const { isPerforming: isSaving, performRequest: saveReminder } = useHttpRequest(
        (id, fields) => remindersApi.updateReminder(id, fields),
        () => {
            setEditing(false);
            onUpdated?.();
        },
        () => { }
    );

    const handleSave = () => {
        const payload = {
            client_name: editData.client_name,
            to_email: editData.to_email,
            subject: editData.subject,
            scheduled_for: editData.scheduled_for ? new Date(editData.scheduled_for).toISOString() : undefined,
        };
        saveReminder(reminder.id, payload);
    };

    if (!reminder) return null;

    const statusKey = (reminder.status || "").toLowerCase();

    return (
        <SimpleContainer className="lw-reminderDetail">
            <Text20 className="lw-reminderDetail__title">{t("reminders.detail.title")}</Text20>

            <SimpleContainer className="lw-reminderDetail__card">
                <DetailRow label={t("reminders.col.clientName")}>
                    {editing ? (
                        <SimpleInput
                            value={editData.client_name}
                            onChange={(e) => setEditData((prev) => ({ ...prev, client_name: e.target.value }))}
                            className="lw-reminderDetail__editInput"
                        />
                    ) : (
                        <Text14>{reminder.client_name || "—"}</Text14>
                    )}
                </DetailRow>

                <DetailRow label={t("reminders.col.email")}>
                    {editing ? (
                        <SimpleInput
                            type="email"
                            value={editData.to_email}
                            onChange={(e) => setEditData((prev) => ({ ...prev, to_email: e.target.value }))}
                            className="lw-reminderDetail__editInput"
                        />
                    ) : (
                        <Text14>{reminder.to_email || "—"}</Text14>
                    )}
                </DetailRow>

                <DetailRow label={t("reminders.col.template")}>
                    <Text14>{t(`reminders.col.templateKeys.${reminder.template_key}`, { defaultValue: reminder.template_key }) || "—"}</Text14>
                </DetailRow>

                <DetailRow label={t("reminders.col.scheduledFor")}>
                    {editing ? (
                        <SimpleInput
                            type="datetime-local"
                            value={editData.scheduled_for}
                            onChange={(e) => setEditData((prev) => ({ ...prev, scheduled_for: e.target.value }))}
                            className="lw-reminderDetail__editInput"
                        />
                    ) : (
                        <Text14>{formatDate(reminder.scheduled_for)}</Text14>
                    )}
                </DetailRow>

                <DetailRow label={t("reminders.col.status")}>
                    <SimpleContainer className={`lw-reminderDetail__badge lw-reminderDetail__badge--${statusKey}`}>
                        <Text12>{t(`reminders.status.${statusKey}`)}</Text12>
                    </SimpleContainer>
                </DetailRow>

                <DetailRow label={t("reminders.col.sentAt")}>
                    <Text14>{reminder.sent_at ? formatDate(reminder.sent_at) : "—"}</Text14>
                </DetailRow>

                {(editing || reminder.subject) && (
                    <DetailRow label={t("reminders.detail.subject")}>
                        {editing ? (
                            <SimpleInput
                                value={editData.subject}
                                onChange={(e) => setEditData((prev) => ({ ...prev, subject: e.target.value }))}
                                className="lw-reminderDetail__editInput"
                            />
                        ) : (
                            <Text14>{reminder.subject}</Text14>
                        )}
                    </DetailRow>
                )}

                {reminder.error && (
                    <DetailRow label={t("reminders.detail.error")}>
                        <Text14 className="lw-reminderDetail__errorText">{reminder.error}</Text14>
                    </DetailRow>
                )}
            </SimpleContainer>

            <SimpleContainer className="lw-reminderDetail__actions">
                {editing ? (
                    <>
                        <PrimaryButton onPress={handleSave} isPerforming={isSaving}>
                            {isSaving ? t("reminders.detail.saving") : t("reminders.detail.save")}
                        </PrimaryButton>
                        <SecondaryButton onPress={() => setEditing(false)}>
                            {t("common.cancel")}
                        </SecondaryButton>
                    </>
                ) : (
                    <>
                        {isPending && (
                            <PrimaryButton onPress={() => setEditing(true)}>
                                {t("reminders.detail.edit")}
                            </PrimaryButton>
                        )}
                        {isPending && onCancel && (
                            <PrimaryButton onPress={() => { onCancel(reminder.id); closePopUpFunction?.(); }}>
                                {t("reminders.cancel")}
                            </PrimaryButton>
                        )}
                        {onDelete && (
                            <PrimaryButton
                                className="lw-reminderDetail__deleteBtn"
                                onPress={() => { onDelete(reminder.id); closePopUpFunction?.(); }}
                            >
                                {t("reminders.deleteReminder")}
                            </PrimaryButton>
                        )}
                        <SecondaryButton onPress={closePopUpFunction}>
                            {t("common.close")}
                        </SecondaryButton>
                    </>
                )}
            </SimpleContainer>
        </SimpleContainer>
    );
}
