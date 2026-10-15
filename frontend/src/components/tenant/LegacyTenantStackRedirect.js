import { Navigate, useLocation } from 'react-router-dom';
import { getActiveTenantSlug, tenantPath } from '../../lib/tenantSlug';

// Older screens still navigate to absolute stack paths. Keep them inside the
// office selected by TenantShell; authentication remains in the target stack.
export default function LegacyTenantStackRedirect() {
    const location = useLocation();
    const slug = getActiveTenantSlug();
    if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
        return <Navigate to="/" replace />;
    }
    return <Navigate replace state={location.state} to={{
        pathname: tenantPath(slug, location.pathname),
        search: location.search,
        hash: location.hash,
    }} />;
}
