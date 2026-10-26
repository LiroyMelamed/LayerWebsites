import React, { useEffect, useRef, useState } from 'react';
import api from '../../../api/signingTemplatesApi';
import TemplateBuilder from './TemplateBuilder';
import TemplateArchiveConfirmation from './TemplateArchiveConfirmation';
import NativeTemplateBuilder from './NativeTemplateBuilder';
import packagesApi from '../../../api/signingPackagesApi';
import BatchComposer from './BatchComposer';
import SigningBackButton from './SigningBackButton';
import useSigningLocale from './useSigningLocale';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';
import SegmentedSwitch from '../../../components/styledComponents/SegmentedSwitch';
import StatusNotice from '../../../components/ui/StatusNotice';
import './templates.scss';

export default function TemplatesWorkspace({ onClose, canUpload, canManage, onSendTemplate, nativeAvailable = false, view = 'templates' }) {
    const legacyRunsOnly = view === 'legacy-runs';
    const showBatches = legacyRunsOnly || !nativeAvailable;
    const { t, direction, number, date, errorMessage } = useSigningLocale();
    const text = (key, values) => t(`signingV2.workspace.${key}`, values);
    const status = value => text(`status.${value}`, { defaultValue: text('unknownStatus') });
    const count = (key, value) => text(key, { count: Number(value), formattedCount: number(value) });
    const [mode, setMode] = useState('list');
    const [templates, setTemplates] = useState([]);
    const [nativeTemplates, setNativeTemplates] = useState([]);
    const [importedOrigins, setImportedOrigins] = useState([]);
    const [showArchived, setShowArchived] = useState(false);
    const [archiveConfirmation, setArchiveConfirmation] = useState(null);
    const [batches, setBatches] = useState([]);
    const [current, setCurrent] = useState(null);
    const [batch, setBatch] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [link, setLink] = useState('');
    const sending = useRef(false);
    const archiving = useRef(false);
    const refreshSequence = useRef(0);

    async function refresh() {
        const sequence = ++refreshSequence.current;
        setBusy(true);
        setError(null);
        try {
            const [templateResult, batchResult, nativeResult] = await Promise.all([
                legacyRunsOnly ? null : api.list(), showBatches ? api.batches() : null,
                !legacyRunsOnly && nativeAvailable ? packagesApi.authoringTemplates({ archived: showArchived }) : null,
            ]);
            if (sequence !== refreshSequence.current) return;
            setTemplates(templateResult?.templates || []);
            setBatches(batchResult?.batches || []);
            setNativeTemplates(nativeResult?.templates || []);
            setImportedOrigins(nativeResult?.importedOrigins || []);
        } catch (err) { if (sequence === refreshSequence.current) setError(err); }
        finally { if (sequence === refreshSequence.current) setBusy(false); }
    }
    useEffect(() => { refresh(); return () => { refreshSequence.current += 1; }; }, [nativeAvailable, showArchived, legacyRunsOnly]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (archiving.current) return;
        archiving.current = true; setBusy(true); setError(null);
        try { await api.archive(template.id, template.version); setArchiveConfirmation(null); await refresh(); }
        catch (err) { setError(err); }
        finally { archiving.current = false; setBusy(false); }
    }
    async function archiveNative(version) {
        if (archiving.current) return;
        archiving.current = true; setBusy(true); setError(null);
        try {
            await packagesApi.archiveTemplate(version.templateId, { archived: !version.archived, expectedVersion: version.lifecycleVersion });
            setArchiveConfirmation(null);
            await refresh();
        } catch (err) { setArchiveConfirmation(null); setError(err); }
        finally { archiving.current = false; setBusy(false); }
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
    const migrated = [...importedOrigins, ...nativeTemplates.filter(version => version.state === 'published').map(version => version.definition.origin).filter(Boolean)];
    const visibleLegacyTemplates = showArchived ? [] : templates.filter(template => !nativeAvailable || !migrated.some(origin =>
        origin.templateId === template.id && origin.version === template.version));
    const back = () => { setMode('list'); setError(null); refresh(); };
    if (mode === 'nativeBuilder') return <NativeTemplateBuilder version={current} onBack={back} onSaved={back} />;
    if (mode === 'builder') return <TemplateBuilder template={current} onBack={back} onSaved={back} />;
    if (mode === 'compose') return <BatchComposer template={current} onBack={back} onCreated={openBatch} />;
    if (legacyRunsOnly && mode === 'list' && !batches.length && !busy && !error) return null;

    return <><section className="lw-templates" dir={direction} aria-label={text(legacyRunsOnly ? 'previousBatches' : 'title')}>
        {(!legacyRunsOnly || mode === 'batch') && <SigningBackButton onPress={mode === 'batch' ? back : onClose}>
            {mode === 'batch' ? text(legacyRunsOnly ? 'backToRuns' : 'backToTemplates') : t('signingV2.backToDocuments')}
        </SigningBackButton>}
        <header className="lw-templates__heading"><div>
            {legacyRunsOnly && mode === 'list' ? <h2>{text('previousBatches')}</h2> : <h1>{mode === 'batch' ? <bdi>{batch.batch.name}</bdi> : text('title')}</h1>}
            {(!legacyRunsOnly || mode === 'batch') && <p>{text(mode === 'batch' ? 'batchSubtitle' : 'subtitle')}</p>}
        </div></header>
        {error && <StatusNotice onAction={() => mode === 'batch' ? openBatch(batch.batch.id) : refresh()} actionLabel={t('signingV2.refresh')}>
            <p>{error.code === 'CLIPBOARD_UNAVAILABLE' ? text('copyFailed') : errorMessage(error)}</p>
        </StatusNotice>}
        {busy && <p role="status">{text('loading')}</p>}
        {mode === 'list' ? <>
            {!legacyRunsOnly && <>
            <div className="lw-templates__toolbar">
                <h2>{text('officeTemplates')}</h2>
                {canUpload && <button type="button" className="is-primary" onClick={() => { setCurrent(null); setMode(nativeAvailable ? 'nativeBuilder' : 'builder'); }}>{text('newTemplate')}</button>}
            </div>
            {nativeAvailable && <SegmentedSwitch value={showArchived ? 'archived' : 'active'} onChange={value => setShowArchived(value === 'archived')} ariaLabel={t('signingV2.authoring.library')}
                options={['active', 'archived'].map(value => ({ value, label: t(`signingV2.authoring.${value}Templates`), disabled: busy }))} />}
            {showArchived && <p>{t('signingV2.authoring.archiveHelp')}</p>}
            {!visibleLegacyTemplates.length && !nativeTemplates.length && !busy && !showArchived && <div className="lw-templates__empty"><h3>{text('emptyTitle')}</h3><p>{text('emptyBody')}</p></div>}
            {showArchived && !nativeTemplates.length && !busy && <p>{t('signingV2.authoring.emptyArchive')}</p>}
            {nativeAvailable && <ul className="lw-templates__list" aria-label={t('signingV2.authoring.library')}>{nativeTemplates.map(version => <li key={version.id}>
                <div><strong><bdi>{version.definition.name}</bdi></strong><p>{version.state === 'draft' ? t('signingV2.authoring.draft') : text('version', { version: number(version.version) })} · {count('documents', version.definition.documents?.length || 0)}</p>
                    {version.sourceAvailable === false && <p>{t('signingV2.authoring.sourceArchived')}</p>}</div>
                <div className="lw-templates__actions">
                    {canUpload && !showArchived && version.state === 'published' && <button type="button" className="is-primary" disabled={busy} onClick={() => onSendTemplate?.({ id: version.templateId, versionId: version.id, version: version.version })}>{text('sendFromTemplate')}</button>}
                    {canUpload && !showArchived && version.canEdit && <button type="button" disabled={busy} onClick={() => { setCurrent(version); setMode('nativeBuilder'); }}>{text('edit')}</button>}
                    {canManage && version.canArchive && version.sourceAvailable !== false && <button type="button" disabled={busy} onClick={() => setArchiveConfirmation(version)}>{version.archived ? t('signingV2.authoring.restore') : text('archive')}</button>}
                </div>
            </li>)}</ul>}
            <ul className="lw-templates__list" aria-label={text('officeTemplates')}>{visibleLegacyTemplates.map(template => <li key={template.id}>
                <div><strong><bdi>{template.name}</bdi></strong><p>{count('documents', template.document_count)} · {text('version', { version: number(template.version) })}</p></div>
                <div className="lw-templates__actions">
                    {canUpload && <button type="button" className="is-primary" disabled={busy} onClick={() => onSendTemplate ? onSendTemplate(template) : openTemplate(template.id, 'compose')}>{text('sendFromTemplate')}</button>}
                    {canManage && canUpload && <button type="button" disabled={busy} onClick={() => openTemplate(template.id, 'builder')}>{text('edit')}</button>}
                    {canManage && <button type="button" disabled={busy} onClick={() => setArchiveConfirmation({ ...template, legacy: true, definition: { ...template.definition, name: template.name } })}>{text('archive')}</button>}
                </div>
            </li>)}</ul>
            </>}
            {showBatches && <>
            {!legacyRunsOnly && <h2>{text('batches')}</h2>}
            <ul className="lw-templates__list" aria-label={text('batches')}>{batches.map(item => <li key={item.id}>
                <div><strong><bdi>{item.name}</bdi></strong><p>{status(item.status)} · <bdi>{date(item.created_at)}</bdi></p></div>
                <button type="button" onClick={() => openBatch(item.id)}>{text('batchDetails')}</button>
            </li>)}</ul>
            {!batches.length && !busy && <p>{text('emptyBatches')}</p>}
            </>}
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
    </section>
        {archiveConfirmation && <TemplateArchiveConfirmation version={archiveConfirmation} busy={busy} onConfirm={() => archiveConfirmation.legacy ? archive(archiveConfirmation) : archiveNative(archiveConfirmation)}
            onCancel={() => { if (!archiving.current) setArchiveConfirmation(null); }} />}
    </>;
}
