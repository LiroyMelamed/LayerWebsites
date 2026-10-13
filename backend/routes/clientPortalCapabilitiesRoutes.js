const express = require('express');
const auth = require('../middlewares/authMiddleware');
const { clientTenantId } = require('../lib/clientSigningReadiness');
const { createAppError } = require('../utils/appError');
const router = express.Router();
router.get('/documents', auth, (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    try {
        if (!['User', 'Client'].includes(req.user?.Role) || req.firmPermissionContextValidated !== true) {
            return next(createAppError('FORBIDDEN', 403));
        }
        clientTenantId(req);
        // This installed product has legacy signing only. Do not import V2 tables,
        // fabricate documents or advertise a package signing/open capability.
        return res.json({ supported: false, documents: [] });
    } catch (error) { return next(error); }
});
module.exports = router;
