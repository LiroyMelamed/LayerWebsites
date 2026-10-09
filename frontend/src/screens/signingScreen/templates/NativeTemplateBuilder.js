import React, { useCallback, useMemo, useRef, useState } from 'react';
import apiDefault from '../../../api/signingPackagesApi';
import TemplateBuilder from './TemplateBuilder';
import useSigningLocale from './useSigningLocale';
import { fromEditor, toEditor } from './nativeTemplateAdapter';

export default function NativeTemplateBuilder({ version, api = apiDefault, onBack, onSaved }) {
    const { language, t, number, errorMessage } = useSigningLocale();
    const draftId = useRef(version?.state === 'draft' ? version.id : crypto.randomUUID());
    const checkpoint = useRef(version?.state === 'draft' ? version : null);
    const [saved, setSaved] = useState(false);
    const onDirtyChange = useCallback(dirty => { if (dirty) setSaved(false); }, []);
    const [template] = useState(() => ({ isNew: !version, id: version?.id || draftId.current, version: version?.version,
        definition: toEditor(version?.definition || { schemaVersion: 2, name: '', locale: language, dataKeys: [],
            stages: [{ key: 'first', label: t('signingV2.builder.roleDefault', { index: number(1) }), after: null }],
            roles: [{ key: 'first', label: t('signingV2.builder.roleDefault', { index: number(1) }), capacity: 'personal', stage: 0, min: 1, max: 1 }],
            documents: [], policy: { otpRequired: true, deliveryMode: 'invite' } }) }));
    const adapter = useMemo(() => {
        const translateError = error => { throw Object.assign(new Error(errorMessage(error)), { code: error.code }); };
        const saveDraft = async draft => {
            const current = checkpoint.current;
            const body = { definition: fromEditor(draft, language), expectedVersion: current?.editVersion || 0,
                ...(current ? { templateId: current.templateId } : version ? { templateId: version.templateId, baseVersionId: version.id } : {}) };
            try {
                const result = await api.saveTemplateDraft(draftId.current, body);
                checkpoint.current = result.version; setSaved(true); return result.version;
            } catch(error) { return translateError(error); }
        };
        return {
            saveDraft,
            registerCompletionMark: body => api.registerCompletionMark(body).then(value => value.mark).catch(translateError),
            completionMark: id => api.completionMark(id).then(value => value.mark).catch(translateError),
            pdf: (_id, key) => api.templateDocument(checkpoint.current?.id || version?.id, key).catch(translateError),
            source: async key => {
                try { const { source } = await api.registerTemplateSource(key); return { sourceArtifactId: source.id, sourceHash: source.hash }; }
                catch(error) { return translateError(error); }
            },
            save: async draft => {
                const savedVersion = await saveDraft(draft);
                try {
                    const { version: published } = await api.publishTemplateDraft(savedVersion.id, { expectedVersion: savedVersion.editVersion, definitionHash: savedVersion.definitionHash });
                    return { template: { id: published.templateId, versionId: published.id } };
                } catch(error) { return translateError(error); }
            },
        };
    }, [api, language, version, errorMessage]);
    return <>
        {saved && <p role="status">{t('signingV2.authoring.saved')}</p>}
        <TemplateBuilder template={template} adapter={adapter} onSaveDraft={adapter.saveDraft} onDirtyChange={onDirtyChange} onBack={onBack} onSaved={onSaved} />
    </>;
}
