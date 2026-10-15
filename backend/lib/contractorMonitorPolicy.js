// The dedicated database identity, not a mutable branding/display-name setting.
const CATEGORY = 'contractor_monitor';
const ACTIVE_PREFIX = 'CM_ACTIVE_SITES_';
const TYPES = {
    CM_ENABLED: 'boolean', CM_ALWAYS_SEND_REPORT: 'boolean',
    CM_CHECK_INTERVAL_DAYS: 'number', CM_REPORT_HOUR: 'time',
    CM_GLOBAL_EMAIL_RECIPIENTS: 'string', CM_GLOBAL_SMS_RECIPIENTS: 'string',
    CM_LAST_RUN_AT: 'string', CM_LAST_RUN_RESULT: 'string',
    CM_ACTIVE_SITES_INCLUDE_IN_GLOBAL_SUMMARY: 'boolean',
};
for (const source of ['PINKASH', 'MANPOWER', 'CRANE', 'SERVICE', 'ACTIVE_SITES']) {
    TYPES[`CM_${source}_ENABLED`] = 'boolean';
    TYPES[`CM_${source}_EMAIL_RECIPIENTS`] = 'string';
    TYPES[`CM_${source}_SMS_RECIPIENTS`] = 'string';
}
function policyError(code, status, message) {
    return Object.assign(new Error(message), { code, status });
}
function isContractorSetting(category, key) {
    return category === CATEGORY || String(key || '').startsWith(ACTIVE_PREFIX);
}
async function assertTenant(queryable) {
    const { rows } = await queryable.query('SELECT pg_catalog.current_database() AS database_name');
    if (rows[0]?.database_name !== 'melamedlaw') {
        throw policyError('CONTRACTOR_MONITOR_TENANT_FORBIDDEN', 403, 'מעקב קבלנים זמין רק ב־MelamedLaw');
    }
}
function valueType(category, key, value) {
    if (!isContractorSetting(category, key)) return null;
    if (category !== CATEGORY || !TYPES[key]) {
        throw policyError('CONTRACTOR_MONITOR_INVALID_SETTING', 400, 'הגדרת מעקב קבלנים לא תקינה');
    }
    const type = TYPES[key];
    if (type === 'boolean' && ![true, false, 'true', 'false', '1', '0'].includes(value)) {
        throw policyError('CONTRACTOR_MONITOR_INVALID_BOOLEAN', 400, 'נדרש ערך פעיל או כבוי');
    }
    if (type === 'number' && (!Number.isInteger(Number(value)) || Number(value) < 1)) {
        throw policyError('CONTRACTOR_MONITOR_INVALID_INTERVAL', 400, 'מרווח הבדיקה חייב להיות מספר ימים חיובי');
    }
    if (type === 'string' && value != null && typeof value !== 'string') {
        throw policyError('CONTRACTOR_MONITOR_INVALID_VALUE', 400, 'נדרש ערך טקסט');
    }
    return type;
}
const explicitRecipients = (category, key) => category === CATEGORY && key.startsWith(ACTIVE_PREFIX) && key.endsWith('_RECIPIENTS');
module.exports = { assertTenant, isContractorSetting, valueType, explicitRecipients };
