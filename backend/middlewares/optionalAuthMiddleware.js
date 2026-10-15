const jwt = require('jsonwebtoken');

// Optional auth: if a Bearer token exists and is valid, populate req.user.
// If no token (or invalid token), continue without failing.
const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
}

module.exports = async function optionalAuthMiddleware(req, _res, next) {
    try {
        const raw = req.headers.authorization;
        if (!raw) return next();

        const token = raw.split(' ')[1];
        if (!token) return next();

        const decoded = jwt.verify(token, SECRET_KEY, { algorithms: ['HS256'] });
        if (decoded && require('../lib/tenant/databaseScope').enabled()) {
            const scope=require('../lib/tenant/databaseScope'), pool=require('../config/db');
            const row=(await scope.withSystem(()=>pool.query('SELECT userid,role,phonenumber,law_firm_tenant_id FROM users WHERE userid=$1',[decoded.userid]))).rows[0];
            if (!row || !['Admin','Lawyer','Staff','User','Client','ExternalSigner'].includes(row.role) || String(row.law_firm_tenant_id||'')!==String(req.tenant?.id||'')) return next();
            req.user={UserId:row.userid,Role:row.role,PhoneNumber:row.phonenumber};
            return next();
        }
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
