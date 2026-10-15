const pool = require('../config/db');

async function requireGlobalMaster(req, res, next) {
    const userId = req.user?.UserId || req.user?.userid || req.user?.userId;
    if (!userId) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    try {
        const resMaster = await pool.query(
            `SELECT 1 FROM global_platform_masters WHERE userid = $1 AND is_active = true LIMIT 1`,
            [userId]
        );
        if ((resMaster.rows || []).length > 0) {
            return next();
        }
        return res.status(403).json({ error: 'FORBIDDEN', message: 'נדרשת הרשאת מאסטר' });
    } catch (e) {
        if (e?.code === '42P01') {
            return res.status(503).json({ error: 'MASTER_NOT_CONFIGURED' });
        }
        throw e;
    }
}

module.exports = requireGlobalMaster;
