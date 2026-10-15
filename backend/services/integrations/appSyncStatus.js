'use strict';
// Connection-only receipt: never retain contact names, numbers, message bodies,
// attachments, or raw webhook payloads in the legal-practice database or logs.
function appSyncStatus(field, value) {
    if (field !== 'history' || !Array.isArray(value?.history)) return null;
    if (value.history.some(h => h.errors?.some(e => Number(e.code) === 2593109))) return 'history_declined';
    if (value.history.some(h => h.errors?.length)) return 'needs_attention';
    if (value.history.some(h => Number(h.metadata?.progress) === 100)) return 'complete';
    return null;
}
module.exports = { appSyncStatus };
