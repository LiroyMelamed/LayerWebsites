import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { officeIntegrationsApi as api } from '../../api/officeIntegrationsApi';
import { prepareWhatsAppSdk, launchWhatsAppSignup } from '../../services/whatsappEmbeddedSignup';
import './OfficeIntegrations.scss';

export default function OfficeIntegrations({ embedded = false }) {
    const { t } = useTranslation();
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
    const button = (label, onClick, disabled = false, primary = false) => <button type="button" className={primary ? 'oi-primary' : ''} disabled={busy || disabled} onClick={onClick}>{tr(label)}</button>;
    const formatSyncDate = value => value ? new Date(value).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : tr('notScheduled');
    return <section className={`office-integrations ${embedded ? 'oi-embedded' : ''}`} dir="rtl">
        <header><h1>{tr('title')}</h1><p>{tr('intro')}</p></header>
        {error && <p role="alert" className="oi-error">{error}</p>}{notice && <p role="status" className="oi-notice">{notice}</p>}
        {!data ? <p role="status">{error ? tr('loadFailed') : tr('loading')}</p> : <>
            <div className="oi-grid">
                <section className="oi-card"><div className="oi-card-heading"><h2>{tr('courtTitle')}</h2><span className="oi-badge">{tr('demo')}</span></div>
                    <p>{tr('courtHelp')}</p>
                    <fieldset disabled={busy || !data.canConfigurePolicy} className="oi-connection-fields">
                        <label>{tr('connectionName')}<input value={court.label} maxLength={120} onChange={e => setCourt({ ...court, label: e.target.value })} /></label>
                        <label className="oi-toggle"><input type="checkbox" checked={court.enabled} onChange={e => setCourt({ ...court, enabled: e.target.checked })} />{tr('enableCourt')}</label>
                        <label className="oi-toggle"><input type="checkbox" checked={court.dailySyncEnabled} onChange={e => setCourt({ ...court, dailySyncEnabled: e.target.checked })} />{tr('dailySync')}</label>
                        <label>{tr('syncTime')}<input type="time" dir="ltr" value={court.syncTime} required disabled={!court.dailySyncEnabled} onChange={e => setCourt({ ...court, syncTime: e.target.value })} /></label>
                        <p className="oi-muted">{tr('syncTimeHelp')}</p>
                        {data.canConfigurePolicy && <div className="oi-actions">{button('saveCourt', () => action(() => api.saveCourt(undefined, court)), !/^([01]\d|2[0-3]):[0-5]\d$/.test(court.syncTime), true)}</div>}
                    </fieldset>
                    {!data.canConfigurePolicy && <p className="oi-muted">{tr('courtAdminPolicy')}</p>}
                    <p className="oi-muted">{tr('lastSync')}: {data.court?.lastSyncedAt ? formatSyncDate(data.court.lastSyncedAt) : tr('never')}</p>
                    <p className="oi-muted">{tr('nextSync')}: {formatSyncDate(data.court?.nextSyncAt)}</p>
                    {data.court?.enabled && data.court?.settings?.dailySyncEnabled && !data.courtSchedulerRunning && <p className="oi-note">{tr('schedulerUnavailable')}</p>}
                </section>
                <section className="oi-card"><div className="oi-card-heading"><h2>WhatsApp Business</h2><span className="oi-badge">{tr('official')}</span></div>
                    <p>{tr(data.signup.flow === 'business_app' ? 'qrHelp' : 'whatsappHelp')}</p>
                    {data.signup.flow === 'business_app' && <p className="oi-muted">{tr('qrPrerequisite')}</p>}
                    <p><strong>{tr('status')}: {t(`officeIntegrations.statuses.${data.whatsapp?.status || 'disconnected'}`)}</strong>{data.whatsapp?.displayPhone && <bdi className="oi-phone">{data.whatsapp.displayPhone}</bdi>}</p>
                    {!data.signup.ready && <p className="oi-note">{tr(data.signup.demoOnly ? 'demoConnectionNotice' : 'platformSetup')}</p>}
                    {data.signup.connectionOnly && <p className="oi-note">{tr('connectionOnlyNotice')}</p>}
                    <div className="oi-actions">{data.signup.ready ? button(data.signup.flow === 'business_app' ? 'connectQr' : 'connect', connect, false, true)
                        : <button type="button" className="oi-primary" disabled={busy} aria-expanded={setupOpen} onClick={() => setSetupOpen(!setupOpen)}>{tr(data.signup.demoOnly ? 'demoConnection' : 'connectionHelp')}</button>}
                        {data.whatsapp?.connected && <>{button(data.signup.connectionOnly || data.whatsapp.settings?.connectionType === 'business_app' ? 'checkAccountConnection' : 'checkConnection', () => action(() => api.checkWhatsapp()), data.signup.demoOnly)}
                        {button('disconnect', () => action(() => api.disconnect()))}</>}</div>
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
                    {!data.canConfigurePolicy && <p>{tr('adminPolicy')}</p>}
                    {data.canConfigurePolicy && <fieldset disabled={busy}>
                        <legend>{tr('automation')}</legend>
                        {whatsapp.mode === 'demo' && <p className="oi-muted">{tr('demoMode')}</p>}
                        <label className="oi-toggle"><input type="checkbox" checked={whatsapp.enabled} onChange={e => setWhatsapp({ ...whatsapp, enabled: e.target.checked })} disabled={whatsapp.mode === 'live' && (!data.signup.liveEnabled || data.whatsapp?.status !== 'ready')} />{tr('autoCreate')}</label>
                        <label>{tr('recipients')}<textarea dir="ltr" rows={4} value={whatsapp.recipients} onChange={e => setWhatsapp({ ...whatsapp, recipients: e.target.value })} placeholder="+972501234567" /></label>
                        <p className="oi-muted">{tr(whatsapp.includeCaseManager ? 'recipientManagerHelp' : 'recipientHelp')}</p>
                        <label className="oi-toggle"><input type="checkbox" checked={whatsapp.includeCaseManager} onChange={e => setWhatsapp({ ...whatsapp, includeCaseManager: e.target.checked })} />{tr('includeCaseManager')}</label>
                        <p className="oi-muted">{tr('caseManagerHelp')}{whatsapp.mode === 'demo' && ` ${tr('demoManagerHelp')}`}</p>
                        {whatsapp.mode === 'live' && data.whatsapp?.connected && <details className="oi-details"><summary>{tr('advancedInvitations')}</summary>
                            <label>{tr('template')}<input dir="ltr" value={whatsapp.templateName} onChange={e => setWhatsapp({ ...whatsapp, templateName: e.target.value, enabled: false })} /></label>
                            <label>{tr('templateLanguage')}<input dir="ltr" value={whatsapp.templateLanguage} onChange={e => setWhatsapp({ ...whatsapp, templateLanguage: e.target.value, enabled: false })} /></label>
                            <label>{tr('templateParameters')}<textarea rows={2} value={whatsapp.templateParameters} onChange={e => setWhatsapp({ ...whatsapp, templateParameters: e.target.value, enabled: false })} /></label>
                            <p className="oi-muted">{tr('templateHelp')} <a href="https://business.facebook.com/wa/manage/template-library" target="_blank" rel="noreferrer">{tr('templateLibrary')}</a></p>
                            {!data.signup.liveEnabled && <p className="oi-note">{tr('liveNotEnabled')}</p>}
                        </details>}
                        <div className="oi-actions">{button('saveWhatsapp', () => action(() => api.saveWhatsapp(undefined, { ...whatsapp, recipients: whatsapp.recipients.split(/[\n,;]/).map(s => s.trim()).filter(Boolean), templateParameters: whatsapp.templateParameters.split('\n').filter(Boolean) })), false, true)}</div>
                        <p className="oi-muted">{tr('disableHelp')}</p>
                    </fieldset>}
                </section>
            </div>
        </>}
    </section>;
}
