/**
 * Require an authenticated user with role "Admin".
 * Must be used after authMiddleware.
 */
module.exports = function requireAdmin(req, res, next) {
    if (req.user?.Role !== 'Admin') {
        return res.status(403).json({ message: "אין הרשאה" });
    }
    return next();
};
