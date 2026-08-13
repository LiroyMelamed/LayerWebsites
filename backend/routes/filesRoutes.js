const express = require("express");
const router = express.Router();
const multer = require("multer");
const authMiddleware = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/requireAdmin");
const filesController = require("../controllers/filesController");
const stageFilesController = require("../controllers/stageFilesController");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 40 * 1024 * 1024 }, // signing PDFs / stamps
});

// Presigned URL endpoints (browser→R2; requires bucket CORS)
router.get("/presign-upload", authMiddleware, filesController.presignUpload);
router.get("/presign-read", authMiddleware, filesController.presignRead);

// Server-side upload (avoids R2 CORS; preferred for new buckets)
router.post("/upload", authMiddleware, upload.single("file"), filesController.directUpload);

// Stage files — any authenticated user can list/read (access checks inside controller)
router.get("/stage-files/:caseId", authMiddleware, stageFilesController.getStageFiles);
router.get("/stage-file-read/:fileId", authMiddleware, stageFilesController.readStageFile);

// Stage files — admin only for add/delete
router.post("/stage-files/:caseId/:stage", authMiddleware, requireAdmin, stageFilesController.addStageFile);
router.delete("/stage-files/:fileId", authMiddleware, requireAdmin, stageFilesController.deleteStageFile);

module.exports = router;
