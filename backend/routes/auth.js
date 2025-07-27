const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController"); // Import the auth controller

router.post("/RequestOtp", authController.requestOtp);

router.post("/VerifyOtp", authController.verifyOtp);

module.exports = router;
