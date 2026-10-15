import { Navigate, useParams } from 'react-router-dom';

export default function TenantAdminRedirect() {
    const { tenantSlug } = useParams();
    return <Navigate to={`/${tenantSlug}/LoginStack/LoginScreen`} replace />;
}
