import SigningSelect from './SigningSelect';
import React, { useEffect, useState } from 'react';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import useSigningLocale from './useSigningLocale';

export default function DraftRecoveryList({ api, onResume }) {
    const { t, language } = useSigningLocale();
    const [rows, setRows] = useState([]), [selected, setSelected] = useState(''), [error, setError] = useState(false), [retry, setRetry] = useState(0);
    useEffect(() => {
        let current = true;
        if (api.drafts) api.drafts().then(result => { if (current) { setRows(result.rows || []); setError(false); } }, () => { if (current) setError(true); });
        return () => { current = false; };
    }, [api, retry]);
    if (error) return <StatusNotice embedded onAction={() => setRetry(value => value + 1)} actionLabel={t('common.retry')}><p>{t('signingV2.compose.draft.listError')}</p></StatusNotice>;
    if (!rows.length) return null;
    const date = new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' });
    return <details className="lw-signingCompose__optionalRoles">
        <summary>{t('signingV2.compose.draft.recent')}</summary>
        <label htmlFor="signing-saved-draft">{t('signingV2.compose.draft.choose')}</label>
        <SigningSelect id="signing-saved-draft" value={selected} onChange={event => setSelected(event.target.value)}>
            <option value="">{t('signingV2.compose.draft.choose')}</option>
            {rows.map((row, index) => <option key={row.id} value={row.id}>{date.format(new Date(row.updatedAt))} · {new Intl.NumberFormat(language).format(index + 1)}{row.state === 'submitted' ? ` · ${t('signingV2.compose.draft.submitted')}` : ''}</option>)}
        </SigningSelect>
        <SecondaryButton disabled={!selected} onPress={() => onResume(selected)}>{t('signingV2.compose.draft.resume')}</SecondaryButton>
    </details>;
}
