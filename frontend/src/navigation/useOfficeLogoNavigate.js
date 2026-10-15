import { useMemo } from "react";
import { useFirmPermissions } from "../providers/FirmPermissionsProvider";
import { AdminStackName } from "./AdminStack";
import { MainScreenName } from "./screenPaths";
import { NoPermissionsScreenName } from "../screens/noPermissions/NoPermissionsScreen";
import { firstAllowedStaffPath } from "../lib/firmPermissionRoutes";

/** Logo home target — respects main permission in role mode. */
export function useOfficeLogoNavigate() {
    const { permissionMode, canPage, pages, loaded } = useFirmPermissions() || {};

    return useMemo(() => {
        if (!loaded || permissionMode === "legacy" || permissionMode === "platform_admin") {
            return AdminStackName + MainScreenName;
        }
        if (canPage?.("main")) {
            return AdminStackName + MainScreenName;
        }
        return firstAllowedStaffPath(pages) || AdminStackName + NoPermissionsScreenName;
    }, [loaded, permissionMode, canPage, pages]);
}
