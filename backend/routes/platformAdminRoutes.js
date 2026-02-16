const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const requirePlatformAdmin = require('../middlewares/requirePlatformAdmin');

const platformAdminController = require('../controllers/platformAdminController');

// Platform admin: manage plans + tenant subscriptions + usage.
router.get('/plans', authMiddleware, requirePlatformAdmin, platformAdminController.listPlans);
router.post('/plans', authMiddleware, requirePlatformAdmin, platformAdminController.upsertPlan);

router.post('/tenants/:id/plan', authMiddleware, requirePlatformAdmin, platformAdminController.assignTenantPlan);
router.get('/tenants/:id/usage', authMiddleware, requirePlatformAdmin, platformAdminController.getTenantUsage);

// Firm-scoped routes removed – architecture is one DB per firm.

// Placeholder hook for future messaging (T-7 days warnings).
router.post('/retention/warnings/schedule', authMiddleware, requirePlatformAdmin, platformAdminController.scheduleDeletionWarnings);

module.exports = router;
