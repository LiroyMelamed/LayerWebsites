/**
 * Commercial package catalog — keep in sync with
 * frontend/src/components/pricing/pricingConfig.js
 */

const PRICING = {
    currency: 'ILS',
    system: { id: 'system', label: 'מערכת', amount: 249 },
    platforms: [
        { id: 'none', label: 'ללא', amount: 0 },
        { id: 'site', label: 'אתר', amount: 149 },
        { id: 'app', label: 'אפליקציה', amount: 199 },
        { id: 'site_app', label: 'אתר + אפליקציה', amount: 299 },
    ],
    resources: [
        { id: 'basic', label: 'בסיסי', amount: 0, storageMb: 250, usersQuota: 2, planKey: 'BASIC' },
        { id: 'pro', label: 'פרו', amount: 149, storageMb: 1024, usersQuota: 5, planKey: 'PRO' },
        { id: 'enterprise', label: 'ארגוני', amount: 399, storageMb: null, usersQuota: null, planKey: 'ENTERPRISE' },
    ],
    signing: [
        { id: 'none', label: 'ללא חתימות', amount: 0, includedSignatures: 0 },
        { id: '500', label: '500 חתימות', amount: 129, includedSignatures: 500 },
        { id: '1500', label: '1500 חתימות', amount: 299, includedSignatures: 1500 },
        { id: '5000', label: '5000 חתימות', amount: 599, includedSignatures: 5000 },
        { id: 'unlimited', label: 'חתימות ללא הגבלה', amount: 999, includedSignatures: null },
    ],
};

const DEFAULT_SELECTION = {
    platformId: 'site_app',
    resourceId: 'pro',
    signingId: '500',
};

function findById(list, id, fallbackId) {
    return list.find((x) => x.id === id) || list.find((x) => x.id === fallbackId) || list[0];
}

function resolvePricingLineItems({ platformId, resourceId, signingId } = {}) {
    const platform = findById(PRICING.platforms, platformId, DEFAULT_SELECTION.platformId);
    const resource = findById(PRICING.resources, resourceId, DEFAULT_SELECTION.resourceId);
    const signing = findById(PRICING.signing, signingId, DEFAULT_SELECTION.signingId);
    const system = PRICING.system;

    const breakdown = [
        { id: 'system', label: system.label, amount: Number(system.amount || 0) },
        { id: 'platform', label: `פלטפורמה: ${platform.label}`, amount: Number(platform.amount || 0) },
        { id: 'resources', label: `חבילת משאבים: ${resource.label}`, amount: Number(resource.amount || 0) },
        { id: 'signing', label: `חבילת חתימות: ${signing.label}`, amount: Number(signing.amount || 0) },
    ];
    const total = breakdown.reduce((sum, it) => sum + Number(it.amount || 0), 0);

    return {
        platformId: platform.id,
        resourceId: resource.id,
        signingId: signing.id,
        system,
        platform,
        resource,
        signing,
        breakdown,
        total,
        currency: PRICING.currency,
        displayName: `${resource.label} · ${platform.label} · ${signing.label}`,
    };
}

function quotasForPackage({ resourceId, signingId } = {}) {
    const resource = findById(PRICING.resources, resourceId, DEFAULT_SELECTION.resourceId);
    const signing = findById(PRICING.signing, signingId, DEFAULT_SELECTION.signingId);
    const storageMb = resource.storageMb;
    return {
        planKey: resource.planKey,
        planName: resource.label,
        documentsMonthlyQuota: signing.includedSignatures,
        storageMbQuota: storageMb,
        usersQuota: resource.usersQuota,
        storageBytesQuota:
            storageMb == null ? null : Number(storageMb) * 1024 * 1024,
    };
}

function platformRank(platformId) {
    const id = String(platformId || '');
    if (id === 'site_app') return 2;
    if (id === 'site' || id === 'app') return 1;
    return 0;
}

function quotaExceeded(used, quota) {
    if (quota === null || quota === undefined) return false;
    const q = Number(quota);
    if (!Number.isFinite(q) || q < 0) return false;
    const u = Number(used || 0);
    return u > q;
}

/**
 * Cheaper resource/signing packs are blocked when current usage would not fit.
 * Platform add-on cannot be decreased (already deployed).
 */
function evaluatePackageChange({ current, next, usage } = {}) {
    const cur = resolvePricingLineItems(current || {});
    const nxt = resolvePricingLineItems(next || {});
    const nextQuotas = quotasForPackage(nxt);
    const blocks = [];

    if (platformRank(nxt.platformId) < platformRank(cur.platformId)) {
        blocks.push({
            field: 'platformId',
            message: 'לא ניתן להוריד את חבילת האתר/האפליקציה — היא כבר פרוסה אצלכם.',
        });
    }

    const docsUsed = Number(usage?.documents?.createdThisMonth || 0);
    const seatsUsed = Number(usage?.seats?.used || 0);
    const storageBytes = Number(usage?.storage?.bytesTotal || 0);

    if (quotaExceeded(docsUsed, nextQuotas.documentsMonthlyQuota)) {
        blocks.push({
            field: 'signingId',
            message: `לא ניתן לרדת בחבילת החתימות: השתמשתם ב-${docsUsed} מסמכים החודש, והחבילה כוללת ${nextQuotas.documentsMonthlyQuota}.`,
        });
    }
    if (quotaExceeded(seatsUsed, nextQuotas.usersQuota)) {
        blocks.push({
            field: 'resourceId',
            message: `לא ניתן לרדת בחבילת המשאבים: יש ${seatsUsed} מנהלי מערכת, והחבילה מאפשרת ${nextQuotas.usersQuota}.`,
        });
    }
    if (quotaExceeded(storageBytes, nextQuotas.storageBytesQuota)) {
        const usedMb = (storageBytes / (1024 * 1024)).toFixed(1);
        blocks.push({
            field: 'resourceId',
            message: `לא ניתן לרדת בחבילת המשאבים: בשימוש ${usedMb} MB, והחבילה כוללת ${nextQuotas.storageMbQuota} MB.`,
        });
    }

    return {
        allowed: blocks.length === 0,
        blocks,
        current: cur,
        next: nxt,
        nextQuotas,
        priceIncreased: nxt.total > cur.total,
        priceDecreased: nxt.total < cur.total,
    };
}

function disabledOptionsForUsage({ current, usage } = {}) {
    const cur = resolvePricingLineItems(current || {});
    const resourceIds = [];
    const signingIds = [];
    const platformIds = [];

    for (const p of PRICING.platforms) {
        const ev = evaluatePackageChange({
            current: cur,
            next: { ...cur, platformId: p.id },
            usage,
        });
        if (!ev.allowed) platformIds.push(p.id);
    }
    for (const r of PRICING.resources) {
        const ev = evaluatePackageChange({
            current: cur,
            next: { ...cur, resourceId: r.id },
            usage,
        });
        if (!ev.allowed) resourceIds.push(r.id);
    }
    for (const s of PRICING.signing) {
        const ev = evaluatePackageChange({
            current: cur,
            next: { ...cur, signingId: s.id },
            usage,
        });
        if (!ev.allowed) signingIds.push(s.id);
    }

    return { platformIds, resourceIds, signingIds };
}

module.exports = {
    PRICING,
    DEFAULT_SELECTION,
    resolvePricingLineItems,
    quotasForPackage,
    platformRank,
    evaluatePackageChange,
    disabledOptionsForUsage,
};
