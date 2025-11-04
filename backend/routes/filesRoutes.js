const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const filesController = require("../controllers/filesController");

// Presigned URL endpoints
router.get("/presign-upload", authMiddleware, filesController.presignUpload);
router.get("/presign-read", authMiddleware, filesController.presignRead);

module.exports = router;
