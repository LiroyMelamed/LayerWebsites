import ApiUtils from "./apiUtils";

const base = "calendar";

const calendarApi = {
    /** List events for the authenticated user.
     * @param {object} params - {
     *   from, to, limit, offset,
     *   scope ('mine' | 'firm'),
     *   lawyer_id, client_id, case_id,
     *   event_type ('appointment' | 'leave'),
     * }
     */
    listEvents: async (params = {}) => {
        const query = new URLSearchParams();
        if (params.from) query.append("from", params.from);
        if (params.to) query.append("to", params.to);
        if (params.scope) query.append("scope", params.scope);
        if (params.lawyer_id) query.append("lawyer_id", String(params.lawyer_id));
        if (params.client_id) query.append("client_id", String(params.client_id));
        if (params.case_id) query.append("case_id", String(params.case_id));
        if (params.event_type) query.append("event_type", params.event_type);
        if (params.limit) query.append("limit", String(params.limit));
        if (params.offset) query.append("offset", String(params.offset));
        const qs = query.toString();
        // Canonical path: /events. Backend keeps `/` as an alias for back-compat.
        return await ApiUtils.get(`${base}/events${qs ? `?${qs}` : ""}`);
    },

    /** Soft overlap detector (Step 5 conflict banner). */
    checkConflict: async ({ start_time, end_time, lawyer_id, exclude_event_id } = {}) => {
        return await ApiUtils.post(`${base}/check-conflict`, {
            start_time, end_time, lawyer_id, exclude_event_id,
        });
    },

    /** Active (non-closed) cases for a client — powers the dynamic case-link dropdown. */
    getClientCases: async (clientUserId) => {
        return await ApiUtils.get(`${base}/clients/${clientUserId}/cases`);
    },

    /** Attach (or clear) a case on an existing event. */
    linkCase: async (eventId, caseId) => {
        return await ApiUtils.patch(`${base}/${eventId}/link-case`, { case_id: caseId });
    },

    /** Atomic lead → client + case promotion. */
    convertLead: async ({ eventId, case_name } = {}) => {
        return await ApiUtils.post(`${base}/convert-lead`, { eventId, case_name });
    },

    /** Dashboard widget — today + tomorrow events */
    getTodayAndTomorrow: async () => {
        return await ApiUtils.get(`${base}/today`);
    },

    /** Create a new event */
    createEvent: async (data) => {
        return await ApiUtils.post(`${base}`, data);
    },

    /** Get a single event by ID */
    getEvent: async (id) => {
        return await ApiUtils.get(`${base}/${id}`);
    },

    /** Update an existing event */
    updateEvent: async (id, data) => {
        return await ApiUtils.put(`${base}/${id}`, data);
    },

    /** Delete an event */
    deleteEvent: async (id) => {
        return await ApiUtils.delete(`${base}/${id}`);
    },

    // ── iCal / WebCal ──────────────────────────────────────────────────────────

    /** Get (or auto-create) the user's iCal subscription token + URL */
    getIcalToken: async () => {
        return await ApiUtils.get(`${base}/feed/token`);
    },

    /** Rotate the subscription token — invalidates the old subscription URL */
    rotateIcalToken: async () => {
        return await ApiUtils.post(`${base}/feed/rotate-token`);
    },

    // ── Google Calendar ────────────────────────────────────────────────────────

    /** Returns the Google OAuth2 consent URL to redirect the user to */
    getGoogleAuthUrl: async () => {
        return await ApiUtils.get(`${base}/google/auth-url`);
    },

    /** Check whether Google Calendar is currently connected */
    getGoogleStatus: async () => {
        return await ApiUtils.get(`${base}/google/status`);
    },

    /** Disconnect Google Calendar (revoke + clear tokens) */
    disconnectGoogle: async () => {
        return await ApiUtils.delete(`${base}/google/disconnect`);
    },

    /** Pull the latest events from Google Calendar into the platform */
    syncGoogleEvents: async () => {
        return await ApiUtils.post(`${base}/google/sync`);
    },
};

export default calendarApi;
