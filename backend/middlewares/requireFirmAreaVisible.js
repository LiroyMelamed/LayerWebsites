const { requireAreaVisible } = require('../lib/firmPermissions/accessPure');

/** Block role-mode users who cannot see an area (GET/navigation parity). */
module.exports = function requireFirmAreaVisible(areaId) {
    return function requireFirmAreaVisibleMiddleware(req, res, next) {
        const err = requireAreaVisible(req, areaId);
        if (err) return next(err);
        return next();
    };
};
