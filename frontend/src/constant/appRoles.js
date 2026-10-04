export const AppRoles = {
    Admin: "Admin",
    Staff: "Staff",
    Customer: "User",
};

/** Office web admin stack (not end clients). */
export function isOfficeWebRole(role) {
    return role === AppRoles.Admin || role === AppRoles.Staff;
}
