import ApiUtils from "./apiUtils";
import { isDemoModeEnabled } from "../utils/demoMode";

const base = "billing";

const PLAN_TTL_MS = 30_000;
const USAGE_TTL_MS = 15_000;
const PLANS_TTL_MS = 60_000;

let planCache = null;
let planCacheAt = 0;
let planInFlight = null;

let usageCache = null;
let usageCacheAt = 0;
let usageInFlight = null;

let plansCache = null;
let plansCacheAt = 0;
let plansInFlight = null;

function demoResponse(data, requestLink) {
    return Promise.resolve({
        status: 200,
        data,
        requestLink: requestLink || "demo://billing",
        success: true,
    });
}

function firstOfCurrentMonthUtcIso() {
    const d = new Date();
    const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
    return utc.toISOString();
}

function getDemoPlan() {
    return {
        scope: "firm",
        firmId: 42,
        enforcementMode: "warn",
        planKey: "demo_basic",
        name: "Demo Basic",
        pricing: {
            currency: "ILS",
            priceMonthlyCents: 0,
        },
        retention: {
            documentsCoreDays: 365,
            documentsPiiDays: 90,
        },
        quotas: {
            documentsMonthlyQuota: 100,
            storageGbQuota: 10,
            usersQuota: 5,
            otpSmsMonthlyQuota: 200,
            evidenceGenerationsMonthlyQuota: 50,
            evidenceCpuSecondsMonthlyQuota: 600,
        },
    };
}

function getDemoUsage() {
    return {
        monthStartUtc: firstOfCurrentMonthUtcIso(),
        documents: {
            createdThisMonth: 12,
        },
        storage: {
            // ~1.35GB
            bytesTotal: Math.floor(1.35 * 1024 * 1024 * 1024),
        },
        seats: {
            used: 2,
        },
        otp: {
            smsThisMonth: 7,
        },
        evidence: {
            generationsThisMonth: 3,
            cpuSecondsThisMonth: 18,
        },
    };
}

const billingApi = {
    getPlan: async () => {
        if (isDemoModeEnabled()) {
            const now = Date.now();
            if (planCache && now - planCacheAt < PLAN_TTL_MS) return planCache;
            planCache = await demoResponse(getDemoPlan(), `${base}/plan`);
            planCacheAt = Date.now();
            return planCache;
        }

        const now = Date.now();
        if (planCache && now - planCacheAt < PLAN_TTL_MS) return planCache;
        if (planInFlight) return planInFlight;

        planInFlight = ApiUtils.get(`${base}/plan`).then((res) => {
            if (res?.success) {
                planCache = res;
                planCacheAt = Date.now();
            }
            return res;
        }).finally(() => {
            planInFlight = null;
        });

        return planInFlight;
    },

    getUsage: async () => {
        if (isDemoModeEnabled()) {
            const now = Date.now();
            if (usageCache && now - usageCacheAt < USAGE_TTL_MS) return usageCache;
            usageCache = await demoResponse(getDemoUsage(), `${base}/usage`);
            usageCacheAt = Date.now();
            return usageCache;
        }

        const now = Date.now();
        if (usageCache && now - usageCacheAt < USAGE_TTL_MS) return usageCache;
        if (usageInFlight) return usageInFlight;

        usageInFlight = ApiUtils.get(`${base}/usage`).then((res) => {
            if (res?.success) {
                usageCache = res;
                usageCacheAt = Date.now();
            }
            return res;
        }).finally(() => {
            usageInFlight = null;
        });

        return usageInFlight;
    },

    getPlans: async () => {
        if (isDemoModeEnabled()) {
            const now = Date.now();
            if (plansCache && now - plansCacheAt < PLANS_TTL_MS) return plansCache;

            // Keep the shape consistent with backend responses (list of plans).
            // This is currently not used by PlanUsageScreen but is safe for future UI.
            plansCache = await demoResponse([getDemoPlan()], `${base}/plans`);
            plansCacheAt = Date.now();
            return plansCache;
        }

        const now = Date.now();
        if (plansCache && now - plansCacheAt < PLANS_TTL_MS) return plansCache;
        if (plansInFlight) return plansInFlight;

        plansInFlight = ApiUtils.get(`${base}/plans`).then((res) => {
            if (res?.success) {
                plansCache = res;
                plansCacheAt = Date.now();
            }
            return res;
        }).finally(() => {
            plansInFlight = null;
        });

        return plansInFlight;
    },
};

export default billingApi;
