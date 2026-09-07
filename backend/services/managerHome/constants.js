/**
 * Operational signal thresholds for Manager Home.
 * Adjust here — not scattered across queries/components.
 */
module.exports = {
    NO_ACTIVITY_DAYS: 7,
    LONG_STAGE_DAYS: 30,
    LICENSE_CRITICAL_DAYS: 7,
    LICENSE_WARNING_DAYS: 30,
    LICENSE_INFO_DAYS: 90,
    SIGNING_PENDING_WARNING_DAYS: 3,
    SIGNING_EXPIRING_DAYS: 3,
    COMPLETION_WARNING_DAYS: 7,
    RSVP_LOOKAHEAD_DAYS: 14,
    RSVP_URGENT_HOURS: 48,
    RECENT_ACTIVITY_LIMIT: 15,
    /** Max rows in dashboard drill-down popups */
    DRILL_DOWN_LIST_LIMIT: 100,
    /** Max items shown in Needs Attention after grouping */
    ATTENTION_DISPLAY_LIMIT: 12,
    /** Raw signals collected before grouping (safety cap) */
    ATTENTION_RAW_LIMIT: 80,
    MANAGER_HOME_CACHE_TTL_MS: 30 * 1000,
    AI_BRIEF_CACHE_TTL_MS: 30 * 60 * 1000,
};

/**
 * Meaningful operational activity (used for inactivity signal):
 * - casedescriptions.timestamp (stage notes / updates)
 * - stage_files.created_at (document upload to case stage)
 * - uploadedfiles.uploaddate (legacy case file uploads)
 * - signingfiles.createdat / signedat (signing workflow events)
 *
 * Explicitly EXCLUDED:
 * - cases.updatedat (may change from technical/metadata ops unrelated to case work)
 * - audit_events (internal signing audit — not surfaced as case activity)
 */

/** @typedef {'hard'|'soft'} SignalTier */

/**
 * Priority model — hard signals outrank soft signals in sorting.
 * Documented tiers; do not reorder without updating tests.
 */
const SIGNAL_DEFINITIONS = {
    license_expired: { tier: 'hard', priority: 'critical' },
    license_expiring_critical: { tier: 'hard', priority: 'critical' },
    license_expiring_warning: { tier: 'hard', priority: 'high' },
    signing_expired: { tier: 'hard', priority: 'critical' },
    signing_expiring: { tier: 'hard', priority: 'high' },
    signing_rejected: { tier: 'hard', priority: 'high' },
    unassigned_case: { tier: 'hard', priority: 'high' },
    reminder_failed: { tier: 'hard', priority: 'high' },
    signing_pending: { tier: 'soft', priority: 'medium', groupable: true },
    no_activity: { tier: 'soft', priority: 'low', groupable: true },
    long_in_stage: { tier: 'soft', priority: 'low', groupable: true },
    completion_passed: { tier: 'soft', priority: 'medium', groupable: true },
    completion_approaching: { tier: 'soft', priority: 'low', groupable: true },
    rsvp_pending: { tier: 'soft', priority: 'medium', groupable: true },
};

/** Signals that collapse into one grouped card when count > 1 */
const GROUPABLE_SIGNAL_TYPES = new Set(
    Object.entries(SIGNAL_DEFINITIONS)
        .filter(([, def]) => def.groupable)
        .map(([type]) => type)
);

module.exports.SIGNAL_DEFINITIONS = SIGNAL_DEFINITIONS;
module.exports.GROUPABLE_SIGNAL_TYPES = GROUPABLE_SIGNAL_TYPES;
