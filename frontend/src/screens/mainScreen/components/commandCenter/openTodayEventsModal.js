import TodayEventsModal from "./TodayEventsModal";

export function openTodayEventsModal({
    events = [],
    openPopup,
    onEventPress,
}) {
    if (!openPopup) return false;

    openPopup(
        <TodayEventsModal
            events={events}
            onEventPress={(ev) => onEventPress?.(ev, { usePush: true })}
        />,
    );
    return true;
}
