'use strict';
const pool = require('../config/db');
const { parseInvitationFile } = require('../lib/calendarInvitationImport');
const { importInvitations } = require('../services/calendarInvitationImport');
const { invalidateOperationalDashboardCaches } = require('../utils/operationalDashboardCache');

async function importFile(req, res) {
    try {
        const parsed = parseInvitationFile(req.body?.content);
        const { rows } = await pool.query(`SELECT 1 FROM calendar_events ce WHERE ce.owner_id=$1 AND ce.google_event_id IS NOT NULL
            AND ce.end_time >= NOW()-INTERVAL '30 days' AND ce.start_time <= NOW()+INTERVAL '365 days'
            AND COALESCE(ce.event_status,'scheduled') <> 'cancelled'
            AND NOT EXISTS(SELECT 1 FROM calendar_external_invitations i WHERE i.event_id=ce.id AND i.owner_id=ce.owner_id) LIMIT 1`, [req.user.UserId]);
        if (rows.length) return res.status(409).json({ message: 'יש לבצע פעם אחת סנכרון Google לפני ייבוא קובץ זימון, כדי לזהות אירועים שכבר נמצאים ביומן ולמנוע כפילויות.' });
        if (req.body?.preview !== false) return res.json(parsed);
        const result = await importInvitations(req.user.UserId, parsed.events);
        invalidateOperationalDashboardCaches();
        return res.json({ ...result, outsideWindow: parsed.outsideWindow });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ message: err.message });
        console.error('[calendar-invitation] import failed:', err.code || err.name);
        return res.status(500).json({ message: 'לא ניתן לייבא את הזימון כעת. נסו שוב.' });
    }
}
module.exports = { importFile };
