const express = require("express");
const router = express.Router();
const dataController = require("../controllers/dataController");
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/GetMainScreenData", authMiddleware, dataController.getMainScreenData);

module.exports = router;
