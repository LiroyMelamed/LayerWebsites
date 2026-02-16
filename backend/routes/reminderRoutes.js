const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../middlewares/authMiddleware');
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

// GET  /api/reminders/templates  – list available email templates
router.get('/templates', authMiddleware, reminderController.getTemplates);

// POST /api/reminders/import     – import reminders from Excel/CSV
router.post('/import', authMiddleware, upload.single('file'), reminderController.importReminders);

// GET  /api/reminders            – list reminders (with filters)
router.get('/', authMiddleware, reminderController.listReminders);

// PUT  /api/reminders/:id/cancel – cancel a PENDING reminder
router.put('/:id/cancel', authMiddleware, reminderController.cancelReminder);

// PUT  /api/reminders/:id – update a PENDING reminder
router.put('/:id', authMiddleware, reminderController.updateReminder);

// DELETE /api/reminders/:id – permanently delete a reminder
router.delete('/:id', authMiddleware, reminderController.deleteReminder);

module.exports = router;
