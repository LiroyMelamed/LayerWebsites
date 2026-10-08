import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import signingPackagesApi from '../../../api/signingPackagesApi';
import SigningPackagesWorkspace from './SigningPackagesWorkspace';
import PackageComposer from './PackageComposer';
import StatusNotice from '../../../components/ui/StatusNotice';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import useSigningLocale from './useSigningLocale';

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
    const { t } = useSigningLocale();
    const composing = searchParams.get('panel') === 'compose';
    const setPanel = (value, submissionId) => {
        const next = new URLSearchParams(searchParams);
        if (value) next.set('panel', value);
        else next.delete('panel');
        if (value !== 'compose') { next.delete('template'); next.delete('templateVersion'); next.delete('caseId'); }
        if (submissionId) next.set('submission', submissionId); else next.delete('submission');
        setSearchParams(next);
    };
    useEffect(() => { window.scrollTo?.(0, 0); }, [composing]);
    if (composing && !canCreate) return <section><StatusNotice><p>{t('signingV2.errors.FORBIDDEN')}</p></StatusNotice>
        <SecondaryButton onPress={() => setPanel('runs')}>{t('signingV2.compose.back')}</SecondaryButton></section>;
    if (composing) return <PackageComposer key={`${searchParams.get('template') || 'new'}:${searchParams.get('templateVersion') || ''}:${searchParams.get('caseId') || ''}`} initialTemplateId={searchParams.get('template')} initialTemplateVersion={searchParams.get('templateVersion')} initialCaseId={searchParams.get('caseId')} api={api} onBack={() => setPanel('runs')} onCreated={id => setPanel('runs', id)} />;
    return <SigningPackagesWorkspace api={api} onClose={onClose} initialSubmissionId={searchParams.get('submission')} onClearFocus={() => setPanel('runs')} onCreate={canCreate ? () => setPanel('compose') : undefined} />;
}
