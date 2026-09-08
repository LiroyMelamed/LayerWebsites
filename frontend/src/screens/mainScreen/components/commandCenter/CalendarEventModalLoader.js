import { useEffect, useState } from "react";
import calendarApi from "../../../../api/calendarApi";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../../components/simpleComponents/Skeleton";
import { toastFromApiError } from "../../../../components/ui/showAppToast";
import EventFormModal from "../../../calendarScreen/components/EventFormModal";

function eventFormModalKey(event) {
    return `event-${event?.id ?? "new"}-${event?.startTime ?? ""}`;
}

export default function CalendarEventModalLoader({
    eventId,
    closePopup,
    popPopup,
    onSaved,
    onDeleted,
    onDuplicatePrefill,
}) {
    const [eventPayload, setEventPayload] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const res = await calendarApi.getEvent(eventId);
                const event = res?.data?.event;
                if (res.status !== 200 || !event) {
                    throw new Error("Event not found");
                }

                if (cancelled) return;

                setEventPayload({
                    ...event,
                    id: Number(event.id),
                });
            } catch (err) {
                if (cancelled) return;
                setFailed(true);
                toastFromApiError(err, "לא ניתן לפתוח את הפגישה");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [eventId]);

    const handleDone = (callback) => {
        callback?.();
        if (popPopup) {
            popPopup();
            return;
        }
        closePopup?.();
    };

    if (eventPayload) {
        return (
            <EventFormModal
                key={eventFormModalKey(eventPayload)}
                event={eventPayload}
                onUpdated={() => {}}
                onSaved={(saved) => handleDone(() => onSaved?.(saved))}
                onDuplicatePrefill={onDuplicatePrefill}
                onDeleted={(deletedId) => handleDone(() => onDeleted?.(deletedId))}
                onClose={popPopup || closePopup}
            />
        );
    }

    if (failed) {
        return (
            <SimpleContainer className="lw-calendarEventModal lw-calendarEventModal--loading">
                <Skeleton width="100%" height={20} borderRadius={4} />
            </SimpleContainer>
        );
    }

    return (
        <SimpleContainer className="lw-calendarEventModal lw-calendarEventModal--loading">
            <Skeleton width="100%" height={24} borderRadius={6} />
            <Skeleton width="88%" height={16} borderRadius={4} />
            <Skeleton width="72%" height={120} borderRadius={8} />
        </SimpleContainer>
    );
}
