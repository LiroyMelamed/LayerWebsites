import React, { useEffect, useRef, useState } from 'react';
import wordTemplatesApi from '../../../api/wordTemplatesApi';
import NativeTemplateBuilder from '../templates/NativeTemplateBuilder';
import PackageComposer from '../templates/PackageComposer';
import SigningBackButton from '../templates/SigningBackButton';
import useSigningLocale from '../templates/useSigningLocale';
import StatusNotice from '../../../components/ui/StatusNotice';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/i;
const ORIGIN_KEYS = ['kind', 'previewId', 'sourceId', 'sourceVersion', 'sourceHash', 'bindingsHash',
    'filledDocxHash', 'valuesHash', 'inputsHash', 'pdfHash', 'authorUserId'];
const optionalId = value => value == null || (Number.isSafeInteger(value) && value > 0 && value <= 2147483647);

export function validWordSigningDraft(result, preview) {
    const { version, source, origin } = result || {};
    return version?.state === 'draft' && UUID.test(version.id || '') && UUID.test(version.templateId || '')
        && version.editVersion === 1 && origin?.kind === 'word_preview' && origin.previewId === preview.id
        && origin.pdfHash === preview.pdfHash && origin.sourceId === preview.sourceId
        && origin.sourceVersion === preview.sourceVersion && source?.hash === preview.pdfHash
        && Object.keys(origin).length === ORIGIN_KEYS.length
        && ORIGIN_KEYS.every(key => Object.hasOwn(origin, key) && origin[key] === version.definition?.origin?.[key])
        && ['sourceHash', 'bindingsHash', 'filledDocxHash', 'valuesHash', 'inputsHash', 'pdfHash'].every(key => HASH.test(origin[key] || ''))
        && Number.isSafeInteger(origin.authorUserId) && origin.authorUserId > 0
        && UUID.test(source.id || '') && version.definition?.origin?.previewId === preview.id
        && version.definition.origin.pdfHash === preview.pdfHash
        && version.definition.documents?.length === 1
        && version.definition.documents[0].sourceArtifactId === source.id
        && version.definition.documents[0].sourceHash === preview.pdfHash
        && version.definition.documents[0].fields?.length === 0;
}

// This boundary consumes opaque server IDs and a reviewed hash. It never uploads
// the browser's file, infers recipients or carries source-PDF geometry forward.
export default function WordSigningWorkflow({ preview, onBack, onCreated, api = wordTemplatesApi }) {
    const { t, language, direction } = useSigningLocale();
    const text = key => t(`signingWord.${key}`);
    const [locale] = useState(() => ['he', 'ar', 'en'].includes(language) ? language : 'he');
    const requestId = useRef(null);
    const binding = `${preview.id}:${preview.pdfHash}`;
    if (requestId.current?.binding !== binding) requestId.current = { binding, key: globalThis.crypto?.randomUUID?.() };
    const [state, setState] = useState({ status: 'loading' });
    useEffect(() => {
        let active = true;
        setState({ status: 'loading' });
        (async () => {
            try {
                if (!UUID.test(preview.id || '') || !HASH.test(preview.pdfHash || '') || !UUID.test(requestId.current.key || '')
                    || !UUID.test(preview.sourceId || '') || !Number.isSafeInteger(preview.sourceVersion) || preview.sourceVersion < 1
                    || !optionalId(preview.caseId) || !optionalId(preview.clientId)
                    || preview.requiresFreshSigningGeometry !== true) throw new Error('Invalid preview');
                const result = await api.nativeDraft(preview.id, { expectedPdfHash: preview.pdfHash, locale }, requestId.current.key);
                if (!validWordSigningDraft(result, preview)) throw new Error('Invalid draft');
                if (active) setState({ status: 'editing', version: result.version });
            } catch {
                if (active) setState({ status: 'error' });
            }
        })();
        return () => { active = false; };
    }, [api, preview.id, preview.pdfHash, preview.sourceId, preview.sourceVersion, preview.requiresFreshSigningGeometry, locale]);

    if (state.status === 'editing') return <section dir={direction} aria-label={text('nativeTitle')}>
        <StatusNotice><p>{text('nativeNotice')}</p></StatusNotice>
        <NativeTemplateBuilder key={state.version.id} version={state.version} onBack={onBack}
            onSaved={published => {
                if (UUID.test(published?.versionId || '')) setState({ status: 'composing', versionId: published.versionId });
                else setState({ status: 'error' });
            }} />
    </section>;
    if (state.status === 'composing') return <PackageComposer key={state.versionId}
        initialTemplateId={state.versionId} initialCaseId={preview.caseId || undefined}
        initialClientId={preview.clientId || undefined} lockedDocumentContext onBack={onBack} backLabel={text('nativeBack')} onCreated={onCreated} />;
    return <section dir={direction} aria-label={text('nativeTitle')}>
        <SigningBackButton onPress={onBack}>{text('nativeBack')}</SigningBackButton>
        {state.status === 'loading' ? <p role="status">{text('nativePreparing')}</p>
            : <StatusNotice><p>{text('nativeFailure')}</p></StatusNotice>}
    </section>;
}
