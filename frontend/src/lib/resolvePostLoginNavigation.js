import { AdminStackName } from "../navigation/AdminStack";
import { ClientStackName } from "../navigation/ClientStack";
import { AppRoles, isOfficeWebRole } from "../constant/appRoles";
import { getActiveTenantSlug, isMultiTenantApp, tenantPath } from "./tenantSlug";
import { staffRolesApi } from "../api/staffRolesApi";
import { firstAllowedStaffPath } from "./firmPermissionRoutes";
import { MainScreenName } from "../navigation/screenPaths";
import { ClientMainScreenName } from "../screens/client/clientMainScreen/ClientMainScreen";
import { NoPermissionsScreenName } from "../screens/noPermissions/NoPermissionsScreen";

function adminStackBase(slug) {
    return isMultiTenantApp() && slug ? tenantPath(slug, AdminStackName) : AdminStackName;
}

function clientStackBase(slug) {
    return isMultiTenantApp() && slug ? tenantPath(slug, ClientStackName) : ClientStackName;
}

/**
 * After OTP — session-scope drives office shell; legacy users.role routing when legacy mode.
 * @returns {Promise<string>} absolute app path (with tenant prefix when applicable)
 */
export async function resolvePostLoginPath({ role, isPlatformAdmin }) {
    const slug = getActiveTenantSlug();
    const adminHome = `${adminStackBase(slug)}${MainScreenName}`;
    const clientHome = `${clientStackBase(slug)}${ClientMainScreenName}`;
    const noPermissions = `${adminStackBase(slug)}${NoPermissionsScreenName}`;

    try {
        const scope = await staffRolesApi.getSessionScope();
        const mode = scope?.permissionMode;

        if (mode === "platform_admin" || isPlatformAdmin) {
            return adminHome;
        }

        if (mode === "role") {
            const landing = firstAllowedStaffPath(scope?.pages);
            return landing || noPermissions;
        }
    } catch {
        // fall through to legacy
    }

    if (isOfficeWebRole(role) || role === AppRoles.Admin || role === AppRoles.Staff) {
        return adminHome;
    }
    return clientHome;
}
