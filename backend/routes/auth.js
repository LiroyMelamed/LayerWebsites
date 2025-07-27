const express = require("express");
const router = express.Router();
const { requestOtp, verifyOtp } = require("../controllers/authController");

router.post("/RequestOtp", requestOtp);
router.post("/VerifyOtp", verifyOtp);

module.exports = router;
