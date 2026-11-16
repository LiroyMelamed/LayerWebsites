// A touch must remain an ordinary tap/scroll until the user deliberately holds
// the event. FullCalendar applies this delay only to touch, not mouse dragging.
export function calendarEventInteractionOptions(isSmallScreen) {
    return {
        eventLongPressDelay: 600,
        ...(isSmallScreen ? { eventMinHeight: 44 } : {}),
    };
}
