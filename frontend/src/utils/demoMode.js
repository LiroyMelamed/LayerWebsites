export function isDemoModeEnabled() {
    return typeof window !== "undefined" && window.__LW_DEMO_MODE__ === true;
}

export function getDemoModeToken() {
    if (!isDemoModeEnabled()) return null;
    const t = typeof window !== "undefined" ? window.__LW_DEMO_TOKEN__ : null;
    return typeof t === "string" && t.trim() ? t.trim() : null;
}
