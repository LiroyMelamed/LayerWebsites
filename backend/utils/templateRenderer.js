/**
 * Simple mustache-style template renderer.
 * Replaces {{variableName}} with corresponding values from the data object.
 *
 * @param {string} template - Template string with {{variable}} placeholders
 * @param {Object} data - Key-value pairs for replacement
 * @returns {string} Rendered string
 */
function renderTemplate(template, data) {
    if (!template || typeof template !== 'string') return '';
    if (!data || typeof data !== 'object') return template;

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const val = data[key];
        return val !== undefined && val !== null ? String(val) : '';
    });
}

/**
 * Extract all {{variableName}} placeholders from a template string.
 * @param {string} template
 * @returns {string[]} Array of variable names found in the template
 */
function extractTemplateVars(template) {
    if (!template || typeof template !== 'string') return [];
    const matches = [];
    const re = /\{\{(\w+)\}\}/g;
    let m;
    while ((m = re.exec(template)) !== null) {
        if (!matches.includes(m[1])) matches.push(m[1]);
    }
    return matches;
}

/**
 * Required variables per SMS template key.
 * When a user edits a template, we verify that the new value still contains
 * every required variable so the code doesn't produce broken messages.
 *
 * Available optional vars (always passed by renderTemplate callers):
 *   caseNumber  — case ID number
 *   managerName — name of assigned case manager
 *   stageName   — current stage name (required only for CASE_STAGE_CHANGED_SMS)
 */
const TEMPLATE_REQUIRED_VARS = {
    // ── Case lifecycle ──
    CASE_CREATED_SMS: ['recipientName', 'caseName', 'websiteUrl'],
    CASE_STAGE_CHANGED_SMS: ['recipientName', 'caseName', 'stageName', 'websiteUrl'],
    CASE_CLOSED_SMS: ['recipientName', 'caseName', 'websiteUrl'],
    CASE_REOPENED_SMS: ['recipientName', 'caseName', 'websiteUrl'],
    // ── Per-field case changes ──
    CASE_NAME_CHANGE_SMS: ['recipientName', 'caseName', 'websiteUrl'],
    CASE_TYPE_CHANGE_SMS: ['recipientName', 'caseName', 'websiteUrl'],
    CASE_MANAGER_CHANGE_SMS: ['recipientName', 'caseName', 'websiteUrl'],
    CASE_COMPANY_CHANGE_SMS: ['recipientName', 'caseName', 'websiteUrl'],
    CASE_EST_DATE_CHANGE_SMS: ['recipientName', 'caseName', 'websiteUrl'],
    CASE_LICENSE_CHANGE_SMS: ['recipientName', 'caseName', 'websiteUrl'],
    CASE_TAGGED_SMS: ['recipientName', 'caseName', 'websiteUrl'],
    // ── Signing ──
    SIGN_INVITE_SMS: ['recipientName', 'documentName', 'websiteUrl'],
    DOC_SIGNED_SMS: ['recipientName', 'documentName', 'websiteUrl'],
    DOC_REJECTED_SMS: ['recipientName', 'documentName', 'websiteUrl'],
    SIGN_REMINDER_SMS: ['recipientName', 'documentName', 'websiteUrl'],
    // ── Other ──
    BIRTHDAY_SMS: ['recipientName', 'firmName', 'websiteUrl'],
    GENERAL_SMS: ['recipientName', 'websiteUrl'],
    PAYMENT_SMS: ['recipientName', 'websiteUrl'],
    LICENSE_RENEWAL_SMS: ['recipientName', 'websiteUrl'],
    // ── Client ──
    NEW_CLIENT_SMS: ['recipientName', 'firmName', 'websiteUrl'],
};

/**
 * Validate that a template string contains all required variables for a given key.
 * @param {string} templateKey - The setting key (e.g. 'CASE_CREATED_SMS')
 * @param {string} templateValue - The new template string to validate
 * @returns {{ valid: boolean, missingVars?: string[] }}
 */
function validateTemplate(templateKey, templateValue) {
    const requiredVars = TEMPLATE_REQUIRED_VARS[templateKey];
    if (!requiredVars) {
        // No validation rules defined for this template — allow anything
        return { valid: true };
    }
    if (!templateValue || typeof templateValue !== 'string') {
        return { valid: false, missingVars: requiredVars };
    }

    const presentVars = extractTemplateVars(templateValue);
    const missing = requiredVars.filter(v => !presentVars.includes(v));

    if (missing.length > 0) {
        return { valid: false, missingVars: missing };
    }
    return { valid: true };
}

module.exports = { renderTemplate, extractTemplateVars, validateTemplate, TEMPLATE_REQUIRED_VARS };
