import React, { useEffect, useRef, useState } from 'react';
import api from '../../../api/signingTemplatesApi';
import TemplateBuilder from './TemplateBuilder';
import BatchComposer from './BatchComposer';
import SigningBackButton from './SigningBackButton';
import useSigningLocale from './useSigningLocale';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';
import StatusNotice from '../../../components/ui/StatusNotice';
import './templates.scss';

export default function TemplatesWorkspace({ onClose, canUpload, canManage, onSendTemplate }) {
    const { t, direction, number, date, errorMessage } = useSigningLocale();
    const text = (key, values) => t(`signingV2.workspace.${key}`, values);
    const status = value => text(`status.${value}`, { defaultValue: text('unknownStatus') });
    const count = (key, value) => text(key, { count: Number(value), formattedCount: number(value) });
    const [mode, setMode] = useState('list');
    const [templates, setTemplates] = useState([]);
    const [batches, setBatches] = useState([]);
    const [current, setCurrent] = useState(null);
    const [batch, setBatch] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [link, setLink] = useState('');
    const sending = useRef(false);

    async function refresh() {
        setBusy(true);
        setError(null);
        try {
            const [templateResult, batchResult] = await Promise.all([api.list(), api.batches()]);
            setTemplates(templateResult.templates);
            setBatches(batchResult.batches);
        } catch (err) { setError(err); }
        finally { setBusy(false); }
    }
    useEffect(() => { refresh(); }, []);

    async function openTemplate(id, next) {
        setBusy(true);
        setError(null);
        try {
            setCurrent((await api.load(id)).template);
            setMode(next);
        } catch (err) { setError(err); }
        finally { setBusy(false); }
    }
    async function openBatch(id) {
        setBusy(true);
        setError(null);
        try {
            setBatch(await api.batch(id));
            setMode('batch');
            setLink('');
        } catch (err) { setError(err); }
        finally { setBusy(false); }
    }
    async function archive(template) {
        if (!window.confirm(text('archiveConfirm', { name: template.name }))) return;
        try {
            await api.archive(template.id, template.version);
            refresh();
        } catch (err) { setError(err); }
    }
    async function send() {
        if (sending.current) return;
        sending.current = true;
        setBusy(true);
        setError(null);
        try { setBatch(await api.send(batch.batch.id)); }
        catch (err) { setError(err); }
        finally { setBusy(false); sending.current = false; }
    }
    async function getLink(person) {
        setError(null);
        try {
            setLink((await api.link(batch.batch.id, person.id)).url);
            setBatch(await api.batch(batch.batch.id));
        } catch (err) { setError(err); }
    }
    async function download(index) {
        setBusy(true);
        setError(null);
        try {
            await downloadBlobAsFile(await api.downloadPackage(batch.batch.id, index), `signed-package-${index + 1}.zip`);
        } catch (err) { setError(err); }
        finally { setBusy(false); }
    }
    async function completion() {
        setBusy(true);
        setError(null);
        try { setBatch(await api.completion(batch.batch.id)); }
        catch (err) { setError(err); }
        finally { setBusy(false); }
    }
    const back = () => { setMode('list'); setError(null); refresh(); };
    if (mode === 'builder') return <TemplateBuilder template={current} onBack={back} onSaved={back} />;
    if (mode === 'compose') return <BatchComposer template={current} onBack={back} onCreated={openBatch} />;

    return <section className="lw-templates" dir={direction} aria-label={text('title')}>
        <SigningBackButton onPress={mode === 'batch' ? back : onClose}>
            {mode === 'batch' ? text('backToTemplates') : t('signingV2.backToDocuments')}
        </SigningBackButton>
        <header className="lw-templates__heading"><div>
            <h1>{mode === 'batch' ? <bdi>{batch.batch.name}</bdi> : text('title')}</h1>
            <p>{text(mode === 'batch' ? 'batchSubtitle' : 'subtitle')}</p>
        </div></header>
        {error && <StatusNotice onAction={() => mode === 'batch' ? openBatch(batch.batch.id) : refresh()} actionLabel={t('signingV2.refresh')}>
            <p>{error.code === 'CLIPBOARD_UNAVAILABLE' ? text('copyFailed') : errorMessage(error)}</p>
        </StatusNotice>}
        {busy && <p role="status">{text('loading')}</p>}
        {mode === 'list' ? <>
            <div className="lw-templates__toolbar">
                <h2>{text('officeTemplates')}</h2>
                {canUpload && <button type="button" className="is-primary" onClick={() => { setCurrent(null); setMode('builder'); }}>{text('newTemplate')}</button>}
            </div>
            {!templates.length && !busy && <div className="lw-templates__empty"><h3>{text('emptyTitle')}</h3><p>{text('emptyBody')}</p></div>}
            <ul className="lw-templates__list" aria-label={text('officeTemplates')}>{templates.map(template => <li key={template.id}>
                <div><strong><bdi>{template.name}</bdi></strong><p>{count('documents', template.document_count)} · {text('version', { version: number(template.version) })}</p></div>
                <div className="lw-templates__actions">
                    {canUpload && <button type="button" className="is-primary" disabled={busy} onClick={() => onSendTemplate ? onSendTemplate(template) : openTemplate(template.id, 'compose')}>{text('sendFromTemplate')}</button>}
                    {canManage && canUpload && <button type="button" disabled={busy} onClick={() => openTemplate(template.id, 'builder')}>{text('edit')}</button>}
                    {canManage && <button type="button" disabled={busy} onClick={() => archive(template)}>{text('archive')}</button>}
                </div>
            </li>)}</ul>
            <h2>{text('batches')}</h2>
            <ul className="lw-templates__list" aria-label={text('batches')}>{batches.map(item => <li key={item.id}>
                <div><strong><bdi>{item.name}</bdi></strong><p>{status(item.status)} · <bdi>{date(item.created_at)}</bdi></p></div>
                <button type="button" onClick={() => openBatch(item.id)}>{text('batchDetails')}</button>
            </li>)}</ul>
            {!batches.length && !busy && <p>{text('emptyBatches')}</p>}
        </> : <>
            <div className="lw-templates__toolbar">
                <div><strong>{status(batch.batch.status)}</strong><p>{count('documents', batch.files.length)} · {count('recipients', batch.recipients.length)} · {text('templateVersion', { version: number(batch.batch.template_version) })}</p></div>
                <div className="lw-templates__actions">
                    <button type="button" disabled={busy} onClick={() => openBatch(batch.batch.id)}>{t('signingV2.refresh')}</button>
                    {batch.canDeliver && batch.recipients.some(person => person.status === 'pending') && <button type="button" className="is-primary" disabled={busy} onClick={send}>{text('sendInvitations')}</button>}
                </div>
            </div>
            <h2>{text('invitations')}</h2>
            <ul className="lw-templates__list" aria-label={text('invitations')}>{batch.recipients.map(person => <li key={person.id}>
                <div><strong><bdi>{person.name}</bdi></strong><p>{status(person.status)} · {text(`channel.${person.delivery_method === 'email' ? 'email' : person.delivery_method === 'phone' ? 'sms' : 'both'}`)}</p>
                    {person.status === 'uncertain' && <p>{text('uncertainHelp')}</p>}
                </div>
                {batch.canDeliver && <button type="button" onClick={() => getLink(person)}>{text('signingLink')}</button>}
            </li>)}</ul>
            {link && <div>
                <label>{text('linkForRecipient')}<input readOnly dir="ltr" value={link} onFocus={event => event.target.select()} /></label>
                <button type="button" onClick={async () => {
                    try { await navigator.clipboard.writeText(link); }
                    catch { setError({ code: 'CLIPBOARD_UNAVAILABLE' }); }
                }}>{text('copyLink')}</button>
            </div>}
            <h2>{text('packageDocuments')}</h2>
            <ul className="lw-templates__list" aria-label={text('packageDocuments')}>{batch.files.map(file => <li key={file.signingfileid}>
                <strong><bdi>{file.filename}</bdi></strong>
                <span>{status(file.status)} · {text('fieldsCompleted', { signed: number(file.signed_count), required: number(file.required_count) })}</span>
            </li>)}</ul>
            <div className="lw-templates__actions">{batch.batch.snapshot.packages.map((item, index) => {
                const files = batch.files.filter(file => file.package_index === index);
                return files.length === batch.batch.snapshot.definition.documents.length && files.every(file => file.status === 'signed') && <button type="button" key={index} disabled={busy} onClick={() => download(index)}>
                    {text('downloadEvidence', { name: item.label || text('packageNumber', { index: number(index + 1) }) })}
                </button>;
            })}</div>
            {batch.batch.snapshot.definition.completionMode === 'package' && <>
                <h2>{text('completedPackages')}</h2><p>{text('completionHelp')}</p>
                <ul className="lw-templates__list" aria-label={text('completedPackages')}>{(batch.completion || []).map(item => <li key={`${item.package_index}:${item.recipient_email}`}>
                    <span>{text('packageNumber', { index: number(item.package_index + 1) })} · <bdi>{item.recipient_email}</bdi></span>
                    <strong>{text(item.status === 'sent' ? 'completionSent' : 'completionUnconfirmed')}</strong>
                </li>)}</ul>
                {canManage && <button type="button" disabled={busy} onClick={completion}>{text('checkCompletion')}</button>}
            </>}
        </>}
    </section>;
}
