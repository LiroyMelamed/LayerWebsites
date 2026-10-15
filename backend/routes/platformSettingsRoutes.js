const express = require('express');
const router = express.Router();
const multer = require('multer');

const authMiddleware = require('../middlewares/authMiddleware');
const requirePlatformAdmin = require('../middlewares/requirePlatformAdmin');
const ctrl = require('../controllers/platformSettingsController');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Public route — no admin required (only CORS + rate-limit apply)
router.get('/public', ctrl.getPublicSettings);

// Lawyer-readable allowlist of enabled channels per notification type.
// Used by the per-action pickers (signing, calendar) to only show
// channels the platform admin enabled. Auth required, but no platform
// admin requirement.
router.get('/channels-lite', authMiddleware, ctrl.getNotificationChannelsLite);

// All remaining routes require platform admin
router.use(authMiddleware, requirePlatformAdmin);

// Settings
router.get('/', ctrl.getAllSettings);
router.put('/', ctrl.updateSettings);
router.put('/single', ctrl.updateSingleSetting);

// SMS sender change (InforU verification flow)
router.post('/sms-sender-request', ctrl.requestSmsSenderChange);
router.post('/sms-sender-activate', ctrl.activateSmsSenderChange);

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

// Knowledge documents (chatbot RAG)
router.get('/knowledge-docs', ctrl.listKnowledgeDocs);
router.post('/knowledge-docs', upload.single('file'), ctrl.uploadKnowledgeDoc);
router.delete('/knowledge-docs/:id', ctrl.deleteKnowledgeDoc);

module.exports = router;
