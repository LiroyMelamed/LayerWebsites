// src/api/auditEventsApi.js
import ApiUtils from "./apiUtils";

const base = "audit-events";

function toQuery(params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v == null || v === "") continue;
        sp.set(k, String(v));
    }
    const qs = sp.toString();
    return qs ? `?${qs}` : "";
}

const auditEventsApi = {
    list: async ({
        caseId,
        signingFileId,
        actorType,
        eventType,
        from,
        to,
        success,
        limit,
        cursor,
        search,
        q,
    } = {}) => {
        return await ApiUtils.get(
            `${base}${toQuery({ caseId, signingFileId, actorType, eventType, from, to, success, limit, cursor, search, q })}`
        );
    },
};

export default auditEventsApi;
