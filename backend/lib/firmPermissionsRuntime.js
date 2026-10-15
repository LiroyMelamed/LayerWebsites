/** @deprecated Import from lib/firmPermissions/* directly. Re-export for compatibility. */
const accessPure = require('./firmPermissions/accessPure');
const caseAccess = require('./firmPermissions/caseAccess');

module.exports = {
    ...accessPure,
    ...caseAccess,
    attachFirmPermissions: require('../middlewares/attachFirmPermissions'),
};
