const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../middlewares/authMiddleware');
const requireFirmAction = require('../middlewares/requireFirmAction');
const reminderController = require('../controllers/reminderController');

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

const remView = [authMiddleware, requireFirmAction('reminders', 'view', { legacy: 'lawyerOrAdmin' })];
const remManage = [authMiddleware, requireFirmAction('reminders', 'manage', { legacy: 'lawyerOrAdmin' })];

router.get('/templates', ...remView, reminderController.getTemplates);
router.get('/templates/:key/example-excel', ...remView, reminderController.downloadTemplateExcel);

router.get('/custom-templates', ...remView, reminderController.listCustomTemplates);
router.post('/custom-templates', ...remManage, reminderController.createCustomTemplate);
router.put('/custom-templates/:id', ...remManage, reminderController.updateCustomTemplate);
router.delete('/custom-templates/:id', ...remManage, reminderController.deleteCustomTemplate);

router.post('/import', ...remManage, upload.single('file'), reminderController.importReminders);
router.post('/', ...remManage, reminderController.createSingleReminder);
router.get('/', ...remView, reminderController.listReminders);
router.get('/:id', ...remView, reminderController.getReminderById);
router.put('/:id/cancel', ...remManage, reminderController.cancelReminder);
router.put('/:id', ...remManage, reminderController.updateReminder);
router.delete('/:id', ...remManage, reminderController.deleteReminder);

module.exports = router;
