const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const requireGlobalMaster = require('../middlewares/requireGlobalMaster');
const controller = require('../controllers/masterAdminController');

const router = express.Router();

router.use(authMiddleware, requireGlobalMaster);

router.get('/stats', controller.getStats);
router.get('/tenants', controller.listTenants);
router.post('/tenants', controller.createTenantManual);
router.patch('/tenants/:tenantId', controller.patchTenant);
router.get('/slug-available', controller.checkSlug);

module.exports = router;
