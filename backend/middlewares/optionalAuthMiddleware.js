const jwt = require('jsonwebtoken');

// Optional auth: if a Bearer token exists and is valid, populate req.user.
// If no token (or invalid token), continue without failing.
const SECRET_KEY = process.env.JWT_SECRET || 'supersecretkey';

module.exports = function optionalAuthMiddleware(req, _res, next) {
    try {
        const raw = req.headers.authorization;
        if (!raw) return next();

        const token = raw.split(' ')[1];
        if (!token) return next();

        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded) {
            req.user = {
                UserId: decoded.userid,
                Role: decoded.role,
                PhoneNumber: decoded.phoneNumber,
            };
        }

        return next();
    } catch {
        return next();
    }
};
