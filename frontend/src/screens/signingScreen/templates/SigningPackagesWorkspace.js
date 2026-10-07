import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import signingPackagesApi from '../../../api/signingPackagesApi';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import SegmentedSwitch from '../../../components/styledComponents/SegmentedSwitch';
import SearchInput from '../../../components/specializedComponents/containers/SearchInput';
import SimpleCard from '../../../components/simpleComponents/SimpleCard';
import useSigningLocale from './useSigningLocale';
import ParticipantActionDialog from './ParticipantActionDialog';
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
    return error ? <div className="lw-signingPackages__error" role="alert">
        <span>{errorMessage(error)}</span><SecondaryButton onPress={onRetry}>{t('common.retry')}</SecondaryButton>
    </div> : null;
}

function Progress({ accepted, required }) {
    const { t, number } = useSigningLocale();
    return <span className="lw-signingPackages__progress">
        <bdi>{t('signingV2.fraction', { accepted: number(accepted), required: number(required) })}</bdi>
        <span>{t('signingV2.obligations')}</span>
    </span>;
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
function PersonActions({ person, detail, onAction }) {
    const { t, date } = useSigningLocale();
    const latest = detail.deliveries.find(item => item.personId === person.personId);
    if (!person.tasks.some(task => task.state === 'ready')) return null;
    const purpose = latest?.state === 'failed' ? 'resend' : 'reminder';
    return <div className="lw-signingPackages__personActions">
        {latest && <p>{t(`signingV2.delivery.${latest.state}`)}{latest.attemptedAt && <> · <time dateTime={latest.attemptedAt}>{date(latest.attemptedAt)}</time></>}</p>}
        <SecondaryButton onPress={() => onAction(person.personId, purpose)}>{t(`signingV2.action.${purpose}.open`)}</SecondaryButton>
    </div>;
}

function PackagePanel({ id, api, onClose }) {
    const { t, direction, number, date } = useSigningLocale();
    const dialog = useRef(null);
    const [tab, setTab] = useState('people');
    const [action, setAction] = useState(null);
    const resource = usePagedResource(config => api.details(id, config), [api, id]);
    const actionRows = new Map();
    (resource.data.participants || []).forEach(person => { if (!actionRows.has(person.personId)) actionRows.set(person.personId, person.id); });
    useEffect(() => {
        const previousFocus = document.activeElement;
        const element = dialog.current;
        if (element.showModal) element.showModal(); else element.setAttribute('open', '');
        return () => { if (previousFocus?.isConnected) previousFocus.focus?.(); };
    }, []);
    const detail = resource.data;
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
            </div>
            <SegmentedSwitch value={tab} onChange={setTab} ariaLabel={t('signingV2.packageDetails')}
                options={['people', 'documents', 'delivery'].map(value => ({ value, label: t(`signingV2.tabs.${value}`) }))} />
            {tab === 'people' && <ul className="lw-signingPackages__people">{detail.participants.map(person => <li key={person.id}>
                <h3>{person.name}</h3><p>{t(`signingV2.capacity.${person.capacity}`)} · {person.partyName}</p>
                <ul className="lw-signingPackages__tasks">{person.tasks.map(task => <li key={task.id}>
                    <span>{detail.documents.find(document => document.id === task.documentId)?.name}</span>
                    <span>{t(`signingV2.task.${taskDisplayState(task, detail.package)}`)}</span>
                    {task.acceptedAt && <time dateTime={task.acceptedAt}>{date(task.acceptedAt)}</time>}
                </li>)}</ul>
                {actionRows.get(person.personId) === person.id && <PersonActions detail={detail}
                    person={{ personId: person.personId, tasks: detail.participants.filter(item => item.personId === person.personId).flatMap(item => item.tasks) }}
                    onAction={(personId, purpose) => setAction({ personId, purpose })} />}
            </li>)}</ul>}
            {tab === 'documents' && <ul className="lw-signingPackages__people">{detail.documents.map(document => <li key={document.id}>
                <h3>{document.name}</h3><p>{t(`signingV2.document.${document.state}`)}</p>
                {document.informational && <small>{t('signingV2.informational')}</small>}
            </li>)}</ul>}
            {tab === 'delivery' && <ul className="lw-signingPackages__people">{detail.deliveries.map(delivery => <li key={delivery.id}>
                <h3>{detail.participants.find(person => person.personId === delivery.personId)?.name}</h3>
                <p>{t(`signingV2.channel.${delivery.channel}`)} · {t(`signingV2.delivery.${delivery.state}`)}</p>
                {delivery.attemptedAt && <time dateTime={delivery.attemptedAt}>{date(delivery.attemptedAt)}</time>}
                {delivery.state === 'uncertain' && <p>{t('signingV2.uncertainHelp')}</p>}
            </li>)}</ul>}
        </>}
        {action && <ParticipantActionDialog key={`${action.personId}:${action.purpose}`} api={api} packageId={id} {...action}
            onClose={changed => { setAction(null); if (changed) resource.refresh(); }} />}
    </dialog>;
}

export default function SigningPackagesWorkspace({ onClose, onCreate, api = signingPackagesApi }) {
    const { t, direction, number, date } = useSigningLocale();
    const [query, setQuery] = useState('');
    const search = useDebounced(query);
    const [state, setState] = useState('pending');
    const [expanded, setExpanded] = useState(new Set());
    const [selectedPackage, setSelectedPackage] = useState(null);
    const [cursors, setCursors] = useState([null]);
    const cursor = cursors.at(-1);
    const resource = usePagedResource(config => api.list({ state, query: search, cursor }, config), [api, state, search, cursor]);
    useEffect(() => setCursors([null]), [state, search]);
    const toggle = id => setExpanded(previous => {
        const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next;
    });
    return <section className="lw-signingPackages" dir={direction} aria-labelledby="signing-packages-title">
        <header className="lw-signingPackages__heading">
            <div><h1 id="signing-packages-title">{t('signingV2.title')}</h1><p>{t('signingV2.subtitle')}</p></div>
            <div className="lw-signingPackages__actions">
                {onCreate && <PrimaryButton onPress={onCreate}>{t('signingV2.newPackage')}</PrimaryButton>}
                {onClose && <SecondaryButton onPress={onClose}>{t('signingV2.backToDocuments')}</SecondaryButton>}
            </div>
        </header>
        <div className="lw-signingPackages__toolbar">
            <SearchInput title={t('signingV2.search')} aria-label={t('signingV2.search')} value={query} onSearch={setQuery} containerDir={direction} textStyle={{ textAlign: 'start' }} />
            <SegmentedSwitch value={state} onChange={setState} ariaLabel={t('signingV2.statusFilter')}
                options={['pending', 'attention', 'complete', 'cancelled', 'all'].map(value => ({ value, label: t(`signingV2.filter.${value}`) }))} />
            <SecondaryButton disabled={resource.busy} onPress={resource.refresh}>{t('signingV2.refresh')}</SecondaryButton>
        </div>
        <ErrorNotice error={resource.error} onRetry={resource.refresh} />
        <div className="lw-signingPackages__resultSummary" aria-live="polite">
            {resource.busy ? t('common.loading') : t('signingV2.results', { count: resource.data.total, formattedCount: number(resource.data.total) })}
        </div>
        <SimpleCard className="lw-signingPackages__list" aria-busy={resource.busy}>
            {!resource.busy && !resource.data.rows.length && !resource.error && <div className="lw-signingPackages__empty"><h2>{t('signingV2.emptyTitle')}</h2><p>{t('signingV2.emptyBody')}</p></div>}
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
        </SimpleCard>
        <Pager previous={cursors.length > 1} next={resource.data.nextCursor} busy={resource.busy}
            onPrevious={() => setCursors(values => values.slice(0, -1))} onNext={() => setCursors(values => [...values, resource.data.nextCursor])} />
        {selectedPackage && <PackagePanel key={selectedPackage} id={selectedPackage} api={api} onClose={() => setSelectedPackage(null)} />}
    </section>;
}
