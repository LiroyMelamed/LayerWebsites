const router = require('express').Router();
const auth = require('../middlewares/authMiddleware');
const pool = require('../config/db');
const { createClientPortalService } = require('../services/signingV2/clientPortal');

const service = createClientPortalService({ pool });
const run = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
    next();
});
router.use(auth);
router.get('/documents', run(async (req, res) => res.json(await service.list(req))));
router.post('/documents/:id/open', run(async (req, res) => res.json(await service.open(req, req.params.id, req.body?.grantId))));

module.exports = router;
