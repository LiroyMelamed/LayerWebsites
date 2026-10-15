import remindersApi from "../../../../api/remindersApi";
import ReminderDetailPopup from "../../../remindersScreen/components/ReminderDetailPopup";
import { toastFromApiError } from "../../../../components/ui/showAppToast";

/**
 * Open a reminder detail popup without leaving the current page.
 */
export async function openReminderModal({
    reminderId,
    openPopup,
    closePopup,
    onChanged,
    resolveTemplateLabel,
}) {
    if (!reminderId || !openPopup || !closePopup) return false;

    try {
        const res = await remindersApi.getReminder(reminderId);
        const reminder = res?.data?.reminder || res?.data;
        if (!reminder?.id && !reminder?.Id) {
            throw new Error("Reminder not found");
        }

        openPopup(
            <ReminderDetailPopup
                reminder={reminder}
                closePopUpFunction={closePopup}
                onCancel={async (id) => {
                    await remindersApi.cancelReminder(id);
                    onChanged?.();
                }}
                onDelete={async (id) => {
                    await remindersApi.deleteReminder(id);
                    onChanged?.();
                }}
                onUpdated={() => onChanged?.()}
                resolveTemplateLabel={resolveTemplateLabel || ((key) => key || "—")}
            />
        );
        return true;
    } catch (err) {
        toastFromApiError(err, "לא ניתן לפתוח את התזכורת");
        return false;
    }
}
