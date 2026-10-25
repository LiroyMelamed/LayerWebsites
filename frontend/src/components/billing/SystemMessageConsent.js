import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ApiUtils from '../../api/apiUtils';
import SimpleCard from '../simpleComponents/SimpleCard';
import SimpleCheckbox from '../simpleComponents/SimpleCheckbox';
import PrimaryButton from '../styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../styledComponents/buttons/SecondaryButton';
import { Text14, TextBold24 } from '../specializedComponents/text/AllTextKindFile';
import './SystemMessageConsent.scss';

export const SYSTEM_MESSAGE_CONSENT_VERSION = 'melamedia-transactional-whatsapp-v1';
const ENDPOINT = '/billing/system-message-consent';

export function SystemMessageConsentChoice({ checked, onChange, disabled = false }) {
    const { t, i18n } = useTranslation();
    const hintId = useId();
    return <div className="lw-systemMessageConsent__choice" dir={i18n.dir()}>
        <SimpleCheckbox checked={checked} onChange={onChange} disabled={disabled}
            aria-describedby={hintId} title={t('systemMessages.consentLabel')} />
        <Text14 id={hintId}>{t('systemMessages.consentHint')}</Text14>
    </div>;
}

export default function SystemMessageConsent() {
    const { t, i18n } = useTranslation();
    const [data, setData] = useState(null);
    const [checked, setChecked] = useState(false);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [saved, setSaved] = useState(false);
    const action = useRef(null);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        setLoading(true); setError(false);
        try {
            const result = await ApiUtils.get(ENDPOINT, { timeout: 12000 });
            if (!mounted.current) return;
            if (result?.status === 403) { setData({ available: false }); return; }
            if (!result?.success || typeof result.data?.available !== 'boolean') throw new Error('UNAVAILABLE');
            const preference = result.data.confirmationRequired === true ? { ...result.data, optedIn: false } : result.data;
            setData(preference); setChecked(preference.optedIn === true);
        } catch (_) { if (mounted.current) setError(true); }
        finally { if (mounted.current) setLoading(false); }
    }, []);
    useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);

    const save = async () => {
        if (busy || !data?.available) return;
        setBusy(true); setError(false); setSaved(false);
        // An ambiguous API response is retried with the same explicit action.
        try {
            if (!action.current || action.current.optedIn !== checked) {
                action.current = { actionId: crypto.randomUUID(), optedIn: checked };
            }
            const result = await ApiUtils.post(ENDPOINT, { ...action.current,
                consentVersion: SYSTEM_MESSAGE_CONSENT_VERSION }, { timeout: 12000 });
            if (!mounted.current) return;
            if (!result?.success || result.data?.available !== true || typeof result.data.optedIn !== 'boolean') throw new Error('UNAVAILABLE');
            setData(result.data); setChecked(result.data.optedIn); setSaved(true); action.current = null;
        } catch (_) { if (mounted.current) setError(true); }
        finally { if (mounted.current) setBusy(false); }
    };

    if (!loading && !error && data?.available === false) return null;
    return <SimpleCard className="lw-planUsageScreen__card lw-systemMessageConsent" dir={i18n.dir()}>
        <TextBold24>{t('systemMessages.title')}</TextBold24>
        {loading ? <Text14 role="status">{t('systemMessages.loading')}</Text14> : <>
            {data?.available && <>
                <Text14>{t('systemMessages.recipientHint', { last4: String(data.recipient || '').slice(-4) })}</Text14>
                {data.confirmationRequired === true && <Text14 role="status">{t('systemMessages.confirmationRequired')}</Text14>}
                <SystemMessageConsentChoice checked={checked} disabled={busy}
                    onChange={event => { setChecked(event.target.checked); setSaved(false); setError(false); }} />
                <PrimaryButton onPress={save} isPerforming={busy}
                    disabled={busy || (checked === data.optedIn && !error && !action.current && !data.confirmationRequired)}>
                    {t(data.confirmationRequired && !checked ? 'systemMessages.withdrawPrevious' : 'systemMessages.save')}
                </PrimaryButton>
            </>}
            {error && <div className="lw-systemMessageConsent__feedback" role="alert">
                <Text14>{t(data?.available ? 'systemMessages.saveError' : 'systemMessages.loadError')}</Text14>
                {!data?.available && <SecondaryButton onPress={load}>{t('common.retry')}</SecondaryButton>}
            </div>}
            {saved && <Text14 role="status">{t('systemMessages.saved')}</Text14>}
        </>}
    </SimpleCard>;
}
