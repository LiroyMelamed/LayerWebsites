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
const requireLawyerOrAdmin = require('../middlewares/requireLawyerOrAdmin');
const cal = require('../controllers/calendarController');

// Convenience shorthand — all protected calendar routes require JWT + Lawyer/Admin role
const protect = [authMiddleware, requireLawyerOrAdmin];

// ─── CRUD ─────────────────────────────────────────────────────────────────────
// Canonical events list (Step 2 dynamic filters)
router.get('/events', ...protect, cal.listEvents);
// Legacy alias — keep until frontend (Step 4) migrates to /events
router.get('/', ...protect, cal.listEvents);

router.post('/', ...protect, cal.createEvent);

// Named routes BEFORE /:id so Express doesn't swallow them as id params
router.get('/today', ...protect, cal.getTodayAndTomorrow);

// ─── CRM (Step 2) ─────────────────────────────────────────────────────────────
// All named routes go BEFORE the generic /:id handlers below.
router.post('/check-conflict', ...protect, cal.checkConflict);
router.post('/convert-lead', ...protect, cal.convertLead);
router.get('/clients/:clientUserId/cases', ...protect, cal.getClientCases);
router.patch('/:id/link-case', ...protect, cal.linkCase);

router.get('/:id', ...protect, cal.getEvent);
router.put('/:id', ...protect, cal.updateEvent);
router.delete('/:id', ...protect, cal.deleteEvent);

// ─── iCal / WebCal feed ───────────────────────────────────────────────────────
// Auth-protected management routes come BEFORE the public :token route
router.get('/feed/token', ...protect, cal.getIcalToken);
router.post('/feed/rotate-token', ...protect, cal.rotateIcalToken);

// Public feed — no JWT; the opaque token IS the auth secret
// Accepts both /feed/<token> and /feed/<token>.ics (the controller strips the suffix)
router.get('/feed/:token', cal.serveIcalFeed);

// ─── Google Calendar ──────────────────────────────────────────────────────────
router.get('/google/auth-url', ...protect, cal.getGoogleAuthUrl);
// OAuth2 callback is PUBLIC — Google redirects the browser here after consent
router.get('/google/callback', cal.handleGoogleCallback);
router.get('/google/status', ...protect, cal.getGoogleStatus);
router.delete('/google/disconnect', ...protect, cal.disconnectGoogle);
router.post('/google/sync', ...protect, cal.syncGoogleEvents);

// ─── Outlook Calendar ───────────────────────────────────────────────────────
router.get('/outlook/auth-url', ...protect, cal.getOutlookAuthUrl);
router.get('/outlook/callback', cal.handleOutlookCallback);
router.get('/outlook/status', ...protect, cal.getOutlookStatus);
router.delete('/outlook/disconnect', ...protect, cal.disconnectOutlook);
router.post('/outlook/sync', ...protect, cal.syncOutlookEvents);

module.exports = router;
