import React, { useState } from 'react';
import PackageComposer from './PackageComposer';
import SigningPackagesWorkspace from './SigningPackagesWorkspace';
import useSigningLocale from './useSigningLocale';

// The client editor remains mounted behind this flow; only the persisted ID is
// handed off. Unsaved form values must never be sent or saved as a side effect.
export default function ClientSigningFlow({ clientId, onBack }) {
    const { t } = useSigningLocale();
    const [created, setCreated] = useState(null);
    const backLabel = t('signingV2.compose.clientContext.back');
    if (created) return <SigningPackagesWorkspace initialSubmissionId={created} onClose={onBack} backLabel={backLabel} />;
    return <PackageComposer initialClientId={clientId} onBack={onBack} onCreated={setCreated} backLabel={backLabel} />;
}
