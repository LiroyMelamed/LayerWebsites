const { getLimitsForTenant } = require('../lib/limits/getLimitsForTenant');
const { getUsageForTenant } = require('../lib/limits/getUsageForTenant');
const { getLimitsForFirm } = require('../lib/limits/getLimitsForFirm');
const { getUsageForFirm } = require('../lib/limits/getUsageForFirm');
const { isFirmScopeEnabled } = require('../lib/firm/firmScope');
const { resolveFirmIdForUserEnsureMembership } = require('../lib/firm/resolveFirmContext');
const { enforcementMode } = require('../lib/limits/enforceFirmLimits');

exports.getCurrentPlan = async (req, res) => {
    try {
        const tenantId = Number(req.user?.UserId);
        if (!Number.isFinite(tenantId) || tenantId <= 0) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (isFirmScopeEnabled()) {
            const firmId = await resolveFirmIdForUserEnsureMembership({ userId: tenantId, userRole: req.user?.Role });
            if (firmId) {
                const limits = await getLimitsForFirm(firmId);
                if (limits) {
                    return res.status(200).json({ ...limits, enforcementMode: enforcementMode() });
                }
            }
        }

        const limits = await getLimitsForTenant(tenantId);
        return res.status(200).json({ ...limits, enforcementMode: enforcementMode() });
    } catch (e) {
        console.error('getCurrentPlan error:', e);
        return res.status(500).json({ message: 'Error getting plan' });
    }
};

exports.getCurrentUsage = async (req, res) => {
    try {
        const tenantId = Number(req.user?.UserId);
        if (!Number.isFinite(tenantId) || tenantId <= 0) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (isFirmScopeEnabled()) {
            const firmId = await resolveFirmIdForUserEnsureMembership({ userId: tenantId, userRole: req.user?.Role });
            if (firmId) {
                const usage = await getUsageForFirm(firmId);
                if (usage) {
                    return res.status(200).json(usage);
                }
            }
        }

        const usage = await getUsageForTenant(tenantId);
        return res.status(200).json(usage);
    } catch (e) {
        console.error('getCurrentUsage error:', e);
        return res.status(500).json({ message: 'Error getting usage' });
    }
};
