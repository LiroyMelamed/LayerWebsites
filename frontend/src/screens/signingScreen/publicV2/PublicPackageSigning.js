import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import signingPublicApi, { readGrantToken } from '../../../api/signingPublicApi';
import PdfViewer from '../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import { newKey } from '../templates/ParticipantActionDialog';
import SignaturePad from './SignaturePad';
import '../templates/signingPackages.scss';
import '../templates/signingCompose.scss';
import './publicPackageSigning.scss';

export const PublicPackageSigningName = '/ViewSignedDocument/Sign';

const LOCALES = { he: 'he-IL', ar: 'ar-IL', en: 'en-GB' };
const IMAGE_TYPES = new Set(['signature', 'initials']);
const INPUT_TYPES = new Set(['text', 'checkbox']);
const RELOAD_CODES = new Set(['MANIFEST_CHANGED', 'ALREADY_ACCEPTED', 'NOT_YOUR_TURN', 'TASK_UNAVAILABLE', 'CONSENT_CHANGED', 'REVISION_INACTIVE', 'DEADLINE_EXPIRED']);
const RESTART_CODES = new Set([...RELOAD_CODES, 'SESSION_EXPIRED', 'SESSION_CLOSED', 'FIELD_REQUIRED', 'INVALID_VALUES', 'INVALID_SIGNATURE', 'SIGNATURE_REQUIRED']);
const POLL_MS = 3000, POLL_LIMIT = 20, OTP_MINUTES = 10;

const inputId = (taskId, fieldId) => `sign-field-${taskId}-${fieldId}`;
const extra = (error, path) => error?.fieldErrors?.find(item => item.path === path)?.code;
// Arabic keypads type U+0660–0669 or U+06F0–06F9; the server only accepts 0–9.
export const latinDigits = value => String(value).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, digit => String(digit.charCodeAt(0) & 0xF));

function startLanguage() {
    const language = String(navigator.language || 'he').slice(0, 2);
    return LOCALES[language] ? language : 'he';
}

function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `${String(name || 'document').replace(/[\\/:*?"<>|]+/g, ' ').trim()}.pdf`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PublicPackageSigning() {
    const { i18n } = useTranslation();
    const [token] = useState(readGrantToken);
    const [view, setView] = useState(null);
    const [loadError, setLoadError] = useState(token ? null : { code: 'MISSING_TOKEN' });
    const language = view?.locale || startLanguage();
    const t = useMemo(() => i18n.getFixedT(language), [i18n, language]);
    const direction = i18n.dir(language);
    const formats = useMemo(() => ({
        number: new Intl.NumberFormat(LOCALES[language]),
        date: new Intl.DateTimeFormat(LOCALES[language], { dateStyle: 'medium', timeStyle: 'short' }),
        list: new Intl.ListFormat(LOCALES[language], { type: 'conjunction' }),
    }), [language]);
    const counted = (key, count, values = {}) => t(key, { count, formattedCount: formats.number.format(count), ...values });
    const message = (error, values = {}) => t(`signingV2.public.errors.${error?.code || 'REQUEST_FAILED'}`,
        { defaultValue: t('signingV2.public.errors.REQUEST_FAILED'), ...values });

    const [phase, setPhase] = useState('review');
    const [selected, setSelected] = useState(() => new Set());
    const [values, setValues] = useState({});
    const [consent, setConsent] = useState(false);
    const [signatureReady, setSignatureReady] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [notice, setNotice] = useState(null);
    const [busy, setBusy] = useState('');
    const [session, setSession] = useState(null);
    const [challenge, setChallenge] = useState(null);
    const [channel, setChannel] = useState('');
    const [code, setCode] = useState('');
    const [codeError, setCodeError] = useState(null);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [now, setNow] = useState(Date.now());
    const [signedCount, setSignedCount] = useState(0);
    const [polls, setPolls] = useState(0);
    const [openDocument, setOpenDocument] = useState(null);
    const [pdfs, setPdfs] = useState({});
    const pad = useRef(null), heading = useRef(null), summary = useRef(null), signature = useRef(null), acceptKey = useRef(null);
    const seeded = useRef(false);

    const load = useCallback(async () => {
        if (!token) return null;
        try {
            const next = await signingPublicApi.describe(token);
            setView(next); setLoadError(null);
            return next;
        } catch (error) {
            setLoadError(error?.status === 404 ? { code: 'NOT_FOUND' } : error);
            return null;
        }
    }, [token]);
    useEffect(() => { load(); }, [load]);
    // Opening another signer's link in this tab only changes the fragment, so start over with the new link.
    useEffect(() => {
        const replaced = () => { if (/^#[A-Za-z0-9_-]{43}$/.test(window.location.hash)) window.location.reload(); };
        window.addEventListener('hashchange', replaced);
        return () => window.removeEventListener('hashchange', replaced);
    }, []);
    useEffect(() => { document.title = t('signingV2.public.title'); }, [t]);

    const readyItems = useMemo(() => (view?.packages || []).flatMap(pkg => pkg.documents.flatMap(document => document.tasks
        .filter(task => task.state === 'ready').map(task => ({ pkg, document, task })))), [view]);
    useEffect(() => {
        // Everything starts selected once; later reloads keep the signer's own choice.
        const first = !seeded.current && readyItems.length > 0;
        if (first) seeded.current = true;
        const ids = readyItems.map(item => item.task.taskId);
        setSelected(previous => new Set(first ? ids : ids.filter(id => previous.has(id))));
    }, [readyItems]);
    const chosen = readyItems.filter(item => selected.has(item.task.taskId));
    const needsSignature = chosen.some(item => item.task.fields.some(field => IMAGE_TYPES.has(field.type)));

    useEffect(() => {
        if (cooldownUntil <= Date.now()) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [cooldownUntil]);
    const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

    useEffect(() => { heading.current?.focus(); }, [phase]);
    useEffect(() => { if (attempt) summary.current?.focus(); }, [attempt]);

    const settling = phase === 'done' && (view?.packages || []).some(pkg => pkg.state !== 'complete'
        && pkg.documents.every(document => document.tasks.every(task => task.state !== 'ready')));
    useEffect(() => {
        if (!settling || polls >= POLL_LIMIT) return undefined;
        const timer = setTimeout(async () => { await load(); setPolls(count => count + 1); }, POLL_MS);
        return () => clearTimeout(timer);
    }, [settling, polls, load]);

    const toggle = taskId => setSelected(previous => {
        const next = new Set(previous);
        if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
        return next;
    });
    const toggleAll = () => setSelected(chosen.length === readyItems.length ? new Set() : new Set(readyItems.map(item => item.task.taskId)));
    const setValue = (taskId, fieldId, value) => setValues(previous => ({ ...previous, [taskId]: { ...(previous[taskId] || {}), [fieldId]: value } }));

    async function preview(document) {
        if (openDocument === document.documentId) { setOpenDocument(null); return; }
        setOpenDocument(document.documentId);
        if (pdfs[document.documentId]?.blob && !document.final) return;
        setPdfs(previous => ({ ...previous, [document.documentId]: { loading: true } }));
        try {
            const blob = await signingPublicApi.document(token, document.documentId);
            setPdfs(previous => ({ ...previous, [document.documentId]: { blob } }));
        } catch (error) {
            setPdfs(previous => ({ ...previous, [document.documentId]: { error } }));
        }
    }
    async function download(kind, item, name) {
        setBusy(`${kind}-${item}`); setNotice(null);
        try { saveBlob(kind === 'evidence' ? await signingPublicApi.evidence(token, item) : await signingPublicApi.document(token, item), name); }
        catch (error) { setNotice({ tone: 'error', text: message(error) }); }
        finally { setBusy(''); }
    }

    function validate() {
        const found = [];
        if (!chosen.length) found.push({ target: 'sign-selection', text: t('signingV2.public.errors.NOTHING_SELECTED') });
        for (const { pkg, task, document } of chosen) {
            for (const field of task.fields.filter(item => INPUT_TYPES.has(item.type) && item.required)) {
                const value = values[task.taskId]?.[field.id];
                if (field.type === 'text' && !String(value || '').trim()) found.push({ target: inputId(task.taskId, field.id), text: `${where(pkg, document)}: ${fieldLabel(field)}`, code: 'FIELD_REQUIRED' });
                if (field.type === 'checkbox' && value !== true) found.push({ target: inputId(task.taskId, field.id), text: `${where(pkg, document)}: ${fieldLabel(field)}`, code: 'CHECK_REQUIRED' });
            }
        }
        if (needsSignature && !signatureReady) found.push({ target: 'sign-pad', text: t('signingV2.public.errors.SIGNATURE_REQUIRED') });
        if (!consent) found.push({ target: 'sign-consent', text: t('signingV2.public.errors.CONSENT_REQUIRED') });
        return found;
    }
    // A run usually repeats one template across packages, so names alone don't tell the controls apart.
    const where = (pkg, document) => (view?.packages.length > 1 ? `${document.name} · ${pkg.reference || pkg.runName}` : document.name);
    const fieldLabel = field => field.label || t(`signingV2.public.field.${field.type}`, { page: formats.number.format(field.pageNum) });
    // After the first attempt the list follows the form, so a fixed field stops being reported at once.
    const problems = attempt && phase === 'review' ? validate() : [];
    const problemFor = target => problems.find(item => item.target === target);

    async function recover(error) {
        if (RELOAD_CODES.has(error?.code)) await load();
        if (RESTART_CODES.has(error?.code)) { setPhase('review'); setSession(null); setChallenge(null); setCode(''); }
        setNotice({ tone: 'error', text: message(error) });
    }

    async function begin() {
        setNotice(null);
        if (validate().length) { setAttempt(count => count + 1); return; }
        signature.current = needsSignature ? pad.current?.toPng() : null;
        if (needsSignature && !signature.current) { setNotice({ tone: 'error', text: t('signingV2.public.errors.SIGNATURE_REQUIRED') }); return; }
        setAttempt(0);
        setBusy('session');
        try {
            const opened = await signingPublicApi.session(token, { taskIds: chosen.map(item => item.task.taskId), consentVersion: view.consentVersion, locale: language });
            acceptKey.current = newKey();
            setSession(opened); setChallenge(null); setCode(''); setCodeError(null);
            setChannel(opened.channels[0]?.channel || '');
            setPhase('code');
            if (opened.channels.length === 1) await send(opened, opened.channels[0].channel);
        } catch (error) { await recover(error); }
        finally { setBusy(''); }
    }

    async function send(current = session, via = channel) {
        setBusy('challenge'); setCodeError(null);
        try {
            const sent = await signingPublicApi.challenge(token, current.sessionId, via);
            setChallenge(sent); setCode('');
            setCooldownUntil(Date.now() + (sent.cooldownSeconds || 30) * 1000); setNow(Date.now());
            document.getElementById('sign-code')?.focus();
        } catch (error) {
            const wait = Number(extra(error, 'retryAfterSeconds'));
            if (error?.code === 'OTP_COOLDOWN' && wait) { setCooldownUntil(Date.now() + wait * 1000); setNow(Date.now()); }
            if (RESTART_CODES.has(error?.code)) await recover(error);
            else setCodeError({ error, values: { seconds: formats.number.format(wait || 0) } });
        } finally { setBusy(''); }
    }

    async function confirm() {
        if (!/^\d{6}$/.test(code)) { setCodeError({ error: { code: 'CODE_FORMAT' } }); document.getElementById('sign-code')?.focus(); return; }
        setBusy('confirm'); setCodeError(null);
        try {
            await signingPublicApi.verify(token, session.sessionId, code);
            const body = { consent: true, values: Object.fromEntries(chosen.map(({ task }) => [task.taskId, Object.fromEntries(task.fields
                .filter(field => INPUT_TYPES.has(field.type))
                .map(field => [field.id, field.type === 'checkbox' ? values[task.taskId]?.[field.id] === true : String(values[task.taskId]?.[field.id] || '').trim()]))])) };
            if (signature.current) body.signature = signature.current;
            const result = await signingPublicApi.accept(token, session.sessionId, body, acceptKey.current);
            setSignedCount(result.tasks?.length || chosen.length);
            setSession(null); setChallenge(null); setCode(''); setConsent(false); setPolls(0);
            setPdfs({}); setOpenDocument(null);
            setPhase('done');
            await load();
        } catch (error) {
            if (error?.code === 'OTP_INVALID') setCodeError({ error, values: { remaining: formats.number.format(Number(extra(error, 'remainingAttempts')) || 0) } });
            else if (['OTP_ATTEMPTS_EXCEEDED', 'OTP_EXPIRED', 'OTP_REQUIRED'].includes(error?.code)) { setCodeError({ error }); setCooldownUntil(0); }
            else await recover(error);
        } finally { setBusy(''); }
    }

    if (loadError || !view) {
        return <main className="lw-publicSign" dir={direction} lang={language}>
            <div className="lw-publicSign__shell">
                {loadError ? <div className="lw-publicSign__card" role="alert">
                    <h1>{t('signingV2.public.unavailableTitle')}</h1>
                    <p>{message(loadError)}</p>
                    {loadError.code !== 'NOT_FOUND' && loadError.code !== 'MISSING_TOKEN' && <SecondaryButton onPress={load}>{t('signingV2.public.retry')}</SecondaryButton>}
                </div> : <p className="lw-publicSign__loading" role="status">{t('signingV2.public.loading')}</p>}
            </div>
        </main>;
    }

    const signable = readyItems.length > 0;
    const waiting = view.counts.waiting;
    return <main className="lw-publicSign" dir={direction} lang={language}>
        <div className="lw-publicSign__shell">
            <header className="lw-publicSign__header">
                <h1 ref={phase === 'review' ? heading : undefined} tabIndex={-1}>{t('signingV2.public.title')}</h1>
                <p className="lw-publicSign__greeting">{t('signingV2.public.greeting', { name: view.person.name })}</p>
                <p>{signable ? counted('signingV2.public.summary', readyItems.length) : t('signingV2.public.summaryNone')}
                    {waiting > 0 && <> {counted('signingV2.public.waitingNote', waiting)}</>}</p>
            </header>

            {notice && <div className={`lw-publicSign__notice is-${notice.tone}`} role="alert">{notice.text}</div>}
            {problems.length > 0 && phase === 'review' && <div className="lw-publicSign__problems" role="alert" aria-labelledby="sign-problems-heading" tabIndex={-1} ref={summary}>
                <h2 id="sign-problems-heading">{counted('signingV2.public.problems', problems.length)}</h2>
                <ul>{problems.map(item => <li key={item.target}><a href={`#${item.target}`} onClick={event => {
                    event.preventDefault();
                    if (item.target === 'sign-pad') pad.current?.focus(); else document.getElementById(item.target)?.focus();
                }}>{item.text}</a></li>)}</ul>
            </div>}

            {phase === 'done' && <section className="lw-publicSign__card lw-publicSign__done" aria-labelledby="sign-done-heading">
                <h2 id="sign-done-heading" ref={heading} tabIndex={-1}>{counted('signingV2.public.done.heading', signedCount)}</h2>
                <p role="status">{settling && polls < POLL_LIMIT ? t('signingV2.public.done.preparing')
                    : view.packages.every(pkg => pkg.state === 'complete') ? t('signingV2.public.done.ready') : t('signingV2.public.done.waiting')}</p>
                {signable && <SecondaryButton onPress={() => setPhase('review')}>{counted('signingV2.public.done.more', readyItems.length)}</SecondaryButton>}
            </section>}

            <section aria-labelledby="sign-documents-heading" className="lw-publicSign__documents" id="sign-selection" tabIndex={-1}>
                <div className="lw-publicSign__sectionHead">
                    <h2 id="sign-documents-heading">{t('signingV2.public.documentsHeading')}</h2>
                    {phase === 'review' && readyItems.length > 1 && <label className="lw-publicSign__selectAll">
                        <input type="checkbox" checked={chosen.length === readyItems.length}
                            ref={element => { if (element) element.indeterminate = chosen.length > 0 && chosen.length < readyItems.length; }}
                            onChange={toggleAll} />
                        <span>{counted('signingV2.public.selectAll', readyItems.length)}</span>
                    </label>}
                </div>
                <ul className="lw-publicSign__packages">
                    {view.packages.map(pkg => <li key={pkg.packageId} className="lw-publicSign__package">
                        <div className="lw-publicSign__packageHead">
                            <h3><bdi>{pkg.runName}</bdi>{pkg.reference && <span className="lw-publicSign__reference"> · <bdi>{pkg.reference}</bdi></span>}</h3>
                            <p>
                                {pkg.ownerName && <span>{t('signingV2.public.from', { name: pkg.ownerName })}</span>}
                                {pkg.otherParticipants?.length > 0 && <span>{t('signingV2.public.others', { names: formats.list.format(pkg.otherParticipants) })}</span>}
                                {pkg.deadline && pkg.state !== 'complete' && <span>{t('signingV2.public.deadline', { date: formats.date.format(new Date(pkg.deadline)) })}</span>}
                            </p>
                        </div>
                        <ul className="lw-publicSign__documentList">
                            {pkg.documents.map(document => {
                                const task = document.tasks.find(item => item.state === 'ready') || document.tasks[0];
                                const selectable = phase === 'review' && task?.state === 'ready';
                                const isChosen = selectable && selected.has(task.taskId);
                                const state = document.final ? 'final' : task?.state || 'none';
                                const open = openDocument === document.documentId, pdf = pdfs[document.documentId];
                                const inputs = isChosen ? task.fields.filter(field => INPUT_TYPES.has(field.type)) : [];
                                const dated = isChosen && task.fields.some(field => field.type === 'date');
                                return <li key={document.documentId} className={`lw-publicSign__document${isChosen ? ' is-chosen' : ''}`}>
                                    <div className="lw-publicSign__documentRow">
                                        {selectable ? <label className="lw-publicSign__choose">
                                            <input type="checkbox" checked={isChosen} onChange={() => toggle(task.taskId)} aria-describedby={`sign-state-${document.documentId}`}
                                                aria-label={where(pkg, document)} />
                                            <span><bdi>{document.name}</bdi></span>
                                        </label> : <span className="lw-publicSign__documentName"><bdi>{document.name}</bdi></span>}
                                        <span id={`sign-state-${document.documentId}`} className={`lw-publicSign__state is-${state}`}>{t(`signingV2.public.state.${state}`)}</span>
                                        <div className="lw-publicSign__documentActions">
                                            <SecondaryButton onPress={() => preview(document)} aria-expanded={open} aria-controls={`sign-viewer-${document.documentId}`}
                                                aria-label={`${t(open ? 'signingV2.public.hide' : 'signingV2.public.view')}: ${where(pkg, document)}`}>
                                                {t(open ? 'signingV2.public.hide' : 'signingV2.public.view')}
                                            </SecondaryButton>
                                            {document.final && <SecondaryButton onPress={() => download('document', document.documentId, where(pkg, document))}
                                                aria-label={`${t('signingV2.public.downloadFinal')}: ${where(pkg, document)}`}
                                                disabled={busy === `document-${document.documentId}`}>{t('signingV2.public.downloadFinal')}</SecondaryButton>}
                                        </div>
                                    </div>
                                    {(inputs.length > 0 || dated) && <div className="lw-publicSign__inputs">
                                        {inputs.map(field => {
                                            const id = inputId(task.taskId, field.id), problem = problemFor(id);
                                            const errorId = problem ? `${id}-error` : undefined;
                                            const error = problem && <small id={errorId} className="lw-signingCompose__fieldError">{t(`signingV2.public.errors.${problem.code}`)}</small>;
                                            return field.type === 'checkbox'
                                                ? <div key={field.id} className="lw-publicSign__check">
                                                    <label><input id={id} type="checkbox" checked={values[task.taskId]?.[field.id] === true}
                                                        onChange={event => setValue(task.taskId, field.id, event.target.checked)}
                                                        aria-invalid={problem ? true : undefined} aria-describedby={errorId} />
                                                    <span>{fieldLabel(field)}{field.required && <span className="lw-publicSign__required"> ({t('signingV2.public.field.required')})</span>}</span></label>
                                                    {error}
                                                </div>
                                                : <div key={field.id} className="lw-signingCompose__field">
                                                    <label htmlFor={id}>{fieldLabel(field)}{field.required && <span className="lw-publicSign__required"> ({t('signingV2.public.field.required')})</span>}</label>
                                                    <input id={id} dir="auto" value={values[task.taskId]?.[field.id] || ''} maxLength={500}
                                                        onChange={event => setValue(task.taskId, field.id, event.target.value)}
                                                        aria-invalid={problem ? true : undefined} aria-describedby={errorId} />
                                                    {error}
                                                </div>;
                                        })}
                                        {dated && <small className="lw-publicSign__hint">{t('signingV2.public.field.dateAuto')}</small>}
                                    </div>}
                                    {open && <div id={`sign-viewer-${document.documentId}`} className="lw-publicSign__viewer lw-signing-pdfViewerMain">
                                        {pdf?.blob ? <PdfViewer pdfFile={pdf.blob} spots={document.final ? [] : document.tasks.filter(item => item.state === 'ready')
                                            .flatMap(item => item.fields).map(field => ({ pageNum: field.pageNum, x: field.x, y: field.y, width: field.width, height: field.height,
                                                fieldType: field.type, isRequired: field.required, fieldLabel: field.label, signerName: view.person.name, signerIndex: 0 }))} /> : pdf?.error
                                            ? <p role="alert">{message(pdf.error)}</p> : <p role="status">{t('signingV2.public.loadingDocument')}</p>}
                                    </div>}
                                </li>;
                            })}
                        </ul>
                        {pkg.evidence && <SecondaryButton onPress={() => download('evidence', pkg.packageId, `${pkg.reference || pkg.runName} - ${t('signingV2.public.evidenceName')}`)}
                            aria-label={`${t('signingV2.public.downloadEvidence')}: ${pkg.reference || pkg.runName}`}
                            disabled={busy === `evidence-${pkg.packageId}`}>{t('signingV2.public.downloadEvidence')}</SecondaryButton>}
                    </li>)}
                </ul>
            </section>

            {phase === 'review' && signable && <section className="lw-publicSign__card" aria-labelledby="sign-heading">
                <h2 id="sign-heading">{t('signingV2.public.sign.heading')}</h2>
                {needsSignature && <SignaturePad ref={pad} t={t} direction={direction} id="sign-pad" defaultName={view.person.name}
                    onReadyChange={setSignatureReady} error={problemFor('sign-pad')?.text} />}
                <div className="lw-publicSign__check lw-publicSign__consent">
                    <label><input id="sign-consent" type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}
                        aria-invalid={problemFor('sign-consent') ? true : undefined} />
                    <span>{counted('signingV2.public.sign.consent', Math.max(1, chosen.length))}</span></label>
                </div>
                <p className="lw-publicSign__hint">{t('signingV2.public.sign.otpNote')}</p>
                <div className="lw-publicSign__actions">
                    <PrimaryButton onPress={begin} disabled={!!busy} aria-busy={busy === 'session'}>
                        {busy === 'session' ? t('signingV2.public.sign.starting') : counted('signingV2.public.sign.continue', Math.max(1, chosen.length))}
                    </PrimaryButton>
                </div>
            </section>}

            {phase === 'code' && session && <section className="lw-publicSign__card" aria-labelledby="sign-code-heading">
                <h2 id="sign-code-heading" ref={heading} tabIndex={-1}>{t('signingV2.public.code.heading')}</h2>
                {session.channels.length > 1 && <fieldset className="lw-publicSign__channels">
                    <legend>{t('signingV2.public.code.choose')}</legend>
                    {session.channels.map(option => <label key={option.channel}>
                        <input type="radio" name="sign-channel" value={option.channel} checked={channel === option.channel} onChange={() => setChannel(option.channel)} />
                        <span>{t(`signingV2.public.channel.${option.channel}`)}: <bdi dir="ltr">{option.hint}</bdi></span>
                    </label>)}
                </fieldset>}
                {challenge && <p role="status">{t('signingV2.public.code.sent', { hint: `\u2066${challenge.hint}\u2069`, minutes: formats.number.format(OTP_MINUTES) })}</p>}
                {challenge?.delivery === 'uncertain' && <p className="lw-publicSign__hint">{t('signingV2.public.code.uncertain')}</p>}
                {challenge && <div className="lw-signingCompose__field lw-publicSign__code">
                    <label htmlFor="sign-code">{t('signingV2.public.code.label')}</label>
                    <input id="sign-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                        onChange={event => { setCode(latinDigits(event.target.value).replace(/\D/g, '').slice(0, 6)); setCodeError(null); }}
                        onKeyDown={event => { if (event.key === 'Enter') confirm(); }}
                        aria-invalid={codeError ? true : undefined} aria-describedby={codeError ? 'sign-code-error' : undefined} />
                </div>}
                {codeError && <p id="sign-code-error" className="lw-signingCompose__fieldError" role="alert">{message(codeError.error, codeError.values)}</p>}
                <div className="lw-publicSign__actions">
                    {challenge ? <PrimaryButton onPress={confirm} disabled={!!busy} aria-busy={busy === 'confirm'}>
                        {busy === 'confirm' ? t('signingV2.public.code.confirming') : counted('signingV2.public.code.confirm', session.taskCount)}
                    </PrimaryButton> : <PrimaryButton onPress={() => send()} disabled={!!busy || !channel} aria-busy={busy === 'challenge'}>
                        {busy === 'challenge' ? t('signingV2.public.code.sending') : t('signingV2.public.code.send')}
                    </PrimaryButton>}
                    {challenge && <SecondaryButton onPress={() => send()} disabled={!!busy || cooldown > 0}>
                        {cooldown > 0 ? t('signingV2.public.code.resendIn', { seconds: formats.number.format(cooldown) }) : t('signingV2.public.code.resend')}
                    </SecondaryButton>}
                    <SecondaryButton onPress={() => { setPhase('review'); setSession(null); setChallenge(null); setCodeError(null); }} disabled={busy === 'confirm'}>
                        {t('signingV2.public.code.back')}
                    </SecondaryButton>
                </div>
            </section>}
        </div>
    </main>;
}
