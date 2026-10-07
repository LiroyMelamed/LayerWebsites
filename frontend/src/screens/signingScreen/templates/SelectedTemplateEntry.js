import React, { useEffect, useRef, useState } from 'react';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import useSigningLocale from './useSigningLocale';

// A send action already selected a template. Resolve that choice once, before
// mounting editable recipient fields; a late response must not erase a draft.
export async function resolveSelectedTemplate(api, id, locale, expectedVersion) {
    const catalog = await api.templates();
    const legacy = catalog.legacy.find(item => String(item.id) === String(id));
    const matching = catalog.templates.filter(item => String(item.origin?.templateId || item.templateId) === String(id) || item.versionId === id);
    let selected = matching.sort((a, b) => (b.origin?.version || b.version) - (a.origin?.version || a.version))[0];
    const version = legacy?.version ?? selected?.origin?.version ?? selected?.version;
    if (expectedVersion != null && String(expectedVersion) !== String(version)) throw Object.assign(new Error('Selected template changed'), { code: 'SELECTED_TEMPLATE_CHANGED' });
    if (legacy) {
        const imported = await api.importLegacy(legacy.id, locale, legacy.version);
        const refreshed = await api.templates();
        selected = refreshed.templates.find(item => item.versionId === imported.versionId);
        // Do not silently send an older import if editing won the race.
        if (refreshed.legacy.some(item => String(item.id) === String(id) && item.version !== legacy.version)) throw Object.assign(new Error('Selected template changed'), { code: 'SELECTED_TEMPLATE_CHANGED' });
    }
    if (!selected) throw Object.assign(new Error('Selected template unavailable'), { code: 'SELECTED_TEMPLATE_UNAVAILABLE' });
    return selected;
}

export default function SelectedTemplateEntry({ api, templateId, expectedVersion, onReady, onChoose }) {
    const { t, language } = useSigningLocale();
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const ready = useRef(onReady);
    ready.current = onReady;
    useEffect(() => {
        let current = true;
        setError(null);
        resolveSelectedTemplate(api, templateId, language, expectedVersion).then(
            template => { if (current) ready.current(template); },
            failure => { if (current) setError(failure); },
        );
        return () => { current = false; };
    }, [api, templateId, expectedVersion, language, attempt]);
    if (!error) return <p role="status">{t('signingV2.compose.template.opening')}</p>;
    return <>
        <StatusNotice embedded onAction={() => setAttempt(value => value + 1)} actionLabel={t('common.retry')}>
            <p>{t(`signingV2.compose.errors.${error.code}`, { defaultValue: t('signingV2.compose.template.openFailed') })}</p>
        </StatusNotice>
        <SecondaryButton onPress={onChoose}>{t('signingV2.compose.template.chooseAnother')}</SecondaryButton>
    </>;
}
