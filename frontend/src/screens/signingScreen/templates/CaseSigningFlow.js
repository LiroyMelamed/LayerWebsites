import React, { useState } from 'react';
import PackageComposer from './PackageComposer';
import SigningPackagesWorkspace from './SigningPackagesWorkspace';
import useSigningLocale from './useSigningLocale';

// Rendered inside the existing case popup. The case editor stays mounted, so
// returning never saves or discards its unsaved fields as a side effect.
export default function CaseSigningFlow({ caseId, onBack }) {
    const { t } = useSigningLocale();
    const [created, setCreated] = useState(null);
    const backLabel = t('signingV2.compose.context.back');
    if (created) return <SigningPackagesWorkspace initialSubmissionId={created} onClose={onBack} backLabel={backLabel} />;
    return <PackageComposer initialCaseId={caseId} onBack={onBack} onCreated={setCreated} backLabel={backLabel} />;
}
