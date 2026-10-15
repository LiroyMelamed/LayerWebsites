import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { officeIntegrationsApi as api } from '../../api/officeIntegrationsApi';
import { prepareWhatsAppSdk, launchWhatsAppSignup } from '../../services/whatsappEmbeddedSignup';
import './OfficeIntegrations.scss';

export default function OfficeIntegrations({ embedded = false }) {
    const { t } = useTranslation();
    const tr = key => t(`officeIntegrations.${key}`);
    const [offices, setOffices] = useState([]), [officeId, setOfficeId] = useState('');
    const [context, setContext] = useState(null);
    const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [court, setCourt] = useState({ enabled: false, label: '', dailySyncEnabled: true, syncTime: '08:00' });
    const [whatsapp, setWhatsapp] = useState({ enabled: false, mode: 'demo', recipients: '', includeCaseManager: false, templateName: '', templateLanguage: 'he', templateParameters: '' });
    const [setupOpen, setSetupOpen] = useState(false);
    const [signup, setSignup] = useState(null);
    const [officesLoaded, setOfficesLoaded] = useState(false);
    const signupReady = data?.signup.ready, signupAppId = data?.signup.appId, signupVersion = data?.signup.version;
    const generation = useRef(0), cancelSignup = useRef(null);
    const load = useCallback(async (id, expected) => {
        const value = await api.snapshot(id);
        if (generation.current !== expected) return;
        setData(value);
        setCourt({ enabled: value.court?.enabled || false, label: value.court?.settings?.label || '',
            dailySyncEnabled: value.court?.settings?.dailySyncEnabled ?? true, syncTime: value.court?.settings?.syncTime || '08:00' });
        const settings = value.whatsapp?.settings || {};
        setWhatsapp({ enabled: value.whatsapp?.enabled || false, mode: settings.mode || 'demo', recipients: (settings.recipients || []).join('\n'), includeCaseManager: settings.includeCaseManager === true, templateName: settings.templateName || '', templateLanguage: settings.templateLanguage || 'he', templateParameters: (settings.templateParameters || []).join('\n') });
    }, []);
    useEffect(() => {
        let mounted = true;
        api.offices().then(result => { if (mounted) { setContext(result.context || null); setOffices(result.offices); setOfficeId(result.offices[0]?.id || ''); } }).catch(e => { if (mounted) setError(e.message); }).finally(() => { if (mounted) setOfficesLoaded(true); });
        return () => { mounted = false; generation.current += 1; cancelSignup.current?.(); };
    }, []);
    useEffect(() => {
        const current = ++generation.current;
        cancelSignup.current?.(); setSignup(null); setData(null); setError(''); setNotice(''); setBusy(false); setSetupOpen(false);
        if (officeId) load(officeId, current).catch(e => { if (current === generation.current) setError(e.message); });
    }, [officeId, load]);
    // Preload the nonce + SDK so the customer opens Meta directly on their click.
    useEffect(() => {
        if (!signupReady || !officeId) return;
        const current = generation.current;
        let mounted = true;
        Promise.all([api.startSignup(officeId), prepareWhatsAppSdk({ appId: signupAppId, version: signupVersion })]).then(([config]) => {
            if (mounted && current === generation.current) setSignup({ ...config, preparedAt: Date.now() });
        }).catch(() => { /* A retry button prepares a new session without losing settings. */ });
        return () => { mounted = false; };
    }, [signupReady, signupAppId, signupVersion, officeId]);
    async function action(fn) {
        const current = generation.current;
        setBusy(true); setError(''); setNotice('');
        try { await fn(); if (current !== generation.current) return; await load(officeId, current); setNotice(tr('saved')); }
        catch (e) { if (current === generation.current) setError(e.message); }
        finally { if (current === generation.current) setBusy(false); }
    }
    async function prepareAgain() {
        const current = generation.current; setBusy(true); setError('');
        try {
            const [config] = await Promise.all([api.startSignup(officeId), prepareWhatsAppSdk(data.signup)]);
            if (current === generation.current) { setSignup({ ...config, preparedAt: Date.now() }); setNotice(tr('readyToConnect')); }
        } catch { if (current === generation.current) setError(tr('connectionFailed')); }
        finally { if (current === generation.current) setBusy(false); }
    }
    function connect() {
        if (!signup || Date.now() - signup.preparedAt > 9 * 60000) { void prepareAgain(); return; }
        setBusy(true); setError('');
        const current = generation.current, selectedOffice = officeId;
        cancelSignup.current = launchWhatsAppSignup(signup, {
            onComplete: payload => { if (current === generation.current) { setSignup(null); void action(() => api.completeSignup(selectedOffice, payload)); } },
            onError: () => { if (current === generation.current) { setSignup(null); setBusy(false); setError(tr('connectionCancelled')); } },
        });
    }
    const button = (label, onClick, disabled = false, primary = false) => <button type="button" className={primary ? 'oi-primary' : ''} disabled={busy || disabled} onClick={onClick}>{tr(label)}</button>;
    const formatSyncDate = value => value ? new Date(value).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : tr('notScheduled');
    return <section className={`office-integrations ${embedded ? 'oi-embedded' : ''}`} dir="rtl">
        <header><h1>{tr('title')}</h1><p>{tr('intro')}</p></header>
        {context && <div className="oi-context" aria-label={tr('projectContext')}>
            <dl><div><dt>{tr('organization')}</dt><dd><bdi>{context.organization.name}</bdi></dd></div>
                <div><dt>{tr('project')}</dt><dd><bdi>{context.project.name}</bdi> · {tr('legalProduct')}</dd></div></dl>
            {context.demoOnly && <span className="oi-badge">{tr('testEnvironment')}</span>}
        </div>}
        <label className="oi-office">{tr('office')}<select aria-label={tr('office')} value={officeId} onChange={e => setOfficeId(e.target.value)} disabled={busy}>
            <option value="" disabled>{tr('selectOffice')}</option>{offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select></label>
        {error && <p role="alert" className="oi-error">{error}</p>}{notice && <p role="status" className="oi-notice">{notice}</p>}
        {!data ? <p role="status">{error ? tr('loadFailed') : !officesLoaded || offices.length ? tr('loading') : tr('noOffice')}</p> : <>
            <div className="oi-grid">
                <section className="oi-card"><div className="oi-card-heading"><h2>{tr('courtTitle')}</h2><span className="oi-badge">{tr('demo')}</span></div>
                    <p>{tr('courtHelp')}</p>
                    <fieldset disabled={busy || !data.canConfigurePolicy} className="oi-connection-fields">
                        <label>{tr('connectionName')}<input value={court.label} maxLength={120} onChange={e => setCourt({ ...court, label: e.target.value })} /></label>
                        <label className="oi-toggle"><input type="checkbox" checked={court.enabled} onChange={e => setCourt({ ...court, enabled: e.target.checked })} />{tr('enableCourt')}</label>
                        <label className="oi-toggle"><input type="checkbox" checked={court.dailySyncEnabled} onChange={e => setCourt({ ...court, dailySyncEnabled: e.target.checked })} />{tr('dailySync')}</label>
                        <label>{tr('syncTime')}<input type="time" dir="ltr" value={court.syncTime} required disabled={!court.dailySyncEnabled} onChange={e => setCourt({ ...court, syncTime: e.target.value })} /></label>
                        <p className="oi-muted">{tr('syncTimeHelp')}</p>
                        {data.canConfigurePolicy && <div className="oi-actions">{button('saveCourt', () => action(() => api.saveCourt(officeId, court)), !/^([01]\d|2[0-3]):[0-5]\d$/.test(court.syncTime), true)}</div>}
                    </fieldset>
                    {!data.canConfigurePolicy && <p className="oi-muted">{tr('courtAdminPolicy')}</p>}
                    <p className="oi-muted">{tr('lastSync')}: {data.court?.lastSyncedAt ? formatSyncDate(data.court.lastSyncedAt) : tr('never')}</p>
                    <p className="oi-muted">{tr('nextSync')}: {formatSyncDate(data.court?.nextSyncAt)}</p>
                    {data.court?.enabled && data.court?.settings?.dailySyncEnabled && !data.courtSchedulerRunning && <p className="oi-note">{tr('schedulerUnavailable')}</p>}
                </section>
                <section className="oi-card"><div className="oi-card-heading"><h2>WhatsApp Business</h2><span className="oi-badge">{tr('official')}</span></div>
                    <p>{tr('whatsappHelp')}</p>
                    <ol className="oi-steps"><li>{tr('stepConnect')}</li><li>{tr('stepEligibility')}</li><li>{tr('stepInvites')}</li></ol>
                    <p><strong>{tr('status')}: {t(`officeIntegrations.statuses.${data.whatsapp?.status || 'disconnected'}`)}</strong>{data.whatsapp?.displayPhone && <bdi className="oi-phone">{data.whatsapp.displayPhone}</bdi>}</p>
                    {!data.signup.ready && <p className="oi-note">{tr(data.signup.demoOnly ? 'demoConnectionNotice' : 'platformSetup')}</p>}
                    <div className="oi-actions">{data.signup.ready ? button(signup ? 'connect' : 'prepareConnection', connect, false, true)
                        : button('connectionSetup', () => setSetupOpen(!setupOpen), false, true)}
                        {data.whatsapp?.connected && <>{button('checkConnection', () => action(() => api.checkWhatsapp(officeId)), data.signup.demoOnly)}
                        {button('disconnect', () => action(() => api.disconnect(officeId)))}</>}</div>
                    {setupOpen && <section className="oi-setup" aria-label={tr('connectionSetup')}>
                        <h3>{tr('platformResponsibilityTitle')}</h3><p>{tr('platformResponsibility')}</p>
                        {data.canConfigurePolicy && <>
                            <ul className="oi-steps">{Object.entries(data.signup.requirements || {}).map(([key, configured]) => <li key={key}>{tr(`setupRequirements.${key}`)}: <strong>{tr(configured ? 'configured' : 'notConfigured')}</strong></li>)}</ul>
                            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">{tr('openMetaSetup')}</a>
                        </>}
                        <h3>{tr('officeResponsibilityTitle')}</h3><p>{tr('officeResponsibility')}</p>
                        {data.signup.demoOnly && <p className="oi-note">{tr('demoConnectionNotice')}</p>}
                        <div className="oi-actions">{button('refreshSetup', () => action(async () => {}))}</div>
                    </section>}
                    <p className="oi-note">{tr('eligibility')}</p>
                    {data.whatsapp?.connected && <p className="oi-muted">{tr('paymentHelp')} <a href="https://business.facebook.com/wa/manage/home/" target="_blank" rel="noreferrer">{tr('manageMeta')}</a></p>}
                    {!data.canConfigurePolicy && <p>{tr('adminPolicy')}</p>}
                    {data.canConfigurePolicy && <fieldset disabled={busy}>
                        <legend>{tr('automation')}</legend>
                        <label>{tr('mode')}<select value={whatsapp.mode} onChange={e => setWhatsapp({ ...whatsapp, mode: e.target.value, enabled: false })}><option value="demo">{tr('demoMode')}</option><option value="live">{tr('liveMode')}</option></select></label>
                        <label className="oi-toggle"><input type="checkbox" checked={whatsapp.enabled} onChange={e => setWhatsapp({ ...whatsapp, enabled: e.target.checked })} disabled={whatsapp.mode === 'live' && (!data.signup.liveEnabled || data.whatsapp?.status !== 'ready')} />{tr('autoCreate')}</label>
                        <label>{tr('recipients')}<textarea dir="ltr" rows={4} value={whatsapp.recipients} onChange={e => setWhatsapp({ ...whatsapp, recipients: e.target.value })} placeholder="+972501234567" /></label>
                        <p className="oi-muted">{tr(whatsapp.includeCaseManager ? 'recipientManagerHelp' : 'recipientHelp')}</p>
                        <label className="oi-toggle"><input type="checkbox" checked={whatsapp.includeCaseManager} onChange={e => setWhatsapp({ ...whatsapp, includeCaseManager: e.target.checked })} />{tr('includeCaseManager')}</label>
                        <p className="oi-muted">{tr('caseManagerHelp')}{whatsapp.mode === 'demo' && ` ${tr('demoManagerHelp')}`}</p>
                        {whatsapp.mode === 'live' && <>
                            <label>{tr('template')}<input dir="ltr" value={whatsapp.templateName} onChange={e => setWhatsapp({ ...whatsapp, templateName: e.target.value, enabled: false })} /></label>
                            <label>{tr('templateLanguage')}<input dir="ltr" value={whatsapp.templateLanguage} onChange={e => setWhatsapp({ ...whatsapp, templateLanguage: e.target.value, enabled: false })} /></label>
                            <label>{tr('templateParameters')}<textarea rows={2} value={whatsapp.templateParameters} onChange={e => setWhatsapp({ ...whatsapp, templateParameters: e.target.value, enabled: false })} /></label>
                            <p className="oi-muted">{tr('templateHelp')} <a href="https://business.facebook.com/wa/manage/template-library" target="_blank" rel="noreferrer">{tr('templateLibrary')}</a></p>
                            {!data.signup.liveEnabled && <p className="oi-note">{tr('liveNotEnabled')}</p>}
                        </>}
                        <div className="oi-actions">{button('saveWhatsapp', () => action(() => api.saveWhatsapp(officeId, { ...whatsapp, recipients: whatsapp.recipients.split(/[\n,;]/).map(s => s.trim()).filter(Boolean), templateParameters: whatsapp.templateParameters.split('\n').filter(Boolean) })), false, true)}</div>
                        <p className="oi-muted">{tr('disableHelp')}</p>
                    </fieldset>}
                </section>
            </div>
        </>}
    </section>;
}
