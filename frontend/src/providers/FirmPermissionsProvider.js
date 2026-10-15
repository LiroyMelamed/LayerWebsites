import { useMemo } from "react";

// UI availability mirrors the incumbent legacy calendar role contract.
// The authenticated calendar backend remains authoritative for each action.
export function legacyCalendarPermissionsForRole(role, authenticated) {
    const allowed = !!authenticated && (role === "Admin" || role === "Lawyer");
    return {
        loaded: true,
        error: null,
        permissionMode: "legacy_calendar",
        canAction: (area, action) => allowed && area === "calendar" && action === "manage",
    };
}

export function useFirmPermissions() {
    let role = "";
    let authenticated = false;
    try {
        role = window.localStorage.getItem("role") || "";
        authenticated = !!window.localStorage.getItem("token");
    } catch { /* The legacy route guard still controls access. */ }
    return useMemo(() => legacyCalendarPermissionsForRole(role, authenticated), [role, authenticated]);
}
