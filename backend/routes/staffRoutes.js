const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const requirePlatformAdmin = require('../middlewares/requirePlatformAdmin');
const staffRolesController = require('../controllers/staffRolesController');

router.get('/permission-catalog', authMiddleware, staffRolesController.getPermissionCatalog);
router.get('/session-scope', authMiddleware, staffRolesController.getSessionScope);

router.get('/roles', authMiddleware, requirePlatformAdmin, staffRolesController.listRoles);
router.post('/roles', authMiddleware, requirePlatformAdmin, staffRolesController.createRole);
router.patch('/roles/:roleId', authMiddleware, requirePlatformAdmin, staffRolesController.updateRole);
router.delete('/roles/:roleId', authMiddleware, requirePlatformAdmin, staffRolesController.deactivateRole);

router.get('/users', authMiddleware, requirePlatformAdmin, staffRolesController.listOfficeUsers);
router.patch(
    '/users/:userId/firm-staff-role',
    authMiddleware,
    requirePlatformAdmin,
    staffRolesController.assignUserFirmStaffRole,
);

module.exports = router;
