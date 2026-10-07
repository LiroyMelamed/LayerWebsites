import React, { useEffect, useState } from 'react';
import signingPackagesApi from '../../../api/signingPackagesApi';
import SigningPackagesWorkspace from './SigningPackagesWorkspace';
import PackageComposer from './PackageComposer';

// The v2 API answers 404 until SIGNING_V2_ENABLED is set for the deployment.
export function useSigningV2Available(api = signingPackagesApi) {
    const [available, setAvailable] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        api.list({ state: 'pending' }, { signal: controller.signal }).then(() => setAvailable(true), () => setAvailable(false));
        return () => controller.abort();
    }, [api]);
    return available;
}

export default function SigningPackagesHub({ onClose, canCreate, api = signingPackagesApi }) {
    const [composing, setComposing] = useState(false);
    useEffect(() => { window.scrollTo?.(0, 0); }, [composing]);
    if (composing) return <PackageComposer api={api} onBack={() => setComposing(false)} onCreated={() => setComposing(false)} />;
    return <SigningPackagesWorkspace api={api} onClose={onClose} onCreate={canCreate ? () => setComposing(true) : undefined} />;
}
