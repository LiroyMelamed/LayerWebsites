const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/requireAdmin");
const filesController = require("../controllers/filesController");
const stageFilesController = require("../controllers/stageFilesController");

// Presigned URL endpoints
router.get("/presign-upload", authMiddleware, filesController.presignUpload);
router.get("/presign-read", authMiddleware, filesController.presignRead);

// Stage files — any authenticated user can list/read (access checks inside controller)
router.get("/stage-files/:caseId", authMiddleware, stageFilesController.getStageFiles);
router.get("/stage-file-read/:fileId", authMiddleware, stageFilesController.readStageFile);

// Stage files — admin only for add/delete
router.post("/stage-files/:caseId/:stage", authMiddleware, requireAdmin, stageFilesController.addStageFile);
router.delete("/stage-files/:fileId", authMiddleware, requireAdmin, stageFilesController.deleteStageFile);

module.exports = router;
