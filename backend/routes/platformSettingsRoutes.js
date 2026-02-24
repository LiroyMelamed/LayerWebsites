const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const requirePlatformAdmin = require('../middlewares/requirePlatformAdmin');
const ctrl = require('../controllers/platformSettingsController');

// Public route — no admin required (only CORS + rate-limit apply)
router.get('/public', ctrl.getPublicSettings);

// All remaining routes require platform admin
router.use(authMiddleware, requirePlatformAdmin);

// Settings
router.get('/', ctrl.getAllSettings);
router.put('/', ctrl.updateSettings);
router.put('/single', ctrl.updateSingleSetting);

// Notification channels
router.get('/channels', ctrl.getNotificationChannels);
router.put('/channels/:type', ctrl.updateNotificationChannel);

// Platform admins
router.get('/admins', ctrl.listPlatformAdmins);
router.post('/admins', ctrl.addPlatformAdmin);
router.delete('/admins/:userId', ctrl.removePlatformAdmin);

// Email templates (CRUD)
router.get('/email-templates', ctrl.getEmailTemplates);
router.put('/email-templates/:key', ctrl.updateEmailTemplate);

module.exports = router;
