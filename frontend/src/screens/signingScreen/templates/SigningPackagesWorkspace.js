import SigningBackButton from './SigningBackButton';
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import signingPackagesApi from '../../../api/signingPackagesApi';
import PdfViewer from '../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import SegmentedSwitch from '../../../components/styledComponents/SegmentedSwitch';
import SearchInput from '../../../components/specializedComponents/containers/SearchInput';
import SimpleCard from '../../../components/simpleComponents/SimpleCard';
import SimpleContainer from '../../../components/simpleComponents/SimpleContainer';
import { Text14, TextBold14 } from '../../../components/specializedComponents/text/AllTextKindFile';
import { colors } from '../../../constant/colors';
import useSigningLocale from './useSigningLocale';
import PackageApprovalDialog from './PackageApprovalDialog';
import PackageLifecycleDialog from './PackageLifecycleDialog';
import ParticipantContactDialog from './ParticipantContactDialog';
import ParticipantActionDialog from './ParticipantActionDialog';
import TaskIssueDialog from './TaskIssueDialog';
import BulkActionsWorkspace from './BulkActionsWorkspace';
import StatusNotice from '../../../components/ui/StatusNotice';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';
import './signingPackages.scss';

function useDebounced(value, delay = 250) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

function usePagedResource(load, dependencies) {
    const [data, setData] = useState({ rows: [], total: 0, nextCursor: null });
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const loadRef = useRef(load);
    loadRef.current = load;
    useEffect(() => {
        let disposed = false;
        let sequence = 0;
        const controllers = new Set();
        const refresh = async (showBusy = false) => {
            const request = ++sequence;
            const controller = new AbortController(); controllers.add(controller);
            if (showBusy) setBusy(true);
            try {
                const next = await loadRef.current({ signal: controller.signal });
                if (!disposed && request === sequence) { setData(next); setError(null); }
            } catch (failure) {
                if (!disposed && request === sequence && !controller.signal.aborted) setError(failure);
            } finally {
                controllers.delete(controller);
                if (!disposed && request === sequence) setBusy(false);
            }
        };
        refresh(true);
        const interval = setInterval(() => { if (!document.hidden) refresh(); }, 8000);
        return () => { disposed = true; clearInterval(interval); controllers.forEach(controller => controller.abort()); };
        // The caller supplies primitive query keys; loadRef keeps callbacks current.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...dependencies, refreshKey]);
    return { data, busy, error, refresh: () => setRefreshKey(key => key + 1) };
}

function Pager({ previous, next, onPrevious, onNext, busy }) {
    const { t } = useSigningLocale();
    if (!previous && !next) return null;
    return <nav className="lw-signingPackages__pager" aria-label={t('signingV2.pagination')}>
        <SecondaryButton onPress={onPrevious} disabled={!previous || busy}>{t('signingV2.previousPage')}</SecondaryButton>
        <SecondaryButton onPress={onNext} disabled={!next || busy}>{t('signingV2.nextPage')}</SecondaryButton>
    </nav>;
}

function ErrorNotice({ error, onRetry }) {
    const { t, errorMessage } = useSigningLocale();
    return error ? <StatusNotice onAction={onRetry} actionLabel={t('common.retry')}>
        <p>{errorMessage(error)}</p>
    </StatusNotice> : null;
}

function Progress({ accepted, required }) {
    const { t, number } = useSigningLocale();
    return <span className="lw-signingPackages__progress">
        <bdi>{t('signingV2.fraction', { accepted: number(accepted), required: number(required) })}</bdi>
        <span>{t('signingV2.obligations')}</span>
    </span>;
}

function saveBlob(blob, name) {
    const filename = String(name || 'document').replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/\.pdf$/i, '');
    return downloadBlobAsFile(blob, `${filename || 'document'}.pdf`);
}

function taskDisplayState(task, pkg) {
    if (task.state !== 'blocked') return task.state;
    if (pkg.workflow_state === 'authorized_preparing') return 'preparing';
    if (pkg.current_stage != null && task.stage > pkg.current_stage) return 'previousStage';
    return 'blocked';
}

function PackageChildren({ api, batchId, state, query, onOpen }) {
    const { t, number } = useSigningLocale();
    const [cursors, setCursors] = useState([null]);
    const cursor = cursors.at(-1);
    const resource = usePagedResource(config => api.packages(batchId, { state, query, cursor }, config), [api, batchId, state, query, cursor]);
    useEffect(() => setCursors([null]), [state, query]);
    return <div className="lw-signingPackages__children" id={`packages-${batchId}`} aria-busy={resource.busy}>
        <ErrorNotice error={resource.error} onRetry={resource.refresh} />
        {resource.busy && !resource.data.rows.length
            ? <p className="lw-signingPackages__caption" role="status">{t('common.loading')}</p>
            : <p className="lw-signingPackages__caption">{t('signingV2.matchingPackages', { count: resource.data.total, formattedCount: number(resource.data.total) })}</p>}
        <ul className="lw-signingPackages__childList">{resource.data.rows.map(item => <li key={item.id}>
            <div className="lw-signingPackages__childName"><button type="button" className="lw-signingPackages__textButton" onClick={() => onOpen(item.id)}>{item.name}</button>
                {query && item.match_reason !== 'package' && <small>{t(`signingV2.match.${item.match_reason}`)}</small>}
            </div>
            <span className="lw-signingPackages__rowStatus">
                <span>{t(`signingV2.workflow.${item.workflow_state}`, { defaultValue: t('signingV2.workflow.attention') })}</span>
                {item.issue_count > 0 && item.workflow_state !== 'attention' && <span className="lw-signingPackages__attention">{t('signingV2.workflow.attention')}</span>}
            </span>
            <Progress accepted={item.accepted_count} required={item.required_count} />
            <SecondaryButton onPress={() => onOpen(item.id)}>{t('signingV2.openPackage')}</SecondaryButton>
        </li>)}</ul>
        {!resource.busy && !resource.data.rows.length && !resource.error && <p>{t('signingV2.noMatchingPackages')}</p>}
        <Pager previous={cursors.length > 1} next={resource.data.nextCursor} busy={resource.busy}
            onPrevious={() => setCursors(values => values.slice(0, -1))} onNext={() => setCursors(values => [...values, resource.data.nextCursor])} />
    </div>;
}

// One action entry per person, even when the same person signs in two capacities.
function PersonActions({ person, detail, onAction, onContact }) {
    const { t, date } = useSigningLocale();
    const latest = detail.deliveries.find(item => item.personId === person.personId);
    const completedCopy = detail.package.workflow_state === 'complete';
    const ready = person.tasks.some(task => task.state === 'ready');
    const editable = !['cancelled','superseded'].includes(detail.package.workflow_state);
    if (!detail.capabilities?.send && !detail.capabilities?.contactCorrect) return null;
    const purpose = completedCopy ? 'completed_copy' : latest?.state === 'failed' ? 'resend' : 'reminder';
    return <div className="lw-signingPackages__personActions">
        {latest && <p>{t(`signingV2.delivery.${latest.state}`)}{latest.attemptedAt && <> · <time dateTime={latest.attemptedAt}>{date(latest.attemptedAt)}</time></>}</p>}
        {detail.capabilities?.send && (completedCopy || ready) && <SecondaryButton onPress={() => onAction(person.personId, purpose)}>{t(`signingV2.action.${purpose}.open`)}</SecondaryButton>}
        {detail.capabilities?.send && detail.capabilities?.linkRenew && ready && editable && <SecondaryButton onPress={()=>onAction(person.personId,'resend',true)}>{t('signingV2.action.renew_link.open')}</SecondaryButton>}
        {detail.capabilities?.contactCorrect && editable && <SecondaryButton onPress={()=>onContact(person.personId)}>{t('signingV2.contact.open')}</SecondaryButton>}
    </div>;
}

function PackageDocuments({ detail, openId, files, busy, onView, onDownload, message }) {
    const { t, number } = useSigningLocale();
    const seen = new Set();
    return <ul className="lw-signingPackages__people">{detail.documents.map(document => {
        if (seen.has(document.id)) return null;
        seen.add(document.id);
        const open = openId === document.id;
        const file = files[document.id];
        const spots = document.spots || [];
        return <li key={document.id}>
            <h3><bdi>{document.name}</bdi></h3>
            <p>{t(`signingV2.document.${document.state}`)}</p>
            {document.informational && <small>{t('signingV2.informational')}</small>}
            <div className="lw-signingPackages__docActions">
                <SecondaryButton onPress={() => onView(document.id)} aria-expanded={open} aria-controls={`package-viewer-${document.id}`}
                    aria-label={`${t(open ? 'signingV2.public.hide' : 'signingV2.public.view')}: ${document.name}`}>
                    {t(open ? 'signingV2.public.hide' : 'signingV2.public.view')}
                </SecondaryButton>
                {document.final && <SecondaryButton onPress={() => onDownload(document)} disabled={busy === `document-${document.id}`}
                    aria-label={`${t('signingV2.public.downloadFinal')}: ${document.name}`}>{t('signingV2.public.downloadFinal')}</SecondaryButton>}
            </div>
            {open && <div id={`package-viewer-${document.id}`}>
                {spots.length > 0 && <ul className="lw-signingPackages__spots">{spots.map(spot => <li key={spot.id}>
                    {t('signingV2.spot', { name: spot.signerName || t('signingV2.unknownSigner'), type: t(`signingV2.fieldType.${spot.type}`, { defaultValue: spot.type }), page: number(spot.pageNum) })}
                </li>)}</ul>}
                <div className="lw-signingPackages__viewer lw-signing-pdfViewerMain">
                    {file?.blob ? <PdfViewer pdfFile={file.blob} spots={spots.map(spot => ({ ...spot, fieldType: spot.type, isRequired: spot.required, fieldLabel: spot.label }))} />
                        : file?.error ? <StatusNotice embedded><p>{message(file.error)}</p></StatusNotice>
                            : <p role="status">{t('signingV2.public.loadingDocument')}</p>}
                </div>
            </div>}
        </li>;
    })}</ul>;
}

function PackagePanel({ id, api, onClose }) {
    const { t, direction, number, date, errorMessage } = useSigningLocale();
    const dialog = useRef(null);
    const [tab, setTab] = useState('people');
    const [action, setAction] = useState(null);
    const [issue, setIssue] = useState(null);
    const [approvalOpen,setApprovalOpen] = useState(false);
    const [lifecycle,setLifecycle] = useState(null);
    const [contactPerson,setContactPerson] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [files, setFiles] = useState({});
    const [busy, setBusy] = useState('');
    const [fileError, setFileError] = useState(null);
    const resource = usePagedResource(config => api.details(id, config), [api, id]);
    const actionRows = new Map();
    (resource.data.participants || []).forEach(person => {
        // Keep the person's single action beside a ready participation, not a
        // future-stage role that happens to sort first. Copies use the first row.
        if (!actionRows.has(person.personId) || person.tasks.some(task => task.state === 'ready')) actionRows.set(person.personId, person.id);
    });
    useEffect(() => {
        const previousFocus = document.activeElement;
        const element = dialog.current;
        if (element.showModal) element.showModal(); else element.setAttribute('open', '');
        return () => { if (previousFocus?.isConnected) previousFocus.focus?.(); };
    }, []);
    const detail = resource.data;
    const showDocument = documentId => {
        setFileError(null);
        setTab('documents');
        setOpenId(current => (current === documentId ? null : documentId));
    };
    const openDocument = detail.documents?.find(document => document.id === openId);
    const openDocumentVersion = openDocument?.artifactVersion
        || (openDocument?.final ? 'final' : openDocument?.prepared ? 'prepared' : 'source');
    useEffect(() => {
        if (!openId) return undefined;
        let cancelled = false;
        // A preview can become a prepared/final PDF while the panel stays open.
        // Reopening also retries a failed or abandoned load instead of keeping it stuck.
        setFiles(previous => ({ ...previous, [openId]: { loading: true } }));
        api.documentFile(id, openId).then(blob => { if (!cancelled) setFiles(previous => ({ ...previous, [openId]: { blob } })); })
            .catch(error => { if (!cancelled) setFiles(previous => ({ ...previous, [openId]: { error } })); });
        return () => { cancelled = true; };
    }, [openId, id, api, openDocumentVersion]);
    const downloadDocument = async document => {
        setBusy(`document-${document.id}`); setFileError(null);
        // Always obtain the current authorized artifact; the viewer may hold an older unsigned preview.
        try { await saveBlob(await api.documentFile(id, document.id), document.name); }
        catch (error) { setFileError(error); }
        finally { setBusy(''); }
    };
    const downloadEvidence = async () => {
        setBusy('evidence'); setFileError(null);
        try { await saveBlob(await api.evidenceFile(id), detail.package?.external_key || t('signingV2.public.evidenceName')); }
        catch (error) { setFileError(error); }
        finally { setBusy(''); }
    };
    return <dialog ref={dialog} className="lw-signingPackages__panel" dir={direction} aria-labelledby="signing-package-title"
        onCancel={event => { event.preventDefault(); onClose(); }}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}>
        <header className="lw-signingPackages__panelHeader">
            <h2 id="signing-package-title">{detail.package?.external_key || t('signingV2.packageDetails')}</h2>
            <SecondaryButton onPress={onClose}>{t('common.close')}</SecondaryButton>
        </header>
        <ErrorNotice error={resource.error} onRetry={resource.refresh} />
        {resource.busy && !detail.package && <p role="status">{t('common.loading')}</p>}
        {detail.package && <>
            <div className="lw-signingPackages__panelSummary">
                <span>{t(`signingV2.workflow.${detail.package.workflow_state}`)}</span>
                <Progress accepted={detail.package.accepted_count} required={detail.package.required_count} />
                <p>{t('signingV2.preparedFraction', { ready: number(detail.package.prepared_count), total: number(detail.package.document_count) })}</p>
                {detail.package.workflow_state === 'complete' && <SecondaryButton onPress={downloadEvidence} disabled={busy === 'evidence'}
                    aria-label={t('signingV2.public.downloadEvidence')}>{t('signingV2.public.downloadEvidence')}</SecondaryButton>}
            </div>
            <div className="lw-signingPackages__docActions">
                {detail.capabilities?.packageAssign && <SecondaryButton onPress={()=>setLifecycle('assign')}>{t('signingV2.lifecycle.assign.title')}</SecondaryButton>}
                {detail.capabilities?.packageCancel && !['cancelled','superseded','complete'].includes(detail.package.workflow_state) && detail.package.accepted_count < detail.package.required_count && <SecondaryButton onPress={()=>setLifecycle('cancel')}>{t('signingV2.lifecycle.cancel.title')}</SecondaryButton>}
            </div>
            {detail.approval && <div className="lw-signingPackages__panelSummary"><p>{t('signingV2.approval.reviewer')}: <bdi>{detail.approval.reviewerName}</bdi> · {t(`signingV2.approval.state.${detail.approval.state}`)}</p>
                {detail.approval.reason && <p>{detail.approval.reason}</p>}
                {detail.capabilities?.packageApprove && detail.approval.state==='pending' && <PrimaryButton onPress={()=>setApprovalOpen(true)}>{t('signingV2.approval.title')}</PrimaryButton>}
            </div>}
            {fileError && <StatusNotice embedded><p>{errorMessage(fileError)}</p></StatusNotice>}
            <SegmentedSwitch value={tab} onChange={setTab} ariaLabel={t('signingV2.packageDetails')}
                options={['people', 'documents', 'delivery'].map(value => ({ value, label: t(`signingV2.tabs.${value}`) }))} />
            {tab === 'people' && <ul className="lw-signingPackages__people">{detail.participants.map(person => <li key={person.id}>
                <h3>{person.name}</h3><p>{t(`signingV2.capacity.${person.capacity}`)} · {person.partyName}</p>
                <ul className="lw-signingPackages__tasks">{person.tasks.map(task => {
                    const document = detail.documents.find(item => item.id === task.documentId);
                    return <li key={task.id}>
                        <span>{document?.name}</span>
                        <span>{t(`signingV2.task.${taskDisplayState(task, detail.package)}`)}</span>
                        {document && <div className="lw-signingPackages__docActions">
                            <SecondaryButton onPress={() => showDocument(document.id)}
                                aria-label={`${t('signingV2.public.view')}: ${document.name}`}>{t('signingV2.public.view')}</SecondaryButton>
                            {document.final && <SecondaryButton onPress={() => downloadDocument(document)} disabled={busy === `document-${document.id}`}
                                aria-label={`${t('signingV2.public.downloadFinal')}: ${document.name}`}>{t('signingV2.public.downloadFinal')}</SecondaryButton>}
                        </div>}
                        {(detail.issues || []).filter(item => item.taskId === task.id).map(item => <div key={item.id} className="lw-signingTaskIssue__notice">
                            <strong>{t(`signingV2.issue.${item.kind}Title`)}</strong>
                            {item.reason && <p className="lw-signingTaskIssue__note">{item.reason}</p>}
                            <time dateTime={item.createdAt}>{date(item.createdAt)}</time>
                            {item.state === 'resolved' ? <p className="lw-signingTaskIssue__note">{t('signingV2.issue.resolution')}: {item.resolution}</p>
                                : detail.capabilities?.manage && item.canResume ? <SecondaryButton onPress={() => setIssue(item)}>{t('signingV2.issue.resolveTitle')}</SecondaryButton>
                                    : <p>{t('signingV2.issue.officePaused')}</p>}
                        </div>)}
                        {task.acceptedAt && <time dateTime={task.acceptedAt}>{date(task.acceptedAt)}</time>}
                    </li>;
                })}</ul>
                {actionRows.get(person.personId) === person.id && <PersonActions detail={detail}
                    person={{ personId: person.personId, tasks: detail.participants.filter(item => item.personId === person.personId).flatMap(item => item.tasks) }}
                    onAction={(personId, purpose, renewLink = false) => setAction({ personId, purpose, renewLink })} onContact={setContactPerson} />}
            </li>)}</ul>}
            {tab === 'documents' && <PackageDocuments detail={detail} openId={openId} files={files} busy={busy} message={errorMessage}
                onView={showDocument} onDownload={downloadDocument} />}
            {tab === 'delivery' && <ul className="lw-signingPackages__people">{detail.deliveries.map(delivery => <li key={delivery.id}>
                <h3>{detail.participants.find(person => person.personId === delivery.personId)?.name}</h3>
                <p>{t(`signingV2.channel.${delivery.channel}`)} · {t(`signingV2.delivery.${delivery.state}`)}</p>
                {delivery.attemptedAt && <time dateTime={delivery.attemptedAt}>{date(delivery.attemptedAt)}</time>}
                {delivery.state === 'uncertain' && <p>{t('signingV2.uncertainHelp')}</p>}
            </li>)}</ul>}
        </>}
        {approvalOpen && <PackageApprovalDialog api={api} packageId={id} onClose={changed=>{setApprovalOpen(false);if(changed)resource.refresh();}}/>}
        {lifecycle && <PackageLifecycleDialog key={lifecycle} api={api} packageId={id} action={lifecycle}
            onClose={changed=>{setLifecycle(null);if(changed)resource.refresh();}} />}
        {issue && <TaskIssueDialog kind="resolve" documentName={issue.documentName} originalNote={issue.reason}
            onSubmit={(resolution, key) => api.resolveIssue(id, issue.id, { resolution }, key)}
            onClose={changed => { setIssue(null); if (changed) resource.refresh(); }} />}
        {contactPerson && <ParticipantContactDialog api={api} packageId={id} personId={contactPerson}
            canSend={detail.capabilities?.send && (detail.package?.workflow_state==='complete' || (detail.capabilities?.linkRenew && detail.participants?.some(p=>p.personId===contactPerson && p.tasks.some(task=>task.state==='ready'))))}
            onClose={changed=>{setContactPerson(null);if(changed)resource.refresh();}}
            onSend={()=>{setContactPerson(null);resource.refresh();setAction({personId:contactPerson,purpose:detail.package.workflow_state==='complete'?'completed_copy':'resend',renewLink:detail.package.workflow_state!=='complete'});}}/>}
        {action && <ParticipantActionDialog key={`${action.personId}:${action.purpose}`} api={api} packageId={id} {...action}
            onClose={changed => { setAction(null); if (changed) resource.refresh(); }} />}
    </dialog>;
}

export default function SigningPackagesWorkspace({ onClose, onCreate, api = signingPackagesApi, initialSubmissionId, onClearFocus, backLabel }) {
    const { t, direction, number, date } = useSigningLocale();
    const [query, setQuery] = useState('');
    const search = useDebounced(query);
    const [focused, setFocused] = useState(initialSubmissionId || null);
    const [state, setState] = useState(initialSubmissionId ? 'all' : 'pending');
    const [expanded, setExpanded] = useState(() => new Set(initialSubmissionId ? [initialSubmissionId] : []));
    const [selectedPackage, setSelectedPackage] = useState(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [cursors, setCursors] = useState([null]);
    const cursor = cursors.at(-1);
    const resource = usePagedResource(config => api.list({ state, query: search, cursor, ...(focused ? { submissionId: focused } : {}) }, config), [api, state, search, cursor, focused]);
    useEffect(() => setCursors([null]), [state, search]);
    const toggle = id => setExpanded(previous => {
        const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next;
    });
    if (bulkOpen) return <BulkActionsWorkspace api={api} initialFilter={{ state, query: search, ...(focused ? { submissionId: focused } : {}) }}
        onClose={() => { setBulkOpen(false); resource.refresh(); }} />;
    return <section className="lw-signingPackages" dir={direction} aria-labelledby="signing-packages-title">
        {onClose && <SigningBackButton onPress={onClose}>{backLabel || t('signingV2.backToDocuments')}</SigningBackButton>}
        <header className="lw-signingPackages__heading">
            <div><h1 id="signing-packages-title">{t('signingV2.title')}</h1><p>{t('signingV2.subtitle')}</p></div>
            <div className="lw-signingPackages__actions">
                {resource.data.capabilities?.send && <SecondaryButton onPress={() => setBulkOpen(true)}>{t('signingV2.bulk.title')}</SecondaryButton>}
                {onCreate && <PrimaryButton onPress={onCreate}>{t('signingV2.newPackage')}</PrimaryButton>}
            </div>
        </header>
        {focused && <SigningBackButton onPress={() => { setFocused(null); setCursors([null]); onClearFocus?.(); }}>{t('signingV2.showAllRuns')}</SigningBackButton>}
        <div className="lw-signingPackages__toolbar">
            <SearchInput title={t('signingV2.search')} aria-label={t('signingV2.search')} value={query} onSearch={setQuery} containerDir={direction} textStyle={{ textAlign: 'start' }} />
            <SegmentedSwitch value={state} onChange={setState} ariaLabel={t('signingV2.statusFilter')}
                options={['pending', 'attention', 'complete', 'cancelled', 'all'].map(value => ({ value, label: t(`signingV2.filter.${value}`) }))} />
            <SecondaryButton disabled={resource.busy} onPress={resource.refresh}>{t('signingV2.refresh')}</SecondaryButton>
        </div>
        <ErrorNotice error={resource.error} onRetry={resource.refresh} />
        {resource.busy || resource.data.rows.length || resource.error ? <div className="lw-signingPackages__resultSummary" aria-live="polite">
            {resource.busy ? t('common.loading') : t('signingV2.results', { count: resource.data.total, formattedCount: number(resource.data.total) })}
        </div> : null}
        {!resource.busy && !resource.data.rows.length && !resource.error
            ? <SimpleContainer className="lw-signingPackages__empty">
                <TextBold14 color={colors.winter}>{t('signingV2.emptyTitle')}</TextBold14>
                <Text14 color={colors.winter}>{t('signingV2.emptyBody')}</Text14>
            </SimpleContainer>
            : (<SimpleCard className="lw-signingPackages__list" aria-busy={resource.busy}>
            <ul>{resource.data.rows.map(batch => <li className="lw-signingPackages__group" key={batch.id}>
                <div className="lw-signingPackages__row">
                    <button type="button" className="lw-signingPackages__groupTitle" onClick={() => batch.is_batch ? toggle(batch.id) : setSelectedPackage(batch.id)}
                        aria-expanded={batch.is_batch ? expanded.has(batch.id) : undefined} aria-controls={batch.is_batch ? `packages-${batch.id}` : undefined}>
                        {batch.is_batch && (expanded.has(batch.id) ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />)}
                        <span><strong>{batch.name}</strong><time dateTime={batch.created_at}>{date(batch.created_at)}</time></span>
                    </button>
                    <div className="lw-signingPackages__metrics">
                        <span>{t('signingV2.packages', { count: batch.package_count, formattedCount: number(batch.package_count) })}</span>
                        <Progress accepted={batch.accepted_count} required={batch.required_count} />
                        <span>{t('signingV2.preparedFraction', { ready: number(batch.prepared_count), total: number(batch.document_count) })}</span>
                    </div>
                    <div className="lw-signingPackages__rowStatus">
                        {batch.attention_count > 0 ? <span className="lw-signingPackages__attention">{t('signingV2.needsAttention', { count: batch.attention_count, formattedCount: number(batch.attention_count) })}</span>
                            : batch.preparing_count > 0 ? <span>{t('signingV2.workflow.authorized_preparing')}</span>
                                : <span>{t('signingV2.completedPackages', { count: batch.complete_count, formattedCount: number(batch.complete_count) })}</span>}
                        {batch.cancelled_count > 0 && <small>{t('signingV2.cancelledPackages', { count: batch.cancelled_count, formattedCount: number(batch.cancelled_count) })}</small>}
                    </div>
                </div>
                {batch.is_batch && expanded.has(batch.id) && <>
                    <p className="lw-signingPackages__caption">{t('signingV2.authorizedSummary')}</p>
                    <PackageChildren api={api} batchId={batch.id} state={state} query={search} onOpen={setSelectedPackage} />
                </>}
            </li>)}</ul>
        </SimpleCard>)}
        <Pager previous={cursors.length > 1} next={resource.data.nextCursor} busy={resource.busy}
            onPrevious={() => setCursors(values => values.slice(0, -1))} onNext={() => setCursors(values => [...values, resource.data.nextCursor])} />
        {selectedPackage && <PackagePanel key={selectedPackage} id={selectedPackage} api={api} onClose={() => setSelectedPackage(null)} />}
    </section>;
}
