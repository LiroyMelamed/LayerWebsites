import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { staffRolesApi } from "../api/staffRolesApi";

const FirmPermissionsContext = createContext(null);

export function FirmPermissionsProvider({ children }) {
    const [scope, setScope] = useState(null);
    const [loaded, setLoaded] = useState(false);

    const refresh = useCallback(async () => {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        if (!token) {
            setScope(null);
            setLoaded(true);
            return;
        }
        try {
            const data = await staffRolesApi.getSessionScope();
            setScope(data);
        } catch {
            setScope(null);
        } finally {
            setLoaded(true);
        }
    }, []);

    useEffect(() => {
        refresh();
        const onFocus = () => refresh();
        const onVisibility = () => {
            if (document.visibilityState === "visible") refresh();
        };
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibility);
        const interval = setInterval(refresh, 60_000);
        return () => {
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisibility);
            clearInterval(interval);
        };
    }, [refresh]);

    const value = useMemo(
        () => ({
            scope,
            loaded,
            refresh,
            permissionMode: scope?.permissionMode || "legacy",
            pages: scope?.pages,
            areas: scope?.areas,
            canPage: (navKey) => {
                if (!loaded || !scope) return false;
                if (scope.permissionMode === "legacy" || scope.permissionMode === "platform_admin") {
                    return true;
                }
                if (scope.permissionMode === "role" && Array.isArray(scope.pages)) {
                    return scope.pages.includes(navKey);
                }
                return false;
            },
            canAction: (areaId, action) => {
                if (!loaded || !scope) return false;
                if (scope.permissionMode === "legacy" || scope.permissionMode === "platform_admin") {
                    return true;
                }
                if (scope.permissionMode !== "role" || !scope.areas?.[areaId]?.visible) return false;
                return (scope.areas[areaId].actions || []).includes(action);
            },
        }),
        [scope, loaded, refresh],
    );

    return (
        <FirmPermissionsContext.Provider value={value}>{children}</FirmPermissionsContext.Provider>
    );
}

export function useFirmPermissions() {
    return useContext(FirmPermissionsContext);
}
