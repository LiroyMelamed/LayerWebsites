function isFirmScopeEnabled() {
    return String(process.env.FIRM_SCOPE_ENABLED ?? 'false').toLowerCase() === 'true';
}

function getDefaultFirmKey() {
    const key = String(process.env.LAW_FIRM_KEY || 'default').trim();
    return key || 'default';
}

function getDefaultFirmName() {
    const name = String(process.env.LAW_FIRM_NAME || 'Default Firm').trim();
    return name || 'Default Firm';
}

module.exports = {
    isFirmScopeEnabled,
    getDefaultFirmKey,
    getDefaultFirmName,
};
