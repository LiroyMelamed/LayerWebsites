'use strict';
const router = require('express').Router();
const auth = require('../middlewares/authMiddleware');
const requireOfficeOwner = require('../middlewares/requireOfficeOwner');
const controller = require('../controllers/systemMessageConsentController').createSystemMessageConsentController();
router.get('/', auth, requireOfficeOwner, controller.get);
router.post('/', auth, requireOfficeOwner, controller.save);
module.exports = router;
