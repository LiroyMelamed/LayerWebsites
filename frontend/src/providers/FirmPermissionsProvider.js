import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { staffRolesApi } from "../api/staffRolesApi";

const FirmPermissionsContext = createContext(null);

export function FirmPermissionsProvider({ children }) {
    const [scope, setScope] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(null);

    const requestRef = useRef(0);
    const refresh = useCallback(async () => {
        const requestId = ++requestRef.current;
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        if (!token) {
            setScope(null);
            setError(null);
            setLoaded(true);
            return;
        }
        try {
            const data = await staffRolesApi.getSessionScope();
            if (requestId === requestRef.current && token === localStorage.getItem("token")) { setScope(data); setError(null); }
        } catch (failure) {
            if (requestId === requestRef.current && token === localStorage.getItem("token")) { setScope(null); setError(failure); }
        } finally {
            if (requestId === requestRef.current) {
                if (token === localStorage.getItem("token")) setLoaded(true);
                else void refresh();
            }
        }
    }, []);

    useEffect(() => {
        refresh();
        const onFocus = () => refresh();
        const onAuthChange = () => { setScope(null); setError(null); setLoaded(false); refresh(); };
        window.addEventListener("lw-auth-changed", onAuthChange);
        const onVisibility = () => {
            if (document.visibilityState === "visible") refresh();
        };
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibility);
        const interval = setInterval(refresh, 60_000);
        return () => {
            requestRef.current += 1;
            window.removeEventListener("focus", onFocus);
            window.removeEventListener("lw-auth-changed", onAuthChange);
            document.removeEventListener("visibilitychange", onVisibility);
            clearInterval(interval);
        };
    }, [refresh]);

    const value = useMemo(
        () => ({
            scope,
            loaded,
            error,
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
        [scope, loaded, error, refresh],
    );

    return (
        <FirmPermissionsContext.Provider value={value}>{children}</FirmPermissionsContext.Provider>
    );
}

export function useFirmPermissions() {
    return useContext(FirmPermissionsContext);
}
