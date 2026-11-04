'use strict';

const pool = require('../config/db');

function isOlder(incoming, stored) {
    if (incoming.sequence !== stored.sequence) return incoming.sequence < stored.sequence;
    return !!(stored.source_stamp && incoming.stamp && Date.parse(incoming.stamp) < new Date(stored.source_stamp).getTime());
}

/** A caller-owned transaction and owner lock cover both ICS and Google imports. */
async function upsertInvitation(db, ownerId, item, source) {
    const identity = [ownerId, item.uid, item.recurrenceKey || '', item.organizer];
    if (item.cancelled && !item.recurrenceKey) {
        // A series CANCEL commonly contains only UID, organizer and revision, with no dates.
        const { rows } = await db.query(`SELECT * FROM calendar_external_invitations
            WHERE owner_id=$1 AND external_uid=$2 FOR UPDATE`, [ownerId, item.uid]);
        let changed = false;
        for (const link of rows) {
            if (link.organizer !== item.organizer) { const error = new Error('מארגן הזימון שונה מהאירוע הקיים'); error.status = 400; throw error; }
            if (isOlder(item, link)) continue;
            await db.query("UPDATE calendar_events SET event_status='cancelled',invite_deferred_until=NULL WHERE id=$1 AND owner_id=$2", [link.event_id, ownerId]);
            await db.query('UPDATE calendar_external_invitations SET sequence=$3,source_stamp=$4 WHERE owner_id=$1 AND event_id=$2', [ownerId, link.event_id, item.sequence, item.stamp]);
            changed = true;
        }
        return { action: changed ? 'cancelled' : 'unchanged', id: rows[0]?.event_id || null };
    }
    const { rows: links } = await db.query(`SELECT i.*, ce.event_status FROM calendar_external_invitations i
        JOIN calendar_events ce ON ce.id=i.event_id AND ce.owner_id=i.owner_id
        WHERE i.owner_id=$1 AND i.external_uid=$2 AND i.recurrence_key=$3 FOR UPDATE OF i,ce`, identity.slice(0, 3));
    let stored = links[0];
    if (stored && stored.organizer !== item.organizer) {
        const error = new Error('מארגן הזימון שונה מהמארגן של האירוע הקיים. לא בוצע שינוי.');
        error.status = 400; throw error;
    }
    if (stored && isOlder(item, stored)) return { action: 'unchanged', id: stored.event_id };
    // Existing Google imports predate the invitation identity table. Bind by the already-scoped provider ID.
    if (!stored && item.googleEventId) {
        const { rows } = await db.query('SELECT id AS event_id, event_status FROM calendar_events WHERE owner_id=$1 AND google_event_id=$2 FOR UPDATE', [ownerId, item.googleEventId]);
        stored = rows[0];
    }
    if (!stored && item.cancelled) return { action: 'unchanged', id: null };
    let id = stored?.event_id;
    if (id) {
        if (item.cancelled) {
            await db.query("UPDATE calendar_events SET event_status='cancelled',invite_deferred_until=NULL WHERE id=$1 AND owner_id=$2", [id, ownerId]);
        } else {
            await db.query(`UPDATE calendar_events SET title=$3,description=$4,location=$5,start_time=$6,end_time=$7,all_day=$8,
                google_event_id=COALESCE(google_event_id,$9)
                WHERE id=$1 AND owner_id=$2`, [id, ownerId, item.title, item.description, item.location, item.startTime, item.endTime, item.allDay, item.googleEventId || null]);
            // Keep office-managed type, participants, reminders and manual cancellations intact.
        }
    } else {
        const { rows } = await db.query(`INSERT INTO calendar_events(owner_id,title,description,location,start_time,end_time,all_day,google_event_id,
            reminder_offsets,lawyer_reminder_offsets,client_reminder_offsets,reminder_channels,reminder_targets)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,'[]','[]','[]','{"push":false,"email":false,"sms":false}','{"client":false,"managers":false}') RETURNING id`,
        [ownerId, item.title, item.description, item.location, item.startTime, item.endTime, item.allDay, item.googleEventId || null]);
        id = rows[0].id;
    }
    await db.query(`INSERT INTO calendar_external_invitations(owner_id,external_uid,recurrence_key,organizer,event_id,sequence,source_stamp,source,response_status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(owner_id,external_uid,recurrence_key) DO UPDATE SET
        sequence=EXCLUDED.sequence,source_stamp=EXCLUDED.source_stamp,source=EXCLUDED.source,response_status=EXCLUDED.response_status`,
    [...identity, id, item.sequence || 0, item.stamp || null, source, item.responseStatus || null]);
    return { action: item.cancelled ? 'cancelled' : stored ? 'updated' : 'created', id };
}

async function importInvitations(ownerId, events, source = 'ics') {
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        await db.query("SELECT pg_advisory_xact_lock(hashtext('calendar-invitations'),$1::int)", [ownerId]);
        const results = [];
        for (const item of events) results.push(await upsertInvitation(db, ownerId, item, source));
        await db.query('COMMIT');
        return results.reduce((acc, item) => { acc[item.action]++; return acc; }, { created: 0, updated: 0, cancelled: 0, unchanged: 0 });
    } catch (err) { await db.query('ROLLBACK'); throw err; }
    finally { db.release(); }
}

module.exports = { importInvitations, upsertInvitation, isOlder };
