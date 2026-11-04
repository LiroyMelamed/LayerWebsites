'use strict';
const { localState, remoteState, requestBody, eventId, reconcile, recurrenceKey, same } = require('../lib/googleCalendarReconcile');
const { upsertInvitation } = require('./calendarInvitationImport');
const { personalCalendarSql } = require('../lib/calendarVisibility');
const options = { timeout: 15000, retry: false };
const status = error => Number(error?.response?.status || error?.code);

async function authorizeAccount(db, owner) {
    const { rows } = await db.query(`SELECT u.role,u.firm_staff_role_id,r.is_active,r.permissions,
        u.law_firm_tenant_id IS NOT DISTINCT FROM r.law_firm_tenant_id AS same_office
        FROM users u LEFT JOIN firm_staff_roles r ON r.id=u.firm_staff_role_id WHERE u.userid=$1`, [owner]);
    const user = rows[0];
    if (!user || !['Admin','Lawyer','Staff'].includes(user.role)) throw new Error('GOOGLE_SYNC_ACCESS_REMOVED');
    if (user.firm_staff_role_id) {
        const { hasAreaAction, normalizeRolePermissions } = require('../lib/firmRolePermissions');
        if (!user.is_active || !user.same_office || !hasAreaAction(normalizeRolePermissions(user.permissions), 'calendar', 'manage')) throw new Error('GOOGLE_SYNC_ACCESS_REMOVED');
    } else if (user.role === 'Staff') throw new Error('GOOGLE_SYNC_ACCESS_REMOVED');
}

/** Dedicated tenant databases only. Shared-office rollout needs an RLS migration first. */
function assertBoundary(row, env = process.env) {
    if (String(env.MULTI_TENANT_MODE).toLowerCase() === 'true') throw new Error('GOOGLE_SYNC_OFFICE_ISOLATION_REQUIRED');
    if (env.QA_OUTBOUND_MODE && !String(env.GOOGLE_SYNC_QA_ACCOUNT || '').split(',').includes(row.google_email)) {
        throw new Error('GOOGLE_SYNC_QA_ACCOUNT_REQUIRED');
    }
    if (env.QA_OUTBOUND_MODE && !env.GOOGLE_SYNC_QA_PREFIX) throw new Error('GOOGLE_SYNC_QA_PREFIX_REQUIRED');
    if (!String(row.google_scope || '').split(' ').includes('https://www.googleapis.com/auth/calendar.events')) throw new Error('GOOGLE_SYNC_RECONNECT_REQUIRED');
}
async function transaction(db, fn) {
    await db.query('BEGIN');
    try { const result = await fn(); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; }
}
async function listWindow(api, now) {
    const result = new Map(); let pageToken;
    do {
        const { data } = await api.events.list({ calendarId: 'primary', singleEvents: true, showDeleted: true,
            timeMin: new Date(now - 30 * 86400000).toISOString(), timeMax: new Date(now + 365 * 86400000).toISOString(),
            maxResults: 250, pageToken }, options);
        for (const event of data.items || []) if (event.id) result.set(event.id, event);
        pageToken = data.nextPageToken;
    } while (pageToken);
    return result;
}
async function readRemote(api, id) {
    try { return (await api.events.get({ calendarId: 'primary', eventId: id }, options)).data; }
    catch (error) { if ([404, 410].includes(status(error))) return null; throw error; }
}

/** Link before publishing. Neither a timeout nor a rolled-back acknowledgement changes the remote ID. */
async function addLink(db, owner, account, row, remote, namespace) {
    const id = remote?.id || eventId(namespace, owner, row.id);
    const local = localState(row);
    await db.query(`INSERT INTO calendar_google_links(owner_id,account_email,remote_id,event_id,local_key,base_local,base_remote,remote_etag,suppressed)
        VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
    [owner, account, id, row.id, local, remote ? local : null, remote?.etag || null, !!remote && local.cancelled]);
}

async function attachIncoming(db, owner, account, remote, namespace) {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('calendar-invitations'),$1::int)", [owner]);
    const known = await db.query('SELECT 1 FROM calendar_google_links WHERE owner_id=$1 AND account_email=$2 AND remote_id=$3', [owner, account, remote.id]);
    if (known.rows.length) return;
    let row = (await db.query('SELECT * FROM calendar_events WHERE owner_id=$1 AND google_event_id=$2 FOR UPDATE', [owner, remote.id])).rows[0];
    const marker = remote.extendedProperties?.private;
    if (!row && marker?.melaOrigin === namespace && /^\d+$/.test(marker.melaEvent || '')) {
        row = (await db.query(`SELECT ce.* FROM calendar_events ce WHERE ce.id=$2 AND ${personalCalendarSql(1)} FOR UPDATE`, [owner, Number(marker.melaEvent)])).rows[0];
    }
    if (!row && remote.iCalUID) {
        row = (await db.query(`SELECT ce.* FROM calendar_external_invitations i JOIN calendar_events ce ON ce.id=i.event_id
            WHERE i.owner_id=$1 AND i.external_uid=$2 AND i.recurrence_key=$3 FOR UPDATE OF ce`, [owner, remote.iCalUID, recurrenceKey(remote)])).rows[0];
    }
    if (!row && remote.iCalUID && remote.organizer?.email) {
        // A shared event can already exist through another manager's calendar.
        // Reuse its stable invitation identity only when this manager is already
        // assigned to it; matching titles/times must never merge private events.
        row = (await db.query(`SELECT ce.* FROM calendar_external_invitations i
            JOIN calendar_events ce ON ce.id=i.event_id
            WHERE i.external_uid=$2 AND i.recurrence_key=$3 AND lower(i.organizer)=$4
            AND ${personalCalendarSql(1)} ORDER BY ce.id LIMIT 1 FOR UPDATE OF ce`,
        [owner, remote.iCalUID, recurrenceKey(remote), remote.organizer.email.toLowerCase()])).rows[0];
    }
    if (!row && remote.status === 'cancelled') return;
    if (!row) {
        const state = remoteState(remote);
        if (remote.iCalUID && remote.organizer?.email) {
            const imported = await upsertInvitation(db, owner, { uid: remote.iCalUID, organizer: remote.organizer.email.toLowerCase(),
                recurrenceKey: recurrenceKey(remote), sequence: Number(remote.sequence) || 0, stamp: remote.updated,
                title: state.title, description: state.description, location: state.location,
                startTime: state.time.start, endTime: state.time.end, allDay: state.time.allDay, googleEventId: remote.id,
                responseStatus: remote.attendees?.find(a => a.self)?.responseStatus || null }, 'google');
            row = (await db.query('SELECT * FROM calendar_events WHERE id=$1', [imported.id])).rows[0];
        } else {
            row = (await db.query(`INSERT INTO calendar_events(owner_id,title,description,location,start_time,end_time,all_day,google_event_id,
                reminder_offsets,lawyer_reminder_offsets,client_reminder_offsets,reminder_channels,reminder_targets)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,'[]','[]','[]','{"push":false,"email":false,"sms":false}','{"client":false,"managers":false}') RETURNING *`,
            [owner, state.title, state.description, state.location, state.time.start, state.time.end, state.time.allDay, remote.id])).rows[0];
        }
    }
    // Same imported ICS identity already linked: do not create another local event.
    await addLink(db, owner, account, row, remote, namespace);
}

async function applyLocal(db, row, state) {
    if (!row) return; // A local hard deletion is never resurrected by sync.
    if (state.cancelled) {
        await require('../lib/reminderCalendarSync').unlinkRemindersForCalendarEvent(row.id, { client: db });
        await db.query("UPDATE calendar_events SET event_status='cancelled',invite_deferred_until=NULL WHERE id=$1", [row.id]);
    } else {
        const timeChanged = !same(localState(row).time, state.time);
        const sent = timeChanged ? require('../lib/calendarEventReminders').computeRemindersSentOnUpdate(row.reminders_sent_offsets, { timeChanged: true }) : null;
        const updated = (await db.query(`UPDATE calendar_events SET title=$2,description=$3,location=$4,start_time=$5,end_time=$6,all_day=$7,
            reminders_sent_offsets=CASE WHEN $8 THEN $9::jsonb ELSE reminders_sent_offsets END,
            reminder_deferred_until=CASE WHEN $8 THEN '{}'::jsonb ELSE reminder_deferred_until END,
            last_reminder_sent_at=CASE WHEN $8 THEN NULL ELSE last_reminder_sent_at END
            WHERE id=$1 RETURNING *`, [row.id, state.title, state.description, state.location, state.time.start, state.time.end, state.time.allDay, timeChanged, sent])).rows[0];
        if (updated.event_type === 'reminder') await require('../lib/reminderCalendarSync').updateReminderForCalendarEvent(updated, {}, { client: db });
    }
}

async function syncLink(db, api, owner, account, link, listed, namespace) {
    // Retrieve missing linked events explicitly: absence from a bounded list is NOT deletion.
    let remote = listed.get(link.remote_id) || await readRemote(api, link.remote_id);
    return transaction(db, async () => {
        const currentAccount = (await db.query('SELECT google_email FROM user_calendar_tokens WHERE user_id=$1 AND google_connected=true FOR SHARE', [owner])).rows[0];
        if (currentAccount?.google_email !== account) throw new Error('GOOGLE_SYNC_ACCOUNT_CHANGED');
        const row = (await db.query(`SELECT ce.* FROM calendar_events ce WHERE ce.id=$2 AND ${personalCalendarSql(1)} FOR UPDATE`, [owner, link.event_id])).rows[0];
        const local = localState(row);
        if (link.suppressed) return 'suppressed'; // Preserve deliberately cancelled legacy duplicates in this platform only.
        if (!remote && !link.base_remote) {
            if (local.cancelled) return 'unchanged';
            try {
                remote = (await api.events.insert({ calendarId: 'primary', sendUpdates: 'none', requestBody: {
                    id: link.remote_id, ...requestBody(local), reminders: { useDefault: false },
                    extendedProperties: { private: { melaOrigin: namespace, melaEvent: String(link.local_key) } },
                } }, options)).data;
            } catch (error) {
                if (status(error) !== 409) throw error;
                remote = await readRemote(api, link.remote_id);
                if (!remote || remote.extendedProperties?.private?.melaOrigin !== namespace || remote.extendedProperties?.private?.melaEvent !== String(link.local_key)) throw new Error('GOOGLE_SYNC_ID_COLLISION');
            }
        }
        const remoteValue = remote ? remoteState(remote) : { cancelled: true };
        if (row && row.owner_id !== owner && remoteValue.cancelled && !local.cancelled) {
            // A participant removing their own Google copy does not cancel the office meeting.
            await db.query('UPDATE calendar_google_links SET suppressed=true,conflict=NULL,resolution=NULL WHERE owner_id=$1 AND account_email=$2 AND remote_id=$3', [owner, account, link.remote_id]);
            return 'suppressed';
        }
        const baseRemote = link.base_remote || link.base_local;
        const resolution = link.resolution && same(link.conflict?.local, local) && same(link.conflict?.google, remoteValue) ? link.resolution : null;
        const result = reconcile(link.base_local, baseRemote, local, remoteValue, resolution);
        const remoteWritable = !remote || remote.organizer?.self === true || remote.organizer?.email?.toLowerCase() === account.toLowerCase() || remote.guestsCanModify === true;
        const noResurrection = result.value && !result.value.cancelled && (local.cancelled || remoteValue.cancelled);
        const readonly = result.value && !same(result.value, remoteValue) && !remoteWritable;
        if (result.conflict || noResurrection || readonly) {
            await db.query(`UPDATE calendar_google_links SET conflict=$4,resolution=NULL,updated_at=now()
                WHERE owner_id=$1 AND account_email=$2 AND remote_id=$3`,
            [owner, account, link.remote_id, { local, google: remoteValue, reason: readonly ? 'readOnly' : noResurrection ? 'cancelled' : 'concurrent' }]);
            return 'conflict';
        }
        let value = result.value;
        if (!same(value, remoteValue)) {
            if (!remote?.etag) throw new Error('GOOGLE_SYNC_ETAG_REQUIRED');
            if (value.cancelled) {
                await api.events.delete({ calendarId: 'primary', eventId: link.remote_id, sendUpdates: 'none' }, { ...options, headers: { 'If-Match': remote.etag } });
                remote = { status: 'cancelled' };
            } else {
                remote = (await api.events.patch({ calendarId: 'primary', eventId: link.remote_id, sendUpdates: 'none', requestBody: requestBody(value) },
                    { ...options, headers: { 'If-Match': remote.etag } })).data;
                value = remoteState(remote);
            }
        }
        if (!same(value, local)) await applyLocal(db, row, value);
        if (row?.owner_id === owner && remote?.iCalUID && remote?.organizer?.email) {
            // Importing the invitation file later must bind to this same event, not create another one.
            await db.query(`INSERT INTO calendar_external_invitations(owner_id,external_uid,recurrence_key,organizer,event_id,sequence,source_stamp,source)
                VALUES($1,$2,$3,$4,$5,$6,$7,'google') ON CONFLICT(owner_id,external_uid,recurrence_key) DO NOTHING`,
            [owner, remote.iCalUID, recurrenceKey(remote), remote.organizer.email.toLowerCase(), row.id, remote.sequence || 0, remote.updated || null]);
            await db.query('UPDATE calendar_events SET google_event_id=$2 WHERE id=$1 AND google_event_id IS NULL', [row.id, link.remote_id]);
        }
        await db.query(`UPDATE calendar_google_links SET base_local=$4,base_remote=$4,remote_etag=$5,conflict=NULL,resolution=NULL,updated_at=now()
            WHERE owner_id=$1 AND account_email=$2 AND remote_id=$3`, [owner, account, link.remote_id, value, remote?.etag || null]);
        return same(local, value) && same(remoteValue, value) ? 'unchanged' : 'updated';
    });
}

async function syncAccount(owner, { pool = require('../config/db'), now = Date.now(), clientFactory = require('./googleCalendarClient').createClient,
    env = process.env, settings = require('./settingsService'), authorize = authorizeAccount } = {}) {
    if (String(await settings.getSetting('calendar', 'GOOGLE_SYNC_ENABLED', 'true')).toLowerCase() === 'false') return { skipped: 'disabled' };
    const db = await pool.connect(); let api, locked = false;
    try {
        locked = (await db.query("SELECT pg_try_advisory_lock(hashtext('google-calendar-sync'),$1::int) AS locked", [owner])).rows[0].locked;
        if (!locked) return { ok: true, busy: true };
        const row = (await db.query('SELECT * FROM user_calendar_tokens WHERE user_id=$1 AND google_connected=true', [owner])).rows[0];
        if (!row) throw new Error('GOOGLE_SYNC_NOT_CONNECTED');
        assertBoundary(row, env);
        await authorize(db, owner);
        const account = row.google_email;
        const otherAccount = await db.query('SELECT 1 FROM calendar_google_links WHERE owner_id=$1 AND account_email<>$2 LIMIT 1', [owner, account]);
        if (otherAccount.rows.length) throw new Error('GOOGLE_SYNC_ORIGINAL_ACCOUNT_REQUIRED');
        const duplicateAccount = await db.query('SELECT 1 FROM user_calendar_tokens WHERE user_id<>$1 AND google_connected=true AND lower(google_email)=lower($2) LIMIT 1', [owner, account]);
        if (duplicateAccount.rows.length) throw new Error('GOOGLE_SYNC_ACCOUNT_USED_TWICE');
        const namespace = String(env.PUBLIC_API_BASE_URL || env.WEBSITE_DOMAIN || '').replace(/\/$/, '');
        if (!namespace) throw new Error('GOOGLE_SYNC_NAMESPACE_REQUIRED');
        api = clientFactory(row, db);
        const listed = await listWindow(api, now);
        if (env.QA_OUTBOUND_MODE) {
            const known = (await db.query('SELECT remote_id FROM calendar_google_links WHERE owner_id=$1 AND account_email=$2', [owner, account])).rows;
            const allowed = new Set(known.map(x => x.remote_id));
            for (const [id, event] of listed) if (!allowed.has(id) && !String(event.summary || '').startsWith(env.GOOGLE_SYNC_QA_PREFIX)) listed.delete(id);
        }
        for (const remote of listed.values()) await transaction(db, () => attachIncoming(db, owner, account, remote, namespace));
        const locals = await db.query(`SELECT ce.* FROM calendar_events ce WHERE ${personalCalendarSql(1)} AND ce.start_time<$3 AND ce.end_time>$2
            AND ce.event_type<>'holiday' AND COALESCE(ce.event_status,'scheduled')<>'cancelled'
            AND ($5::text IS NULL OR starts_with(ce.title,$5))
            AND NOT EXISTS (SELECT 1 FROM calendar_google_links l WHERE l.owner_id=$1 AND l.account_email=$4 AND l.local_key=ce.id)
            ORDER BY ce.id`, [owner, new Date(now - 30 * 86400000), new Date(now + 365 * 86400000), account, env.QA_OUTBOUND_MODE ? env.GOOGLE_SYNC_QA_PREFIX : null]);
        for (const local of locals.rows) await addLink(db, owner, account, local, null, namespace);
        const links = await db.query('SELECT * FROM calendar_google_links WHERE owner_id=$1 AND account_email=$2 ORDER BY local_key', [owner, account]);
        const counts = { ok: true, synced: 0, total: links.rows.length, failed: 0, conflicts: 0 };
        for (const link of links.rows) {
            try { const action = await syncLink(db, api, owner, account, link, listed, namespace); if (action === 'conflict') counts.conflicts++; else counts.synced++; }
            catch (error) { if ([401, 403, 429].includes(status(error))) throw error; counts.failed++; }
        }
        await api.flush?.();
        await db.query('UPDATE user_calendar_tokens SET google_last_sync_at=now(),google_sync_error=$2 WHERE user_id=$1', [owner, counts.failed ? 'GOOGLE_SYNC_RETRY_PENDING' : null]);
        return counts;
    } catch (error) {
        const code = String(error.message).includes('invalid_grant') || status(error) === 401 ? 'GOOGLE_SYNC_RECONNECT_REQUIRED' : /^GOOGLE_/.test(error.message) ? error.message : 'GOOGLE_SYNC_RETRY_PENDING';
        await db.query('UPDATE user_calendar_tokens SET google_sync_error=$2 WHERE user_id=$1', [owner, code]);
        const safe = new Error(code); safe.status = code === 'GOOGLE_SYNC_RECONNECT_REQUIRED' ? 401 : 503; throw safe;
    } finally {
        try { await api?.flush?.(); } finally {
            try { if (locked) await db.query("SELECT pg_advisory_unlock(hashtext('google-calendar-sync'),$1::int)", [owner]); }
            finally { db.release(); }
        }
    }
}
module.exports = { syncAccount, assertBoundary, listWindow, attachIncoming, syncLink };
