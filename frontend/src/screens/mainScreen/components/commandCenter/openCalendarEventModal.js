import CalendarEventModalLoader from "./CalendarEventModalLoader";
import { resolveShowPopup } from "../../../../utils/popupStackUtils";

/**
 * Open a calendar event in EventFormModal without leaving the current page.
 */
export function openCalendarEventModal({
    eventId,
    openPopup,
    pushPopup,
    closePopup,
    popPopup,
    onSaved,
    onDeleted,
    onDuplicatePrefill,
}) {
    const showPopup = resolveShowPopup({ pushPopup, openPopup });
    if (!eventId || !showPopup) return false;

    showPopup(
        <CalendarEventModalLoader
            eventId={eventId}
            closePopup={closePopup}
            popPopup={popPopup}
            onSaved={onSaved}
            onDeleted={onDeleted}
            onDuplicatePrefill={onDuplicatePrefill}
        />,
    );
    return true;
}
