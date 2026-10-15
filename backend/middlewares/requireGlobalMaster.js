const pool = require('../config/db');
const { withSystem } = require('../lib/tenant/databaseScope');

async function requireGlobalMaster(req, res, next) {
    const userId = req.user?.UserId || req.user?.userid || req.user?.userId;
    if (!userId) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    try {
        const resMaster = await withSystem(() => pool.query(
            `SELECT 1 FROM global_platform_masters g JOIN users u ON u.userid=g.userid
             WHERE g.userid = $1 AND g.is_active = true AND u.law_firm_tenant_id IS NULL LIMIT 1`,
            [userId]
        ));
        if ((resMaster.rows || []).length > 0) {
            return withSystem(next);
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
