import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
    const [searchParams, setSearchParams] = useSearchParams();
    const composing = searchParams.get('panel') === 'compose';
    const setPanel = (value) => {
        const next = new URLSearchParams(searchParams);
        if (value) next.set('panel', value);
        else next.delete('panel');
        if (value !== 'compose') next.delete('template');
        setSearchParams(next);
    };
    useEffect(() => { window.scrollTo?.(0, 0); }, [composing]);
    if (composing) return <PackageComposer initialTemplateId={searchParams.get('template')} api={api} onBack={() => setPanel('runs')} onCreated={() => setPanel('runs')} />;
    return <SigningPackagesWorkspace api={api} onClose={onClose} onCreate={canCreate ? () => setPanel('compose') : undefined} />;
}
