'use strict';

const EVENT_STATUS_SCHEDULED = 'scheduled';
const EVENT_STATUS_CANCELLED = 'cancelled';

function normalizeEventStatus(raw) {
    const v = String(raw ?? EVENT_STATUS_SCHEDULED).trim().toLowerCase();
    return v === EVENT_STATUS_CANCELLED ? EVENT_STATUS_CANCELLED : EVENT_STATUS_SCHEDULED;
}

function isEventCancelled(raw) {
    return normalizeEventStatus(raw) === EVENT_STATUS_CANCELLED;
}

/** SQL fragment: only events that should still receive reminders / deferred invites. */
function activeEventStatusSql(column = 'ce.event_status') {
    return `COALESCE(${column}, '${EVENT_STATUS_SCHEDULED}') = '${EVENT_STATUS_SCHEDULED}'`;
}

module.exports = {
    EVENT_STATUS_SCHEDULED,
    EVENT_STATUS_CANCELLED,
    normalizeEventStatus,
    isEventCancelled,
    activeEventStatusSql,
};
