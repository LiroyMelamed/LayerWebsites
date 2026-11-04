import SimpleInput from '../../../components/simpleComponents/SimpleInput';
import SigningSelect from './SigningSelect';
import React, { useEffect, useState } from 'react';
import useSigningLocale from './useSigningLocale';
import StatusNotice from '../../../components/ui/StatusNotice';
import api from '../../../api/signingTemplatesApi';

export default function RecipientFields({ role, value = {}, onChange, disabled }) {
    const { t } = useSigningLocale();
    const [search, setSearch] = useState('');const [matches, setMatches] = useState([]);const [error, setError] = useState('');
    useEffect(() => {
        if (!search.trim()) { setMatches([]);return undefined; }
        let active = true;const timer = setTimeout(() => {
            api.contacts(search).then(data => { if (active) { setMatches(data.contacts);setError(''); } }).catch(() => { if (active) setError(t('signingV2.errors.REQUEST_FAILED')); });
        }, 300);
        return () => { active = false;clearTimeout(timer); };
    }, [search, t]);
    const change = patch => onChange({ ...value, ...patch });
    return <fieldset className="lw-templates__recipient" disabled={disabled}>
        <legend>{role.name}</legend>
        {value.userId ? <div className="lw-templates__chosen"><strong>{value.name || String(value.userId)}</strong><span dir="ltr">{value.email || value.phone}</span><button type="button" onClick={() => { onChange({ deliveryMethod: 'email' });setSearch(''); }}>{t('signingV2.compose.replaceRecipient')}</button></div> : <>
            <label>{t('signingV2.compose.directoryHelp.all')}<SimpleInput timeToWaitInMilli={0} acceptExternalValueWhileFocused value={search} onChange={e => setSearch(e.target.value)} placeholder={t('signingV2.compose.searchRecipients')} autoComplete="off" /></label>
            {error && <StatusNotice embedded><p>{error}</p></StatusNotice>}
            {!!matches.length && <ul className="lw-templates__matches">{matches.map(person => <li key={person.userId}><button type="button" onClick={() => { onChange({ ...person, deliveryMethod: person.email ? 'email' : 'phone' });setMatches([]);setSearch(''); }}>{person.name} <small dir="ltr">{person.email || person.phone}</small></button></li>)}</ul>}
            <div className="lw-templates__contactGrid">
                <label>{t('signingV2.compose.fields.name')}<SimpleInput timeToWaitInMilli={0} acceptExternalValueWhileFocused value={value.name || ''} maxLength={120} onChange={e => change({ name: e.target.value })} /></label>
                <label>{t('signingV2.compose.fields.email')}<SimpleInput timeToWaitInMilli={0} acceptExternalValueWhileFocused type="email" dir="ltr" value={value.email || ''} onChange={e => change({ email: e.target.value })} /></label>
                <label>{t('signingV2.compose.fields.phone')}<SimpleInput timeToWaitInMilli={0} acceptExternalValueWhileFocused type="tel" dir="ltr" value={value.phone || ''} onChange={e => change({ phone: e.target.value })} /></label>
            </div>
        </>}
        <label>{t('signingV2.compose.fields.channel')}<SigningSelect value={value.deliveryMethod || 'email'} onChange={e => change({ deliveryMethod: e.target.value })}><option value="email">{t('signingV2.compose.channel.email')}</option><option value="phone">{t('signingV2.compose.channel.sms')}</option><option value="both">{t('signingV2.compose.channel.both')}</option></SigningSelect></label>
    </fieldset>;
}
