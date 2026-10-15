'use strict';
const { fail } = require('./validation');
const TIME_ZONE = 'Asia/Jerusalem';

function courtSchedule(input, previous = {}) {
    const dailySyncEnabled = input.dailySyncEnabled ?? previous.dailySyncEnabled ?? true;
    const syncTime = input.syncTime ?? previous.syncTime ?? '08:00';
    if (typeof dailySyncEnabled !== 'boolean' || typeof syncTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(syncTime)) {
        fail('INVALID_SYNC_SCHEDULE', 'יש לבחור שעת סנכרון תקינה בתבנית שעות ודקות');
    }
    return { dailySyncEnabled, syncTime };
}

async function scheduleNext(db, connectionId, enabled, settings, now = new Date()) {
    // Calendar arithmetic stays in PostgreSQL so DST and the host timezone cannot
    // shift the office's selected time. A schedule edit cannot run twice today.
    await db.query(`UPDATE office_integrations SET next_sync_at=CASE WHEN $2 THEN
        (GREATEST(
            ($3::timestamptz AT TIME ZONE 'Asia/Jerusalem')::date + CASE WHEN
                ((($3::timestamptz AT TIME ZONE 'Asia/Jerusalem')::date + $4::time) AT TIME ZONE 'Asia/Jerusalem') <= $3::timestamptz THEN 1 ELSE 0 END,
            COALESCE(last_scheduled_sync_date + 1, ($3::timestamptz AT TIME ZONE 'Asia/Jerusalem')::date)
        ) + $4::time) AT TIME ZONE 'Asia/Jerusalem' ELSE NULL END WHERE id=$1`,
    [connectionId, enabled && settings.dailySyncEnabled, now, settings.syncTime]);
}
module.exports = { courtSchedule, scheduleNext, TIME_ZONE };
