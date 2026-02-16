import ApiUtils from "./apiUtils";

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

const billingApi = {
    getPlan: async () => {
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
