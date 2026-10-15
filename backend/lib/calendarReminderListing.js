'use strict';
const { hasAreaAction } = require('./firmRolePermissions');
const { effectiveFireAt } = require('./shabbatDeferral');

function canViewCalendar(req) {
    const mode = req.firmPermissionMode || 'legacy';
    if (mode === 'platform_admin') return true;
    if (mode === 'role') return hasAreaAction(req.firmPermissions, 'calendar', 'view');
    return mode === 'legacy' && ['Admin', 'Lawyer'].includes(req.user?.Role);
}

// Project the scheduler's existing jobs. Never create a second queue or send a reminder.
// Split arrays deliberately fall back only on NULL: [] means the audience opted out.
const calendarReminderSql = `
 SELECT ('cal-' || ce.id || '-' || audience.role || '-' || offsets.minutes)::text AS id,
        CASE WHEN audience.role = 'client' THEN ce.client_user_id ELSE ce.owner_id END AS user_id,
        CASE WHEN audience.role = 'client'
             THEN COALESCE(clients.names, u_client.name, ce.client_name, ce.lead_name, 'לקוח')
             ELSE COALESCE(managers.names, u_manager.name, u_owner.name, 'צוות המשרד') END AS client_name,
        CASE WHEN audience.role = 'client'
             THEN COALESCE(clients.contacts, u_client.email, ce.lead_email, ce.lead_phone, '')
             ELSE COALESCE(managers.contacts, u_manager.email, u_owner.email, '') END AS to_email,
        ce.title AS subject,
        CASE ce.event_type WHEN 'hearing' THEN 'CALENDAR_HEARING' WHEN 'appointment' THEN 'CALENDAR_APPOINTMENT' ELSE 'CALENDAR_REMINDER' END::text AS template_key,
        CASE WHEN offsets.minutes = 0 THEN ce.created_at ELSE ce.start_time - offsets.minutes * INTERVAL '1 minute' END AS scheduled_for,
        CASE
          WHEN COALESCE(ce.reminders_sent_offsets, '[]'::jsonb) @> to_jsonb(audience.role || ':' || offsets.minutes)
            OR COALESCE(ce.reminders_sent_offsets, '[]'::jsonb) @> to_jsonb(offsets.minutes)
          THEN 'SENT'
          WHEN ce.event_status = 'cancelled' THEN 'CANCELLED'
          ELSE 'PENDING'
        END::text AS status,
        NULL::text AS error, ce.created_at, NULL::timestamptz AS sent_at,
        CASE WHEN ce.event_status = 'cancelled' THEN ce.updated_at ELSE NULL END AS cancelled_at,
        ce.id AS calendar_event_id, 'calendar'::text AS source,
        audience.role::text AS audience, ce.reminder_channels AS channels,
        ce.start_time AS event_start_time
 FROM calendar_events ce
 CROSS JOIN LATERAL (VALUES
   ('lawyer', COALESCE(ce.lawyer_reminder_offsets, ce.reminder_offsets, '[]'::jsonb), 'managers'),
   ('client', COALESCE(ce.client_reminder_offsets, ce.reminder_offsets, '[]'::jsonb), 'client')
 ) audience(role, offsets, target)
 CROSS JOIN LATERAL (
   SELECT DISTINCT raw::integer AS minutes FROM jsonb_array_elements_text(audience.offsets) raw
   WHERE raw ~ '^[0-9]{1,8}$'
 ) offsets
 LEFT JOIN users u_owner ON u_owner.userid = ce.owner_id
 LEFT JOIN users u_manager ON u_manager.userid = ce.manager_user_id
 LEFT JOIN users u_client ON u_client.userid = ce.client_user_id
 LEFT JOIN LATERAL (
   SELECT string_agg(u.name, ', ' ORDER BY c.sort_order, c.user_id) AS names,
          string_agg(COALESCE(u.email, u.phonenumber), ', ' ORDER BY c.sort_order, c.user_id) AS contacts
   FROM calendar_event_clients c JOIN users u ON u.userid = c.user_id WHERE c.event_id = ce.id
 ) clients ON TRUE
 LEFT JOIN LATERAL (
   SELECT string_agg(u.name, ', ' ORDER BY m.user_id) AS names,
          string_agg(COALESCE(u.email, u.phonenumber), ', ' ORDER BY m.user_id) AS contacts
   FROM calendar_event_managers m JOIN users u ON u.userid = m.user_id WHERE m.event_id = ce.id
 ) managers ON TRUE
 WHERE ce.event_type IN ('appointment', 'hearing', 'reminder')
   AND COALESCE(ce.reminder_targets->>audience.target, 'true') NOT IN ('false', '0')
   AND (COALESCE(ce.reminder_channels->>'sms', 'false') IN ('true','1')
     OR COALESCE(ce.reminder_channels->>'email', 'false') IN ('true','1')
     OR COALESCE(ce.reminder_channels->>'push', 'false') IN ('true','1'))
   AND (audience.role <> 'client' OR ce.client_user_id IS NOT NULL OR clients.names IS NOT NULL
        OR NULLIF(ce.lead_phone, '') IS NOT NULL OR NULLIF(ce.lead_email, '') IS NOT NULL
        OR jsonb_array_length(COALESCE(ce.lead_participants, '[]'::jsonb)) > 0)
`;

function decorateCalendarReminder(row) {
    if (row.source !== 'calendar') return row;
    // Keep the planned reminder time for ordering; expose quiet-hours deferral separately.
    const dispatchAt = effectiveFireAt(new Date(row.scheduled_for)).toISOString();
    return { ...row, managed_in_calendar: true, dispatch_not_before: dispatchAt };
}
module.exports = { canViewCalendar, calendarReminderSql, decorateCalendarReminder };
