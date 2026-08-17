const { getLimitsForFirm } = require('../lib/limits/getLimitsForFirm');
const { getUsageForFirm } = require('../lib/limits/getUsageForFirm');
const { enforcementMode } = require('../lib/limits/enforceFirmLimits');
const { PRICING } = require('../lib/billing/pricingPackage');
const billing = require('../lib/billing/firmBillingService');
const { getHebrewMessage } = require('../utils/errors.he');

function billingPayload(snap, extra = {}) {
    if (!snap) return extra;
    return {
        billing: {
            status: snap.status,
            billingEnabled: snap.billingEnabled,
            stillComplimentary: snap.stillComplimentary,
            isUnlimited: snap.isUnlimited,
            complimentaryUntil: snap.complimentaryUntil,
            renewsAt: snap.renewsAt,
            graceUntil: snap.graceUntil,
            locked: snap.locked,
            lastPaymentError: snap.lastPaymentError,
            lastPaidAt: snap.lastPaidAt,
            priceMonthlyIls: snap.priceMonthlyIls,
            nextChargeIls: snap.nextChargeIls,
            card: snap.card,
            payUrl: snap.payUrl,
        },
        package: snap.package,
        ...extra,
    };
}

exports.getLockStatus = async (req, res) => {
    try {
        const snap = await billing.getBillingSnapshot();
        return res.status(200).json({
            locked: Boolean(snap.locked),
            status: snap.status || 'complimentary',
            stillComplimentary: Boolean(snap.stillComplimentary),
            complimentaryUntil: snap.complimentaryUntil || null,
            graceUntil: snap.graceUntil || null,
            payUrl: snap.payUrl,
        });
    } catch (e) {
        console.error('getLockStatus error:', e);
        return res.status(200).json({ locked: false, status: 'unknown' });
    }
};

exports.getCurrentPlan = async (req, res) => {
    try {
        const tenantId = Number(req.user?.UserId);
        if (!Number.isFinite(tenantId) || tenantId <= 0) {
            return res.status(401).json({ message: 'נדרש להתחבר' });
        }

        const [limits, snap, usage] = await Promise.all([
            getLimitsForFirm(null),
            billing.getBillingSnapshot(),
            getUsageForFirm(null),
        ]);
        if (!limits && !snap?.available) {
            return res.status(404).json({ message: 'לא נמצאה תוכנית' });
        }

        const disabledOptions = await billing.getDisabledOptions(usage);
        return res.status(200).json({
            ...(limits || {}),
            enforcementMode: (snap?.stillComplimentary || snap?.billingEnabled === false)
                ? 'warn'
                : (snap?.billingEnabled ? 'block' : enforcementMode()),
            disabledOptions,
            ...billingPayload(snap),
        });
    } catch (e) {
        console.error('getCurrentPlan error:', e);
        return res.status(500).json({ message: 'שגיאה בשליפת תוכנית' });
    }
};

exports.getCurrentUsage = async (req, res) => {
    try {
        const tenantId = Number(req.user?.UserId);
        if (!Number.isFinite(tenantId) || tenantId <= 0) {
            return res.status(401).json({ message: 'נדרש להתחבר' });
        }

        const usage = await getUsageForFirm(null);
        if (!usage) {
            return res.status(404).json({ message: 'אין נתוני שימוש' });
        }
        return res.status(200).json(usage);
    } catch (e) {
        console.error('getCurrentUsage error:', e);
        return res.status(500).json({ message: 'שגיאה בשליפת נתוני שימוש' });
    }
};

exports.listPlans = async (req, res) => {
    try {
        const tenantId = Number(req.user?.UserId);
        if (!Number.isFinite(tenantId) || tenantId <= 0) {
            return res.status(401).json({ message: 'נדרש להתחבר' });
        }

        const [snap, usage] = await Promise.all([
            billing.getBillingSnapshot(),
            getUsageForFirm(null),
        ]);
        const disabledOptions = await billing.getDisabledOptions(usage);
        return res.status(200).json({
            catalog: PRICING,
            disabledOptions,
            ...billingPayload(snap),
        });
    } catch (e) {
        console.error('listPlans error:', e);
        return res.status(500).json({ message: 'שגיאה בשליפת רשימת תוכניות' });
    }
};

exports.savePackage = async (req, res) => {
    try {
        const usage = await getUsageForFirm(null);
        const result = await billing.savePackage({
            platformId: req.body?.platformId,
            resourceId: req.body?.resourceId,
            signingId: req.body?.signingId,
            usage,
            customer: {
                name: req.user?.Name || null,
                phone: req.user?.PhoneNumber || null,
            },
        });
        return res.status(200).json(result);
    } catch (e) {
        if (e?.code === 'PACKAGE_DOWNGRADE_BLOCKED') {
            return res.status(409).json({
                message: e.message,
                errorCode: e.code,
                blocks: e.blocks || [],
            });
        }
        console.error('savePackage error:', e);
        return res.status(500).json({ message: e.message || 'שגיאה בשמירת חבילה' });
    }
};

exports.createCheckout = async (req, res) => {
    try {
        const checkout = await billing.createCheckout({
            kind: req.body?.kind || 'retry',
            customer: {
                name: req.user?.Name || null,
                phone: req.user?.PhoneNumber || null,
            },
        });
        return res.status(200).json(checkout);
    } catch (e) {
        if (e?.code === 'TAKBULL_NOT_CONFIGURED') {
            return res.status(503).json({ message: e.message, errorCode: e.code });
        }
        console.error('createCheckout error:', e);
        return res.status(500).json({ message: e.message || 'שגיאה בפתיחת סליקה' });
    }
};

exports.chargeNow = async (req, res) => {
    try {
        const result = await billing.chargeSavedCard({ kind: req.body?.kind || 'retry' });
        return res.status(200).json(result);
    } catch (e) {
        console.error('chargeNow error:', e);
        return res.status(500).json({ message: e.message || 'שגיאה בחיוב' });
    }
};

exports.takbullReturn = async (req, res) => {
    try {
        const uniqId = String(req.query?.uniqId || req.query?.orderUniqId || '').trim();
        const intentId = String(req.query?.intentId || '').trim();
        const result = await billing.handleTakbullReturn({ uniqId, intentId });
        return res.redirect(302, result.redirectUrl);
    } catch (e) {
        console.error('takbullReturn error:', e);
        return res.status(500).send(getHebrewMessage('INTERNAL_ERROR'));
    }
};

exports.takbullCancel = async (req, res) => {
    try {
        const intentId = String(req.query?.intentId || '').trim();
        const result = await billing.handleTakbullCancel({ intentId });
        return res.redirect(302, result.redirectUrl);
    } catch (e) {
        console.error('takbullCancel error:', e);
        return res.status(500).send(getHebrewMessage('INTERNAL_ERROR'));
    }
};
