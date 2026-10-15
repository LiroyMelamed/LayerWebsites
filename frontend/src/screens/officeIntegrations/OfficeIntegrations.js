import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { officeIntegrationsApi as api } from '../../api/officeIntegrationsApi';
import { prepareWhatsAppSdk, launchWhatsAppSignup } from '../../services/whatsappEmbeddedSignup';
import './OfficeIntegrations.scss';

export default function OfficeIntegrations({ embedded = false }) {
    const { t } = useTranslation();
    const tr = key => t(`officeIntegrations.${key}`);
    const [offices, setOffices] = useState([]), [officeId, setOfficeId] = useState('');
    const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [court, setCourt] = useState({ enabled: false, label: '' });
    const [whatsapp, setWhatsapp] = useState({ enabled: false, mode: 'demo', recipients: '', includeCaseManager: false, templateName: '', templateLanguage: 'he', templateParameters: '' });
    const [caseId, setCaseId] = useState(''), [number, setNumber] = useState('90003-10-26');
    const [signup, setSignup] = useState(null);
    const [officesLoaded, setOfficesLoaded] = useState(false);
    const signupReady = data?.signup.ready, signupAppId = data?.signup.appId, signupVersion = data?.signup.version;
    const generation = useRef(0), cancelSignup = useRef(null);
    const load = useCallback(async (id, expected) => {
        const value = await api.snapshot(id);
        if (generation.current !== expected) return;
        setData(value);
        setCourt({ enabled: value.court?.enabled || false, label: value.court?.settings?.label || '' });
        const settings = value.whatsapp?.settings || {};
        setWhatsapp({ enabled: value.whatsapp?.enabled || false, mode: settings.mode || 'demo', recipients: (settings.recipients || []).join('\n'), includeCaseManager: settings.includeCaseManager === true, templateName: settings.templateName || '', templateLanguage: settings.templateLanguage || 'he', templateParameters: (settings.templateParameters || []).join('\n') });
        setCaseId(prev => value.demoCases.some(c => String(c.caseid) === prev) ? prev : String(value.demoCases[0]?.caseid || ''));
    }, []);
    useEffect(() => {
        let mounted = true;
        api.offices().then(result => { if (mounted) { setOffices(result.offices); setOfficeId(result.offices[0]?.id || ''); } }).catch(e => { if (mounted) setError(e.message); }).finally(() => { if (mounted) setOfficesLoaded(true); });
        return () => { mounted = false; generation.current += 1; cancelSignup.current?.(); };
    }, []);
    useEffect(() => {
        const current = ++generation.current;
        cancelSignup.current?.(); setSignup(null); setData(null); setError(''); setNotice(''); setBusy(false);
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
    return <section className={`office-integrations ${embedded ? 'oi-embedded' : ''}`} dir="rtl">
        <header><h1>{tr('title')}</h1><p>{tr('intro')}</p></header>
        <label className="oi-office">{tr('office')}<select aria-label={tr('office')} value={officeId} onChange={e => setOfficeId(e.target.value)} disabled={busy}>
            <option value="" disabled>{tr('selectOffice')}</option>{offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select></label>
        {error && <p role="alert" className="oi-error">{error}</p>}{notice && <p role="status" className="oi-notice">{notice}</p>}
        {!data ? <p role="status">{error ? tr('loadFailed') : !officesLoaded || offices.length ? tr('loading') : tr('noOffice')}</p> : <>
            <div className="oi-grid">
                <section className="oi-card"><div className="oi-card-heading"><h2>{tr('courtTitle')}</h2><span className="oi-badge">{tr('demo')}</span></div>
                    <p>{tr('courtHelp')}</p>
                    <label>{tr('connectionName')}<input value={court.label} maxLength={120} onChange={e => setCourt({ ...court, label: e.target.value })} /></label>
                    <label className="oi-toggle"><input type="checkbox" checked={court.enabled} onChange={e => setCourt({ ...court, enabled: e.target.checked })} />{tr('enableCourt')}</label>
                    <div className="oi-actions">{button('saveCourt', () => action(() => api.saveCourt(officeId, court)), false, true)}
                        {button('seedDemo', () => action(() => api.seedDemo(officeId)), !data.court?.enabled)}
                        {button('syncDemo', () => action(() => api.syncCourt(officeId)), !data.court?.enabled)}</div>
                    <p className="oi-muted">{tr('lastSync')}: {data.court?.lastSyncedAt ? new Date(data.court.lastSyncedAt).toLocaleString('he-IL') : tr('never')}</p>
                    <h3>{tr('mapping')}</h3>
                    <label>{tr('demoCase')}<select value={caseId} onChange={e => setCaseId(e.target.value)}><option value="">{tr('selectCase')}</option>{data.demoCases.map(c => <option key={c.caseid} value={c.caseid}>{c.casename} (#{c.caseid})</option>)}</select></label>
                    <label>{tr('courtNumber')}<input dir="ltr" value={number} maxLength={13} onChange={e => setNumber(e.target.value)} /></label>
                    {button('saveMapping', () => action(() => api.linkCourt(officeId, { caseId: Number(caseId), courtNumber: number })), !caseId || !data.court?.enabled)}
                    <ul className="oi-mappings">{data.links.map(l => <li key={l.id}><bdi>{l.court_number}</bdi> — {l.casename}</li>)}</ul>
                </section>
                <section className="oi-card"><div className="oi-card-heading"><h2>WhatsApp Business</h2><span className="oi-badge">{tr('official')}</span></div>
                    <p>{tr('whatsappHelp')}</p>
                    <ol className="oi-steps"><li>{tr('stepConnect')}</li><li>{tr('stepEligibility')}</li><li>{tr('stepInvites')}</li></ol>
                    <p><strong>{tr('status')}: {t(`officeIntegrations.statuses.${data.whatsapp?.status || 'disconnected'}`)}</strong>{data.whatsapp?.displayPhone && <bdi className="oi-phone">{data.whatsapp.displayPhone}</bdi>}</p>
                    {!data.signup.ready && <p className="oi-note">{tr('platformSetup')}</p>}
                    <div className="oi-actions">{button(signup ? 'connect' : 'prepareConnection', connect, !data.signup.ready, true)}
                        {button('checkConnection', () => action(() => api.checkWhatsapp(officeId)), !data.whatsapp?.connected)}
                        {button('disconnect', () => action(() => api.disconnect(officeId)), !data.whatsapp?.connected)}</div>
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
                        <div className="oi-actions">{button('saveWhatsapp', () => action(() => api.saveWhatsapp(officeId, { ...whatsapp, recipients: whatsapp.recipients.split(/[\n,;]/).map(s => s.trim()).filter(Boolean), templateParameters: whatsapp.templateParameters.split('\n').filter(Boolean) })), false, true)}
                        {button('testGroup', () => action(() => api.previewGroup(officeId, caseId)), !caseId || !data.whatsapp?.enabled || data.whatsapp?.settings.mode !== 'demo')}</div>
                    </fieldset>}
                </section>
            </div>
            <section className="oi-card"><h2>{tr('courtUpdates')}</h2><p>{tr('updatesHelp')}</p>
                {!data.updates.length ? <p>{tr('noUpdates')}</p> : <div className="oi-table"><table><thead><tr><th>{tr('update')}</th><th>{tr('courtNumber')}</th><th>{tr('mapping')}</th></tr></thead><tbody>{data.updates.map(e => <tr key={e.id}><td><span className="oi-badge">{tr('demo')}</span> {e.title}<p>{e.body}</p></td><td><bdi>{e.court_number}</bdi></td><td>{e.case_id ? `${tr('case')} #${e.case_id}` : tr('pendingMapping')}</td></tr>)}</tbody></table></div>}
            </section>
            <section className="oi-card"><div className="oi-card-heading"><h2>{tr('groupActivity')}</h2>{button('refresh', () => action(async () => {}))}</div>
                {!data.groups.length ? <p>{tr('noGroups')}</p> : <div className="oi-table"><table><thead><tr><th>{tr('case')}</th><th>{tr('mode')}</th><th>{tr('status')}</th><th>{tr('invitations')}</th></tr></thead><tbody>{data.groups.map(g => <tr key={g.id}><td>#{g.case_id}</td><td>{tr(g.mode === 'demo' ? 'demo' : 'liveMode')}</td><td>{t(`officeIntegrations.statuses.${g.status}`)}{g.invite_link && <p><a href={g.invite_link} target="_blank" rel="noreferrer">{tr('groupLink')}</a></p>}</td><td>{g.recipients.map(r => <div key={r.phone}><bdi>{r.phone}</bdi> — {t(`officeIntegrations.statuses.${r.status}`)}</div>)}</td></tr>)}</tbody></table></div>}
                {data.groups.filter(g => ['MANAGER_PHONE_MISSING', 'MANAGER_PHONE_INVALID', 'GROUP_CAPACITY'].includes(g.error_code)).map(g => <p className="oi-note" key={g.id}>{tr('case')} #{g.case_id}: {tr(g.error_code === 'GROUP_CAPACITY' ? 'capacityIssue' : 'managerPhoneIssue')}</p>)}
                <p className="oi-muted">{tr('disableHelp')}</p>
            </section>
        </>}
    </section>;
}
