import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useFirmPermissions } from "../providers/FirmPermissionsProvider";
import { navKeyForPathname } from "../lib/firmPermissionNav";
import { firstAllowedStaffPath } from "../lib/firmPermissionRoutes";
import RouteFallback from "../components/simpleComponents/RouteFallback";
import { AdminStackName } from "./AdminStack";
import { NoPermissionsScreenName } from "../screens/noPermissions/NoPermissionsScreen";

const PLATFORM_ADMIN_ROUTE_KEYS = new Set([
    "firmStaffRoles",
    "platformSettings",
    "planUsage",
    "allManagers",
]);

export default function AdminRouteGuard({ children }) {
    const location = useLocation();
    const { permissionMode, canPage, loaded, pages, refresh } = useFirmPermissions() || {};
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const isPlatformAdmin = localStorage.getItem("isPlatformAdmin") === "true";

    useEffect(() => {
        if (permissionMode === "role" && typeof refresh === "function") {
            refresh();
        }
    }, [location.pathname, permissionMode, refresh]);

    if (token && !loaded) {
        return <RouteFallback />;
    }

    if (permissionMode === "platform_admin") {
        return children;
    }

    if (permissionMode !== "role") {
        return children;
    }

    const navKey = navKeyForPathname(location.pathname);
    const landing = firstAllowedStaffPath(pages);
    const noPermissionsPath = `${AdminStackName}${NoPermissionsScreenName}`;

    if (location.pathname.includes(NoPermissionsScreenName)) {
        if (landing) {
            return <Navigate to={landing} replace />;
        }
        return children;
    }

    if (!landing && navKey) {
        return <Navigate to={noPermissionsPath} replace />;
    }

    if (!navKey) {
        return children;
    }

    if (PLATFORM_ADMIN_ROUTE_KEYS.has(navKey)) {
        if (!isPlatformAdmin) {
            return <Navigate to={landing || noPermissionsPath} replace />;
        }
        return children;
    }

    if (!canPage(navKey)) {
        return <Navigate to={landing || noPermissionsPath} replace />;
    }

    return children;
}
