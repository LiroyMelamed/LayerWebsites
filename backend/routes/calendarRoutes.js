/**
 * calendarRoutes.js
 *
 * Mount with: app.use('/api/calendar', calendarRoutes);
 *
 * Route summary:
 *
 *   CRUD (auth required — Lawyer or Admin)
 *     GET    /api/calendar                 – list events (legacy alias of /events)
 *     GET    /api/calendar/events          – list events (canonical, supports scope/lawyer_id/client_id/case_id/event_type/from/to)
 *     GET    /api/calendar/today           – dashboard widget: today + tomorrow events
 *     POST   /api/calendar                 – create event (accepts event_type + lead_*)
 *     GET    /api/calendar/:id             – get single event
 *     PUT    /api/calendar/:id             – update event
 *     DELETE /api/calendar/:id             – delete event
 *
 *   CRM (Step 2 — auth required — Lawyer or Admin)
 *     POST   /api/calendar/check-conflict                – soft overlap detector for the conflict banner
 *     GET    /api/calendar/clients/:clientUserId/cases   – active cases for a client (case-link dropdown)
 *     PATCH  /api/calendar/:id/link-case                 – attach/clear a case on an event (owner|admin)
 *     POST   /api/calendar/:id/resend-invite             – resend client invite SMS/email
 *     POST   /api/calendar/:id/duplicate                 – clone event (new invite tokens)
 *     POST   /api/calendar/convert-lead                  – atomic lead→client+case promotion
 *
 *   iCal / WebCal feed
 *     GET    /api/calendar/feed/token          – get/generate subscription token (auth required)
 *     POST   /api/calendar/feed/rotate-token   – rotate subscription token (auth required)
 *     GET    /api/calendar/feed/:token         – serve .ics feed (PUBLIC — token is the auth)
 *
 *   Google Calendar OAuth2 (auth required except /google/callback)
 *     GET    /api/calendar/google/auth-url     – get OAuth2 consent URL
 *     GET    /api/calendar/google/callback     – OAuth2 callback (Google redirects here — PUBLIC)
 *     GET    /api/calendar/google/status       – check if connected
 *     DELETE /api/calendar/google/disconnect   – revoke & clear tokens
 *     POST   /api/calendar/google/sync         – pull events from Google Calendar
 *
 *   Outlook Calendar OAuth2 (auth required except /outlook/callback)
 *     GET    /api/calendar/outlook/auth-url     – get OAuth2 consent URL
 *     GET    /api/calendar/outlook/callback     – OAuth2 callback (Microsoft redirects here — PUBLIC)
 *     GET    /api/calendar/outlook/status       – check if connected
 *     DELETE /api/calendar/outlook/disconnect    – clear tokens
 *     POST   /api/calendar/outlook/sync         – pull events from Outlook Calendar
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const requireFirmAction = require('../middlewares/requireFirmAction');
const cal = require('../controllers/calendarController');

const calView = [authMiddleware, requireFirmAction('calendar', 'view', { legacy: 'lawyerOrAdmin' })];
const calManage = [authMiddleware, requireFirmAction('calendar', 'manage', { legacy: 'lawyerOrAdmin' })];

// ─── CRUD ─────────────────────────────────────────────────────────────────────
// Canonical events list (Step 2 dynamic filters)
router.get('/events', ...calView, cal.listEvents);
// Legacy alias — keep until frontend (Step 4) migrates to /events
router.get('/', ...calView, cal.listEvents);

router.post('/', ...calManage, cal.createEvent);

// Named routes BEFORE /:id so Express doesn't swallow them as id params
router.get('/today', ...calView, cal.getTodayAndTomorrow);
router.get('/holidays', ...calView, cal.listHolidays);
router.get('/daily-agenda-settings', ...calView, cal.getDailyAgendaSettings);
router.put('/daily-agenda-settings', ...calManage, cal.updateDailyAgendaSettings);
router.get('/agenda/:date', ...calView, cal.getDayAgenda);

// Public invite RSVP (no auth)
router.get('/invite/:token', cal.getInviteByToken);
router.post('/invite/:token', cal.respondToInvite);
router.get('/short-links/:slug', cal.resolvePublicShortLink);

// ─── CRM (Step 2) ─────────────────────────────────────────────────────────────
// All named routes go BEFORE the generic /:id handlers below.
router.post('/check-conflict', ...calView, cal.checkConflict);
router.post('/convert-lead', ...calManage, cal.convertLead);
router.get('/clients/:clientUserId/cases', ...calView, cal.getClientCases);
router.patch('/:id/link-case', ...calManage, cal.linkCase);
router.post('/:id/resend-invite', ...calManage, cal.resendInvite);
router.post('/:id/rsvp', ...calManage, cal.staffSetClientRsvp);
router.post('/:id/duplicate', ...calManage, cal.duplicateEvent);
router.post('/:id/cancel', ...calManage, cal.cancelEvent);

router.get('/:id', ...calView, cal.getEvent);
router.put('/:id', ...calManage, cal.updateEvent);
router.delete('/:id', ...calManage, cal.deleteEvent);

// ─── iCal / WebCal feed ───────────────────────────────────────────────────────
// Auth-protected management routes come BEFORE the public :token route
router.get('/feed/token', ...calView, cal.getIcalToken);
router.post('/feed/rotate-token', ...calManage, cal.rotateIcalToken);

// Public feed — no JWT; the opaque token IS the auth secret
// Accepts both /feed/<token> and /feed/<token>.ics (the controller strips the suffix)
router.get('/feed/:token', cal.serveIcalFeed);

// ─── Google Calendar ──────────────────────────────────────────────────────────
router.get('/google/auth-url', ...calManage, cal.getGoogleAuthUrl);
// OAuth2 callback is PUBLIC — Google redirects the browser here after consent
router.get('/google/callback', cal.handleGoogleCallback);
router.get('/google/status', ...calView, cal.getGoogleStatus);
router.delete('/google/disconnect', ...calManage, cal.disconnectGoogle);
router.post('/google/sync', ...calManage, cal.syncGoogleEvents);

// ─── Outlook Calendar ───────────────────────────────────────────────────────
router.get('/outlook/auth-url', ...calManage, cal.getOutlookAuthUrl);
router.get('/outlook/callback', cal.handleOutlookCallback);
router.get('/outlook/status', ...calView, cal.getOutlookStatus);
router.delete('/outlook/disconnect', ...calManage, cal.disconnectOutlook);
router.post('/outlook/sync', ...calManage, cal.syncOutlookEvents);

module.exports = router;
