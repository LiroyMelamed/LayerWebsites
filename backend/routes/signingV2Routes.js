const router = require('express').Router();
const auth = require('../middlewares/authMiddleware');
const requireFirmAction = require('../middlewares/requireFirmAction');
const { requireSigningEnabledForUser } = require('../middlewares/requireSigningEnabled');
const pool = require('../config/db');
const { actorScope } = require('../services/signingV2/access');
const management = require('../services/signingV2/management');
const actions = require('../services/signingV2/actions');
const { createAppError } = require('../utils/appError');

const run = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const view = requireFirmAction('signing', 'view', { legacy: 'lawyerOrAdmin' });
// Reminders and resends use the existing publish capability; view access alone never sends.
const send = requireFirmAction('signing', 'upload', { legacy: 'lawyerOrAdmin' });

// Offices that have not been enabled keep the current signing flows untouched.
router.use((req, res, next) => (process.env.SIGNING_V2_ENABLED === 'true' ? next() : next(createAppError('NOT_FOUND', 404))));
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use(auth, requireSigningEnabledForUser);

const target = req => ({ packageId: req.params.id, personId: req.params.personId, purpose: req.body?.purpose, channel: req.body?.channel });

router.get('/submissions', view, run(async (req, res) => res.json(await management.listSubmissions(pool, await actorScope(pool, req, 'view'), req.query))));
router.get('/submissions/:id/packages', view, run(async (req, res) =>
    res.json(await management.listPackages(pool, await actorScope(pool, req, 'view'), req.params.id, req.query))));
router.get('/packages/:id', view, run(async (req, res) => res.json(await management.packageDetails(pool, await actorScope(pool, req, 'view'), req.params.id))));
router.post('/packages/:id/participants/:personId/action-preview', send, run(async (req, res) =>
    res.json(await actions.previewParticipantAction(pool, await actorScope(pool, req, 'upload'), target(req)))));
router.post('/packages/:id/participants/:personId/actions', send, run(async (req, res) => {
    const result = await actions.executeParticipantAction(pool, await actorScope(pool, req, 'upload'),
        { ...target(req), previewHash: req.body?.previewHash, idempotencyKey: req.get('Idempotency-Key') });
    // 202 only means the request is durably queued; the operation reports delivery facts.
    res.status(result.reused ? 200 : 202).json(result);
}));
router.get('/operations/:id', view, run(async (req, res) => res.json(await actions.operationStatus(pool, await actorScope(pool, req, 'view'), req.params.id))));

module.exports = router;
