import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { setActiveTenantSlug } from '../../lib/tenantSlug';

export default function TenantShell({ children }) {
    const { tenantSlug } = useParams();

    useEffect(() => {
        if (tenantSlug) {
            setActiveTenantSlug(tenantSlug);
        }
    }, [tenantSlug]);

    return children;
}
