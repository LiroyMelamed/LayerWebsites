const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../middlewares/authMiddleware');
const requireLawyerOrAdmin = require('../middlewares/requireLawyerOrAdmin');
const reminderController = require('../controllers/reminderController');

// Multer config for Excel/CSV upload (in memory, 5 MB limit)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = (file.originalname || '').toLowerCase();
        if (ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only .xlsx, .xls, and .csv files are allowed.'));
        }
    },
});

// GET  /api/reminders/templates  – list available email templates (built-in + custom)
router.get('/templates', authMiddleware, requireLawyerOrAdmin, reminderController.getTemplates);

// GET  /api/reminders/templates/:key/example-excel – download example Excel for a template
router.get('/templates/:key/example-excel', authMiddleware, requireLawyerOrAdmin, reminderController.downloadTemplateExcel);

// CRUD for custom reminder templates (lawyer/admin only)
router.get('/custom-templates', authMiddleware, requireLawyerOrAdmin, reminderController.listCustomTemplates);
router.post('/custom-templates', authMiddleware, requireLawyerOrAdmin, reminderController.createCustomTemplate);
router.put('/custom-templates/:id', authMiddleware, requireLawyerOrAdmin, reminderController.updateCustomTemplate);
router.delete('/custom-templates/:id', authMiddleware, requireLawyerOrAdmin, reminderController.deleteCustomTemplate);

// POST /api/reminders/import     – import reminders from Excel/CSV (lawyer/admin only)
router.post('/import', authMiddleware, requireLawyerOrAdmin, upload.single('file'), reminderController.importReminders);

// POST /api/reminders            – create a single reminder (lawyer/admin only)
router.post('/', authMiddleware, requireLawyerOrAdmin, reminderController.createSingleReminder);

// GET  /api/reminders            – list reminders (lawyer/admin only)
router.get('/', authMiddleware, requireLawyerOrAdmin, reminderController.listReminders);

// PUT  /api/reminders/:id/cancel – cancel a PENDING reminder (lawyer/admin only)
router.put('/:id/cancel', authMiddleware, requireLawyerOrAdmin, reminderController.cancelReminder);

// PUT  /api/reminders/:id – update a PENDING reminder (lawyer/admin only)
router.put('/:id', authMiddleware, requireLawyerOrAdmin, reminderController.updateReminder);

// DELETE /api/reminders/:id – permanently delete a reminder (lawyer/admin only)
router.delete('/:id', authMiddleware, requireLawyerOrAdmin, reminderController.deleteReminder);

module.exports = router;
