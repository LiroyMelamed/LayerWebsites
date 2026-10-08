import React, { useEffect, useState } from 'react';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import SimpleInput from '../../../components/simpleComponents/SimpleInput';
import useSigningLocale from './useSigningLocale';

export default function ApprovalReviewerField({ api, value, onChange, soloAllowed, validationError }) {
    const { t, direction, errorMessage } = useSigningLocale();
    const [users, setUsers] = useState(null), [error, setError] = useState(null), [attempt, setAttempt] = useState(0);
    const [search, setSearch] = useState('');
    useEffect(() => {
        let current = true; setError(null); setUsers(null);
        api.approvalReviewers().then(result => { if (current) setUsers(result.users); }).catch(e => { if (current) setError(e); });
        return () => { current = false; };
    }, [api, attempt]);
    return <div className="lw-signingCompose__field is-wide">
        <label htmlFor="approval-reviewer">{t('signingV2.approval.reviewer')}</label>
        <p>{t('signingV2.approval.waitingHelp')}</p>
        {users?.length > 8 && <div className="lw-signingPackages__contactFields"><SimpleInput title={t('signingV2.lifecycle.assign.search')} aria-label={t('signingV2.lifecycle.assign.search')} value={search} onChange={event => setSearch(event.target.value)} timeToWaitInMilli={0} containerDir={direction} dir={direction} textStyle={{ textAlign: 'start' }} /></div>}
        {users && <select id="approval-reviewer" dir={direction} aria-invalid={!!validationError} aria-describedby={validationError ? 'approval-reviewer-error' : undefined} value={value || ''} onChange={event => onChange(event.target.value ? Number(event.target.value) : null)}>
            <option value="">{t('signingV2.approval.choose')}</option>
            {users.filter(user => (soloAllowed || !user.self) && (user.id === value || user.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))).map(user => <option key={user.id} value={user.id}>{user.name}{user.self ? ` · ${t('signingV2.approval.solo')}` : ''}</option>)}
        </select>}
        {validationError && <p id="approval-reviewer-error">{errorMessage({code:validationError})}</p>}
        {!users && !error && <p role="status">{t('common.loading')}</p>}
        {error && <StatusNotice embedded><p>{errorMessage(error)}</p><SecondaryButton onPress={() => setAttempt(n => n + 1)}>{t('common.retry')}</SecondaryButton></StatusNotice>}
    </div>;
}
