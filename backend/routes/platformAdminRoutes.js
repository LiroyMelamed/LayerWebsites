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

// Firm-scoped management (used when FIRM_SCOPE_ENABLED=true)
router.get('/firms', authMiddleware, requirePlatformAdmin, platformAdminController.listFirms);
router.post('/firms', authMiddleware, requirePlatformAdmin, platformAdminController.upsertFirm);
router.post('/firms/:id/plan', authMiddleware, requirePlatformAdmin, platformAdminController.assignFirmPlan);
router.get('/firms/:id/usage', authMiddleware, requirePlatformAdmin, platformAdminController.getFirmUsage);
router.post('/firms/:id/override', authMiddleware, requirePlatformAdmin, platformAdminController.upsertFirmOverride);

// Placeholder hook for future messaging (T-7 days warnings).
router.post('/retention/warnings/schedule', authMiddleware, requirePlatformAdmin, platformAdminController.scheduleDeletionWarnings);

module.exports = router;
