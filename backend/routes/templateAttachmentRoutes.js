const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/templateAttachmentController');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

router.use(authMiddleware);

router.get('/', ctrl.listAttachments);
router.post('/upload', upload.single('file'), ctrl.uploadAttachment);
router.delete('/:id', ctrl.deleteAttachment);

module.exports = router;
