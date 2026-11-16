import React from 'react';
import { CalendarAgenda } from './CalendarAgenda';
import { calendarDateKey } from '../utils/calendarPresentation';

/** Reuse the application's popup and agenda instead of FullCalendar's popover. */
export function openCalendarDayEvents(info, openPopup, props) {
    const instances = new Map();
    for (const { event } of info.allSegs || []) {
        if (event) instances.set(`${event.id}:${event.startStr || event.start}`, event);
    }
    openPopup(<section className="lw-calendarDayEventsPopup">
        <CalendarAgenda {...props} events={[...instances.values()]} date={calendarDateKey(info.date)} heading />
    </section>);
    // FullCalendar 6 opens its own popover for falsy results and navigates for
    // strings. A truthy non-string marks the click as handled by our popup.
    return true;
}
