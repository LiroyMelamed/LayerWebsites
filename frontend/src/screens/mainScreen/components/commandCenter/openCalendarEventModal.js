import calendarApi from "../../../../api/calendarApi";
import EventFormModal from "../../../calendarScreen/components/EventFormModal";
import { toastFromApiError } from "../../../../components/ui/showAppToast";

function eventFormModalKey(event) {
    return `event-${event?.id ?? "new"}-${event?.startTime ?? ""}`;
}

/**
 * Open a calendar event in EventFormModal without leaving the current page.
 */
export async function openCalendarEventModal({
    eventId,
    openPopup,
    closePopup,
    onSaved,
    onDeleted,
    onDuplicatePrefill,
}) {
    if (!eventId || !openPopup || !closePopup) return false;

    try {
        const res = await calendarApi.getEvent(eventId);
        const event = res?.data?.event;
        if (res.status !== 200 || !event) {
            throw new Error("Event not found");
        }

        const eventPayload = {
            ...event,
            id: Number(event.id),
        };

        openPopup(
            <EventFormModal
                key={eventFormModalKey(eventPayload)}
                event={eventPayload}
                onUpdated={() => {}}
                onSaved={(saved) => {
                    onSaved?.(saved);
                    closePopup();
                }}
                onDuplicatePrefill={onDuplicatePrefill}
                onDeleted={(deletedId) => {
                    onDeleted?.(deletedId);
                    closePopup();
                }}
                onClose={closePopup}
            />
        );
        return true;
    } catch (err) {
        toastFromApiError(err, "לא ניתן לפתוח את הפגישה");
        return false;
    }
}
