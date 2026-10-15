import { Navigate } from "react-router-dom";
import { useFirmPermissions } from "../providers/FirmPermissionsProvider";
import RouteFallback from "../components/simpleComponents/RouteFallback";
import { firstAllowedStaffPath } from "../lib/firmPermissionRoutes";
import { AdminStackName } from "./AdminStack";
import { NoPermissionsScreenName } from "../screens/noPermissions/NoPermissionsScreen";

/** Legacy Lawyer on ClientStack with custom role → office permission shell (AdminStack). */
export default function ClientStackRoleRedirect({ children }) {
    const { permissionMode, pages, loaded } = useFirmPermissions() || {};

    if (!loaded) {
        return <RouteFallback />;
    }

    if (permissionMode === "role") {
        const landing = firstAllowedStaffPath(pages);
        const target = landing || `${AdminStackName}${NoPermissionsScreenName}`;
        return <Navigate to={target} replace />;
    }

    return children;
}
