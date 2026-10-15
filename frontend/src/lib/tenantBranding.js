export function useNaturalLogoColors() {
    const appName = String(process.env.REACT_APP_APP_NAME || '').toLowerCase();
    const multiTenant = String(process.env.REACT_APP_MULTI_TENANT || '').toLowerCase() === 'true';
    return appName === 'melamedia' || appName === 'idm' || multiTenant;
}

export function getPublicFirmLogoUrl() {
    return `${process.env.PUBLIC_URL || ''}/firm-logo.png`;
}

export function getMelaMediaMarkUrl() {
    const base = process.env.PUBLIC_URL || '';
    return `${base}/melamedia-mark.png`;
}

export function isMultiTenantPlatform() {
    return String(process.env.REACT_APP_MULTI_TENANT || '').toLowerCase() === 'true';
}
