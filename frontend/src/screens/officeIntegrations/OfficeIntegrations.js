import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { officeIntegrationsApi as api } from '../../api/officeIntegrationsApi';
import { prepareWhatsAppSdk, launchWhatsAppSignup } from '../../services/whatsappEmbeddedSignup';
import SimpleCard from '../../components/simpleComponents/SimpleCard';
import SimpleInput from '../../components/simpleComponents/SimpleInput';
import SimpleTextArea from '../../components/simpleComponents/SimpleTextArea';
import SimpleCheckbox from '../../components/simpleComponents/SimpleCheckbox';
import PrimaryButton from '../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../components/ui/StatusNotice';
import { Text14, TextBold18 } from '../../components/specializedComponents/text/AllTextKindFile';
import WhatsappSafety from './WhatsappSafety';
import './OfficeIntegrations.scss';

export default function OfficeIntegrations({ embedded = false }) {
    const { t, i18n } = useTranslation();
    const language = String(i18n?.resolvedLanguage || i18n?.language || 'he').split('-')[0];
    const locale = { he: 'he-IL', ar: 'ar-IL', en: 'en-GB' }[language] || 'he-IL';
    const direction = language === 'en' ? 'ltr' : 'rtl';
    const tr = key => t(`officeIntegrations.${key}`);
    const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [court, setCourt] = useState({ enabled: false, label: '', dailySyncEnabled: true, syncTime: '08:00' });
    const [whatsapp, setWhatsapp] = useState({ enabled: false, mode: 'demo', recipients: '', includeCaseManager: false, templateName: '', templateLanguage: 'he', templateParameters: '' });
    const [setupOpen, setSetupOpen] = useState(false);
    const [signup, setSignup] = useState(null);
    const signupReady = data?.signup.ready, signupAppId = data?.signup.appId, signupVersion = data?.signup.version;
    const generation = useRef(0), cancelSignup = useRef(null);
    const load = useCallback(async expected => {
        // The authenticated office is resolved by the server, never a list or URL selection.
        const value = await api.snapshot();
        if (generation.current !== expected) return;
        setData(value);
        setCourt({ enabled: value.court?.enabled || false, label: value.court?.settings?.label || '',
            dailySyncEnabled: value.court?.settings?.dailySyncEnabled ?? true, syncTime: value.court?.settings?.syncTime || '08:00' });
        const settings = value.whatsapp?.settings || {};
        const mode = value.signup.liveEnabled && !value.signup.demoOnly ? 'live' : 'demo';
        setWhatsapp({ enabled: settings.mode === mode && Boolean(value.whatsapp?.enabled), mode, recipients: (settings.recipients || []).join('\n'), includeCaseManager: settings.includeCaseManager === true, templateName: settings.templateName || '', templateLanguage: settings.templateLanguage || 'he', templateParameters: (settings.templateParameters || []).join('\n') });
    }, []);
    useEffect(() => {
        const current = ++generation.current;
        load(current).catch(e => { if (current === generation.current) setError(e.message); });
        return () => { generation.current += 1; cancelSignup.current?.(); };
    }, [load]);
    // Preload the nonce + SDK so the customer opens Meta directly on their click.
    useEffect(() => {
        if (!signupReady) return;
        const current = generation.current;
        let mounted = true;
        Promise.all([api.startSignup(), prepareWhatsAppSdk({ appId: signupAppId, version: signupVersion })]).then(([config]) => {
            if (mounted && current === generation.current) setSignup({ ...config, preparedAt: Date.now() });
        }).catch(() => { /* A retry button prepares a new session without losing settings. */ });
        return () => { mounted = false; };
    }, [signupReady, signupAppId, signupVersion]);
    async function action(fn) {
        const current = generation.current;
        setBusy(true); setError(''); setNotice('');
        try { await fn(); if (current !== generation.current) return; await load(current); if (current === generation.current) setNotice(tr('saved')); }
        catch (e) { if (current === generation.current) setError(e.message); }
        finally { if (current === generation.current) setBusy(false); }
    }
    async function prepareAgain() {
        const current = generation.current; setBusy(true); setError('');
        try {
            const [config] = await Promise.all([api.startSignup(), prepareWhatsAppSdk(data.signup)]);
            if (current === generation.current) { setSignup({ ...config, preparedAt: Date.now() }); setNotice(tr('readyToConnect')); }
        } catch { if (current === generation.current) setError(tr('connectionFailed')); }
        finally { if (current === generation.current) setBusy(false); }
    }
    function connect() {
        if (!signup || Date.now() - signup.preparedAt > 9 * 60000) { void prepareAgain(); return; }
        setBusy(true); setError('');
        const current = generation.current;
        cancelSignup.current = launchWhatsAppSignup(signup, {
            onComplete: payload => { if (current === generation.current) { setSignup(null); void action(() => api.completeSignup(undefined, payload)); } },
            onError: () => { if (current === generation.current) { setSignup(null); setBusy(false); setError(tr('connectionCancelled')); } },
        });
    }
    const button = (label, onClick, disabled = false, primary = false) => {
        const Button = primary ? PrimaryButton : SecondaryButton;
        return <Button type="button" disabled={busy || disabled} onPress={onClick}>{tr(label)}</Button>;
    };
    const formatSyncDate = value => value ? new Date(value).toLocaleString(locale, { timeZone: 'Asia/Jerusalem' }) : tr('notScheduled');
    const price = data?.signup.pricing;
    const money = value => new Intl.NumberFormat(locale, { style: 'currency', currency: price?.currency || 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
    const connected = data?.whatsapp?.connected === true;
    const businessAppConnection = data?.whatsapp?.settings?.connectionType === 'business_app';
    return <section className={`office-integrations ${embedded ? 'oi-embedded' : ''}`} dir={direction}>
        <header className="oi-header"><TextBold18 role="heading" aria-level={embedded ? 2 : 1}>{tr('title')}</TextBold18><Text14 className="oi-muted">{tr('intro')}</Text14></header>
        {error && <StatusNotice embedded>{error}</StatusNotice>}{notice && <p role="status" className="oi-notice">{notice}</p>}
        {!data ? <p role="status">{error ? tr('loadFailed') : tr('loading')}</p> : <>
            <div className="oi-grid">
                <SimpleCard className="lw-platformSettings__card oi-card oi-whatsapp" role="region" aria-labelledby="oi-whatsapp-title"><div className="oi-card-heading"><TextBold18 id="oi-whatsapp-title" role="heading" aria-level={embedded ? 3 : 2}>WhatsApp Business</TextBold18><span className="oi-badge">{tr('official')}</span></div>
                    <p>{tr(data.signup.flow === 'business_app' ? 'qrHelp' : 'whatsappHelp')}</p>
                    {data.signup.flow === 'business_app' && <p className="oi-muted">{tr('qrPrerequisite')}</p>}
                    <div className="oi-connection-status"><span className={`oi-status-dot ${data.whatsapp?.connected ? 'is-connected' : ''}`} aria-hidden="true" /><span>{tr('status')}: <strong>{t(`officeIntegrations.statuses.${data.whatsapp?.status || 'disconnected'}`)}</strong></span>{data.whatsapp?.displayPhone && <bdi>{data.whatsapp.displayPhone}</bdi>}</div>
                    {price && <section className="oi-pricing" aria-label={tr('pricingTitle')}>
                        <div className="oi-card-heading"><div><h3>{tr('pricingTitle')}</h3><p className="oi-muted">{tr('pricingPreview')}</p></div><p className="oi-price"><bdi>{money(price.monthlyAmount)}</bdi><span>{tr('pricingPerMonth')}</span></p></div>
                        <p className="oi-muted">{tr('pricingTaxExempt')}</p>
                        <dl><div><dt>{tr('pricingSetup')}</dt><dd><bdi>{money(price.setupAmount)}</bdi></dd></div>
                            <div><dt>{tr('pricingMeta')}</dt><dd>{tr('pricingSeparate')}</dd></div></dl>
                        <details className="oi-details"><summary>{tr('pricingDetails')}</summary><p>{tr('pricingIncludes')}</p><p className="oi-muted">{tr('pricingMetaHelp')} <a href="https://whatsappbusiness.com/products/platform-pricing/" target="_blank" rel="noreferrer">{tr('pricingMetaLink')}</a></p></details>
                        <p className="oi-pricing-notice">{tr('pricingNoCharge')}</p>
                    </section>}
                    {!data.signup.ready && <div className="oi-note"><strong>{tr(data.signup.approvalPending ? 'metaApprovalTitle' : 'connectionHelp')}</strong><p>{tr(data.signup.approvalPending ? 'metaApprovalPending' : data.signup.demoOnly ? 'demoConnectionNotice' : 'platformSetup')}</p></div>}
                    <div className="oi-actions">{data.signup.approvalPending ? button('connectQr', connect, true, true) : data.signup.ready ? button(data.signup.flow === 'business_app' ? 'connectQr' : 'connect', connect, false, true)
                        : <PrimaryButton type="button" disabled={busy} aria-expanded={setupOpen} onPress={() => setSetupOpen(!setupOpen)}>{tr(data.signup.demoOnly ? 'demoConnection' : 'connectionHelp')}</PrimaryButton>}
                        {data.whatsapp?.connected && <>{button(data.signup.connectionOnly || data.whatsapp.settings?.connectionType === 'business_app' ? 'checkAccountConnection' : 'checkConnection', () => action(() => api.checkWhatsapp()), data.signup.demoOnly)}
                        {button('disconnect', () => action(() => api.disconnect()))}</>}</div>
                    {data.signup.connectionOnly && <p className="oi-muted oi-safe-note">{tr('connectionOnlyNotice')}</p>}
                    {data.signup.connectionOnly && <nav className="oi-policy-links" aria-label={tr('privacyLinks')}><a href="/integrations/privacy.html" target="_blank" rel="noreferrer">{tr('privacyPolicy')}</a><a href="/integrations/data-deletion.html" target="_blank" rel="noreferrer">{tr('dataDeletion')}</a></nav>}
                    {data.signup.ready && data.signup.flow === 'business_app' && <ol className="oi-steps"><li>{tr('qrStepOpen')}</li><li>{tr('qrStepScan')}</li><li>{tr('qrStepFinish')}</li></ol>}
                    {data.whatsapp?.connected && data.whatsapp.settings?.connectionType === 'business_app' && <p className="oi-muted">{tr(`appSync.${data.whatsapp.settings.appSync || 'pending'}`)}</p>}
                    {data.whatsapp?.connected && data.whatsapp.settings?.connectionType === 'business_app' && <p className="oi-muted">{tr('qrDisconnectHelp')}</p>}
                    {setupOpen && <section className="oi-setup" aria-label={tr('connectionHelp')}>
                        <h3>{tr('connectionHelp')}</h3>
                        {data.signup.demoOnly && <p>{tr('demoWalkthrough')}</p>}
                        <ol className="oi-steps"><li>{tr('ownerStepLogin')}</li><li>{tr('ownerStepNumber')}</li><li>{tr('ownerStepConfirm')}</li></ol>
                        <p className="oi-muted">{tr('connectionReassurance')}</p>
                    </section>}
                    <details className="oi-details"><summary>{tr('groupRequirements')}</summary><p>{tr('eligibility')}</p></details>
                    {data.whatsapp?.connected && <p className="oi-muted">{tr('paymentHelp')} <a href="https://business.facebook.com/wa/manage/home/" target="_blank" rel="noreferrer">{tr('manageMeta')}</a></p>}
                    <WhatsappSafety whatsapp={data.whatsapp} canManage={data.canConfigurePolicy} busy={busy}
                        onPause={() => action(() => api.pauseWhatsappSafety())}
                        onCheck={() => action(() => api.checkWhatsapp())}
                        onResume={acknowledgement => action(() => api.resumeWhatsappSafety(undefined, acknowledgement))} />
                    {!data.canConfigurePolicy && <p>{tr('adminPolicy')}</p>}
                    {data.canConfigurePolicy && !connected && <p className="oi-muted">{tr('connectBeforeAutomation')}</p>}
                    {data.canConfigurePolicy && connected && <details className="oi-details oi-automation"><summary>{tr('automation')}</summary>
                        {businessAppConnection ? <p role="status" className="oi-muted">{tr('qrGroupsUnavailable')}</p> : <fieldset disabled={busy} aria-label={tr('automation')}>
                        <p className="oi-muted">{tr('automationHelp')}</p>
                        {whatsapp.mode === 'demo' && <p className="oi-muted">{tr('demoMode')}</p>}
                        <div className="oi-setting-row"><SimpleCheckbox variant="toggle" title={tr('autoCreate')} checked={whatsapp.enabled} onChange={e => setWhatsapp({ ...whatsapp, enabled: e.target.checked })} disabled={busy || (whatsapp.mode === 'live' && (!data.signup.liveEnabled || data.whatsapp?.status !== 'ready'))} /></div>
                        <SimpleTextArea className="oi-recipients" title={tr('recipientsTitle')} aria-label={tr('recipients')} rows={3} value={whatsapp.recipients} disabled={busy} onChange={value => setWhatsapp({ ...whatsapp, recipients: value })} placeholder="+972501234567" />
                        <p className="oi-muted">{tr('recipients')}. {tr(whatsapp.includeCaseManager ? 'recipientManagerHelp' : 'recipientHelp')}</p>
                        <div className="oi-setting-row"><SimpleCheckbox title={tr('includeCaseManager')} checked={whatsapp.includeCaseManager} disabled={busy} onChange={e => setWhatsapp({ ...whatsapp, includeCaseManager: e.target.checked })} /></div>
                        <p className="oi-muted">{tr('caseManagerHelp')}{whatsapp.mode === 'demo' && ` ${tr('demoManagerHelp')}`}</p>
                        {whatsapp.mode === 'live' && data.whatsapp?.connected && <details className="oi-details"><summary>{tr('advancedInvitations')}</summary>
                            <SimpleInput title={tr('template')} aria-label={tr('template')} dir="ltr" value={whatsapp.templateName} timeToWaitInMilli={0} disabled={busy} onChange={e => setWhatsapp({ ...whatsapp, templateName: e.target.value, enabled: false })} />
                            <SimpleInput title={tr('templateLanguage')} aria-label={tr('templateLanguage')} dir="ltr" value={whatsapp.templateLanguage} timeToWaitInMilli={0} disabled={busy} onChange={e => setWhatsapp({ ...whatsapp, templateLanguage: e.target.value, enabled: false })} />
                            <SimpleTextArea title={tr('templateParameters')} aria-label={tr('templateParameters')} rows={2} value={whatsapp.templateParameters} disabled={busy} onChange={value => setWhatsapp({ ...whatsapp, templateParameters: value, enabled: false })} />
                            <p className="oi-muted">{tr('templateHelp')} <a href="https://business.facebook.com/wa/manage/template-library" target="_blank" rel="noreferrer">{tr('templateLibrary')}</a></p>
                            {!data.signup.liveEnabled && <p className="oi-note">{tr('liveNotEnabled')}</p>}
                        </details>}
                        <div className="oi-actions">{button('saveWhatsapp', () => action(() => api.saveWhatsapp(undefined, { ...whatsapp, recipients: whatsapp.recipients.split(/[\n,;]/).map(s => s.trim()).filter(Boolean), templateParameters: whatsapp.templateParameters.split('\n').filter(Boolean) })), false, true)}</div>
                        <p className="oi-muted">{tr('disableHelp')}</p>
                    </fieldset>}</details>}
                </SimpleCard>
                <SimpleCard className="lw-platformSettings__card oi-card oi-court" role="region" aria-labelledby="oi-court-title"><div className="oi-card-heading"><TextBold18 id="oi-court-title" role="heading" aria-level={embedded ? 3 : 2}>{tr('courtTitle')}</TextBold18><span className="oi-badge">{tr('demo')}</span></div>
                    <p>{tr('courtHelp')}</p>
                    <div className="oi-note"><strong>{tr('courtLiveNotConnected')}</strong><p>{tr('courtAuthorizationHelp')}</p></div>
                    <fieldset disabled={busy || !data.canConfigurePolicy} className="oi-connection-fields">
                        <SimpleInput title={tr('connectionName')} aria-label={tr('connectionName')} value={court.label} maxLength={120} timeToWaitInMilli={0} disabled={busy || !data.canConfigurePolicy} onChange={e => setCourt({ ...court, label: e.target.value })} />
                        <div className="oi-setting-row"><SimpleCheckbox variant="toggle" title={tr('enableCourt')} checked={court.enabled} disabled={busy || !data.canConfigurePolicy} onChange={e => setCourt({ ...court, enabled: e.target.checked })} /></div>
                        <div className="oi-setting-row"><SimpleCheckbox variant="toggle" title={tr('dailySync')} checked={court.dailySyncEnabled} disabled={busy || !data.canConfigurePolicy} onChange={e => setCourt({ ...court, dailySyncEnabled: e.target.checked })} /></div>
                        <SimpleInput title={tr('syncTime')} aria-label={tr('syncTime')} type="time" dir="ltr" value={court.syncTime} required timeToWaitInMilli={0} disabled={busy || !data.canConfigurePolicy || !court.dailySyncEnabled} onChange={e => setCourt({ ...court, syncTime: e.target.value })} />
                        <p className="oi-muted">{tr('syncTimeHelp')}</p>
                        {data.canConfigurePolicy && <div className="oi-actions">{button('saveCourt', () => action(() => api.saveCourt(undefined, court)), !/^([01]\d|2[0-3]):[0-5]\d$/.test(court.syncTime), true)}</div>}
                    </fieldset>
                    {!data.canConfigurePolicy && <p className="oi-muted">{tr('courtAdminPolicy')}</p>}
                    <dl className="oi-sync"><div><dt>{tr('lastSync')}</dt><dd>{data.court?.lastSyncedAt ? formatSyncDate(data.court.lastSyncedAt) : tr('never')}</dd></div><div><dt>{tr('nextSync')}</dt><dd>{formatSyncDate(data.court?.nextSyncAt)}</dd></div></dl>
                    {data.court?.enabled && data.court?.settings?.dailySyncEnabled && !data.courtSchedulerRunning && <p className="oi-note">{tr('schedulerUnavailable')}</p>}
                </SimpleCard>
            </div>
        </>}
    </section>;
}
