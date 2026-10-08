import React, { useCallback, useEffect, useRef, useState } from 'react';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import SegmentedSwitch from '../../../components/styledComponents/SegmentedSwitch';
import SearchInput from '../../../components/specializedComponents/containers/SearchInput';
import SimpleCard from '../../../components/simpleComponents/SimpleCard';
import StatusNotice from '../../../components/ui/StatusNotice';
import SigningBackButton from './SigningBackButton';
import useSigningLocale from './useSigningLocale';
import { newKey } from './ParticipantActionDialog';
import './signingPackages.scss';

const sameFilter = (a, b) => a?.state === b.state && a?.query === b.query && (a?.submissionId || '') === (b.submissionId || '');

export default function BulkActionsWorkspace({ api, initialFilter = {}, onClose }) {
    const { t, direction, number, date, errorMessage } = useSigningLocale();
    const [filter, setFilter] = useState({ state: initialFilter.state || 'pending', query: initialFilter.query || '', ...(initialFilter.submissionId ? { submissionId: initialFilter.submissionId } : {}) });
    const [search, setSearch] = useState(initialFilter.query || '');
    const [cursors, setCursors] = useState([null]);
    const [page, setPage] = useState({ rows: [], total: 0 });
    const [pageBusy, setPageBusy] = useState(true);
    const [pageError, setPageError] = useState(null);
    const [reload, setReload] = useState(0);
    const [recent, setRecent] = useState([]);
    const [recentError, setRecentError] = useState(null);
    const [ids, setIds] = useState([]);
    const [selectionFilter, setSelectionFilter] = useState(null);
    const [frozen, setFrozen] = useState(null);
    const [purpose, setPurpose] = useState('reminder');
    const [channel, setChannel] = useState('policy');
    const [phase, setPhase] = useState('choose');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [review, setReview] = useState(null);
    const [reviewStale, setReviewStale] = useState(false);
    const [operation, setOperation] = useState(null);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [accessLost, setAccessLost] = useState(false);
    const [pollAttempt, setPollAttempt] = useState(0);
    const flight = useRef(false);
    const keys = useRef(null);
    if (!keys.current) keys.current = { freeze: newKey(), preview: newKey(), execute: newKey() };
    const heading = useRef(null);
    const freezeBody = useRef(null);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const cursor = cursors.at(-1);
    const changedFilter = ids.length > 0 && !sameFilter(selectionFilter, filter);
    const canSend = page.capabilities?.send === true;
    const channelInput = channel === 'policy' ? undefined : channel;
    const handleAccessFailure = useCallback(failure => {
        if (!['FORBIDDEN', 'NOT_FOUND', 'UNAUTHORIZED'].includes(failure.code)) return false;
        setAccessLost(true); setPage({ rows: [], total: 0 }); setRecent([]); setIds([]);
        setFrozen(null); setReview(null); setOperation(null); setPhase('choose'); setError(failure);
        return true;
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => { setFilter(value => value.query === search ? value : { ...value, query: search }); setCursors([null]); }, 250);
        return () => clearTimeout(timer);
    }, [search]);
    useEffect(() => {
        if (accessLost) return undefined;
        const controller = new AbortController(); setPageBusy(true); setPageError(null);
        api.matchingPackages({ ...filter, cursor, limit: 25 }, { signal: controller.signal }).then(result => {
            if (!controller.signal.aborted) setPage(result);
        }).catch(failure => { if (!controller.signal.aborted) { setPage({ rows: [], total: 0 }); setPageError(failure); handleAccessFailure(failure); } })
            .finally(() => { if (!controller.signal.aborted) setPageBusy(false); });
        return () => controller.abort();
    }, [api, filter, cursor, reload, accessLost, handleAccessFailure]);
    useEffect(() => {
        if (accessLost) return undefined;
        const controller = new AbortController();
        api.bulkOperations({ signal: controller.signal }).then(result => {
            if (!controller.signal.aborted) { setRecent(result.rows); setRecentError(null); }
        }).catch(failure => { if (!controller.signal.aborted) { setRecentError(failure); handleAccessFailure(failure); } });
        return () => controller.abort();
    }, [api, phase, reload, accessLost, handleAccessFailure]);
    useEffect(() => {
        if (phase !== 'operation' || operation?.state !== 'running') return undefined;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            api.bulkOperation(operation.operationId, { signal: controller.signal }).then(result => {
                if (!controller.signal.aborted) { setOperation(result); setUpdatedAt(new Date().toISOString()); setError(null); setPollAttempt(0); }
            }).catch(failure => { if (!controller.signal.aborted) { if (!handleAccessFailure(failure)) { setError(failure); setPollAttempt(n => n + 1); } } });
        }, pollAttempt ? 5000 : 1800);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [api, operation, phase, reload, pollAttempt, handleAccessFailure]);
    useEffect(() => { heading.current?.focus(); }, [phase]);

    const resetReview = () => {
        keys.current = { freeze: newKey(), preview: newKey(), execute: newKey() };
        setFrozen(null); setReview(null); setReviewStale(false); setError(null);
    };
    const clear = () => { setIds([]); setSelectionFilter(null); resetReview(); };
    const select = next => { if (next.length > 1000) { setError({ code: 'SELECTION_TOO_LARGE' }); return; } setIds(next); setSelectionFilter(next.length ? selectionFilter || filter : null); resetReview(); };
    const freeze = body => {
        const fingerprint = JSON.stringify(body);
        if (freezeBody.current !== fingerprint) keys.current.freeze = newKey();
        freezeBody.current = fingerprint;
        return api.freezeSelection(body, keys.current.freeze);
    };
    const allMatching = async () => {
        if (flight.current) return;
        flight.current = true; setBusy(true); setError(null);
        try {
            const selection = await freeze({ mode: 'all_matching', filter });
            if (!mounted.current) return;
            setFrozen(selection); setIds(selection.packages.map(item => item.packageId)); setSelectionFilter(filter); setReview(null);
            keys.current.preview = newKey(); keys.current.execute = newKey();
        } catch (failure) { if (mounted.current) { setError(failure); handleAccessFailure(failure); } }
        finally { flight.current = false; if (mounted.current) setBusy(false); }
    };
    const beginReview = async () => {
        if (flight.current || !ids.length) return;
        flight.current = true; setBusy(true); setError(null);
        try {
            let selection = reviewStale ? null : frozen;
            if (!selection) {
                selection = await freeze({ mode: 'explicit', packageIds: [...ids].sort(), filter: selectionFilter });
                if (mounted.current) setFrozen(selection);
            }
            const result = await api.previewBulk(selection.selectionId, { purpose, channel: channelInput }, keys.current.preview);
            if (mounted.current) { setReview(result); setReviewStale(false); setPhase('review'); }
        } catch (failure) {
            if (mounted.current) {
                setError(failure); handleAccessFailure(failure);
                if (['SELECTION_EXPIRED', 'PREVIEW_CHANGED'].includes(failure.code)) {
                    setFrozen(null); keys.current.freeze = newKey(); keys.current.preview = newKey();
                }
            }
        } finally { flight.current = false; if (mounted.current) setBusy(false); }
    };
    const execute = async () => {
        if (flight.current || reviewStale) return;
        flight.current = true; setBusy(true); setError(null);
        try {
            const result = await api.executeBulk({ reviewId: review.reviewId, previewHash: review.previewHash }, keys.current.execute);
            if (mounted.current) { setOperation(result); setUpdatedAt(new Date().toISOString()); setPhase('operation'); }
        } catch (failure) {
            if (mounted.current) {
                setError(failure); handleAccessFailure(failure);
                if (['SELECTION_EXPIRED', 'PREVIEW_CHANGED', 'SELECTION_ACCESS_CHANGED'].includes(failure.code)) {
                    setReviewStale(true); keys.current = { freeze: newKey(), preview: newKey(), execute: newKey() };
                }
            }
        } finally { flight.current = false; if (mounted.current) setBusy(false); }
    };
    const openOperation = async id => {
        if (flight.current) return;
        flight.current = true; setBusy(true); setError(null);
        try {
            const result = await api.bulkOperation(id);
            if (mounted.current) { setOperation(result); setUpdatedAt(new Date().toISOString()); setPhase('operation'); }
        } catch (failure) { if (mounted.current) { setError(failure); handleAccessFailure(failure); } }
        finally { flight.current = false; if (mounted.current) setBusy(false); }
    };
    const reason = item => t(`signingV2.reasons.${item.reason}`, { defaultValue: t('signingV2.bulk.excludedChanged'), time: item.cooldownUntil ? date(item.cooldownUntil) : '' });
    const packageName = (item, index) => item.packageName || item.package?.name || t('signingV2.bulk.packageNumber', { value: number(index + 1) });
    return <section className="lw-signingPackages lw-signingBulk" dir={direction} aria-labelledby="signing-bulk-title">
        <SigningBackButton onPress={onClose} disabled={busy}>{t('signingV2.bulk.back')}</SigningBackButton>
        <header className="lw-signingPackages__heading"><div>
            <h1 ref={heading} tabIndex={-1} id="signing-bulk-title">{t(`signingV2.bulk.${phase === 'choose' ? 'title' : phase === 'review' ? 'reviewTitle' : 'resultTitle'}`)}</h1>
            <p>{t(`signingV2.bulk.${phase === 'choose' ? 'help' : phase === 'review' ? 'reviewHelp' : 'resultHelp'}`)}</p>
        </div></header>
        {error && <StatusNotice embedded><p>{errorMessage(error)}</p>
            {phase === 'operation' && <SecondaryButton onPress={() => openOperation(operation.operationId)} disabled={busy}>{t('common.retry')}</SecondaryButton>}
        </StatusNotice>}
        {phase === 'choose' && !accessLost && <>
            <div className="lw-signingPackages__toolbar">
                <SearchInput title={t('signingV2.search')} aria-label={t('signingV2.search')} value={search} onSearch={value => { if (!busy) setSearch(value); }} containerDir={direction} textStyle={{ textAlign: 'start' }} />
                <SegmentedSwitch value={filter.state} onChange={state => { if (busy) return; setFilter(value => ({ ...value, state })); setCursors([null]); }} ariaLabel={t('signingV2.statusFilter')}
                    options={['pending', 'attention', 'complete', 'cancelled', 'all'].map(value => ({ value, label: t(`signingV2.filter.${value}`), disabled: busy }))} />
            </div>
            {pageError && <StatusNotice actionLabel={t('common.retry')} onAction={() => setReload(n => n + 1)}><p>{errorMessage(pageError)}</p></StatusNotice>}
            <div className="lw-signingBulk__selection" role="status">
                <strong>{t('signingV2.bulk.selected', { value: number(ids.length) })}</strong>
                {ids.length > 0 && <SecondaryButton disabled={busy} onPress={clear}>{t('signingV2.bulk.clear')}</SecondaryButton>}
                {frozen && <small>{t('signingV2.bulk.expires', { time: date(frozen.expiresAt) })}</small>}
                {changedFilter && <p>{t('signingV2.bulk.previousFilter')}</p>}
            </div>
            {canSend && <div className="lw-signingBulk__buttons">
                <SecondaryButton disabled={busy || pageBusy || changedFilter || search !== filter.query || !page.rows.length}
                    onPress={() => select([...new Set([...ids, ...page.rows.map(item => item.id)])])}>
                    {t('signingV2.bulk.selectPage', { value: number(page.rows.length) })}</SecondaryButton>
                <SecondaryButton disabled={busy || pageBusy || changedFilter || search !== filter.query || !page.total || page.total > 1000}
                    onPress={allMatching}>{t('signingV2.bulk.selectAll', { value: number(page.total) })}</SecondaryButton>
                {page.total > 1000 && <p>{t('signingV2.bulk.narrow')}</p>}
            </div>}
            <SimpleCard className="lw-signingBulk__card" aria-busy={pageBusy}>
                {pageBusy && <p role="status">{t('common.loading')}</p>}
                <ul className="lw-signingBulk__packages">{page.rows.map(item => <li key={item.id}>
                    <label><input type="checkbox" checked={ids.includes(item.id)} disabled={!canSend || busy || pageBusy || changedFilter}
                        onChange={event => select(event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} />
                        <span><strong><bdi>{item.name}</bdi></strong><small>{t(`signingV2.workflow.${item.workflow_state}`)}</small></span></label>
                    <span>{t('signingV2.fraction', { accepted: number(item.accepted_count), required: number(item.required_count) })}</span>
                </li>)}</ul>
                {!pageBusy && !page.rows.length && !pageError && <p>{t('signingV2.noMatchingPackages')}</p>}
            </SimpleCard>
            {(cursors.length > 1 || page.nextCursor) && <nav className="lw-signingPackages__pager" aria-label={t('signingV2.pagination')}>
                <SecondaryButton disabled={busy || pageBusy || cursors.length < 2} onPress={() => setCursors(values => values.slice(0, -1))}>{t('signingV2.previousPage')}</SecondaryButton>
                <SecondaryButton disabled={busy || pageBusy || !page.nextCursor} onPress={() => setCursors(values => [...values, page.nextCursor])}>{t('signingV2.nextPage')}</SecondaryButton>
            </nav>}
            {canSend && <div className="lw-signingBulk__setup">
                <SegmentedSwitch value={purpose} onChange={value => { setPurpose(value); keys.current.preview = newKey(); keys.current.execute = newKey(); }} ariaLabel={t('signingV2.bulk.action')}
                    options={['reminder', 'resend', 'completed_copy'].map(value => ({ value, label: t(`signingV2.action.${value}.title`), disabled: busy }))} />
                <SegmentedSwitch value={channel} onChange={value => { setChannel(value); keys.current.preview = newKey(); keys.current.execute = newKey(); }} ariaLabel={t('signingV2.action.destination')}
                    options={['policy', 'email', 'sms'].map(value => ({ value, label: t(value === 'policy' ? 'signingV2.bulk.policyChannel' : `signingV2.channel.${value}`), disabled: busy }))} />
                <PrimaryButton disabled={busy || !ids.length} onPress={beginReview}>{busy ? t('common.loading') : t('signingV2.bulk.review')}</PrimaryButton>
            </div>}
            <section className="lw-signingBulk__recent" aria-labelledby="signing-bulk-recent"><h2 id="signing-bulk-recent">{t('signingV2.bulk.recent')}</h2>
                {recentError && <StatusNotice onAction={() => setReload(n => n + 1)} actionLabel={t('common.retry')}><p>{errorMessage(recentError)}</p></StatusNotice>}
                <ul>{recent.map(item => <li key={item.id}><SecondaryButton disabled={busy} onPress={() => openOperation(item.id)}>
                    {t(`signingV2.action.${item.purpose}.title`)} · {date(item.createdAt)}</SecondaryButton></li>)}</ul>
                {!recent.length && !recentError && <p>{t('signingV2.bulk.noRecent')}</p>}
            </section>
        </>}
        {phase === 'review' && review && <>
            <dl className="lw-signingBulk__summary">{['packages', 'participations', 'people', 'documents', 'messages'].map(key => <div key={key}>
                <dt>{t(`signingV2.bulk.count.${key}`)}</dt><dd>{number(review.counts[key])}</dd></div>)}</dl>
            <p>{t('signingV2.bulk.expires', { time: date(review.expiresAt) })}</p>
            <ul className="lw-signingBulk__messages">{review.messages.map(message => <li key={message.id}>
                <h2><bdi>{message.recipientName}</bdi></h2><p>{t(`signingV2.channel.${message.destination.channel}`)} · <bdi dir="ltr">{message.destination.masked}</bdi></p>
                <ul>{message.packages.map(item => <li key={`${item.packageId}:${item.personId}`}><strong><bdi>{item.package.name}</bdi></strong>
                    <p>{item.recipient.participations.map(part => <span key={part.id} className="lw-signingBulk__capacity">
                        {t(`signingV2.capacity.${part.capacity}`)}{part.partyName && <> · <bdi>{part.partyName}</bdi></>}</span>)}</p>
                    {item.lastInvitation && <p>{t('signingV2.action.lastInvitation')} · {date(item.lastInvitation.createdAt)} · {t(`signingV2.delivery.${item.lastInvitation.state}`)}</p>}
                    <ul>{[...new Map([...item.tasks, ...item.documents].map(doc => [doc.documentId, doc])).values()].map(doc => <li key={doc.documentId}><bdi>{doc.documentName}</bdi></li>)}</ul>
                </li>)}</ul>
            </li>)}</ul>
            {review.excluded.length > 0 && <section><h2>{t('signingV2.bulk.excluded', { value: number(review.excluded.length) })}</h2>
                <ul className="lw-signingBulk__excluded">{review.excluded.map((item, index) => <li key={`${item.packageId}:${item.personId || index}`}>
                    <bdi>{packageName(item, index)}</bdi><span>{reason(item)}</span></li>)}</ul></section>}
            <div className="lw-signingBulk__buttons">
                {reviewStale ? <PrimaryButton onPress={beginReview} disabled={busy}>{t('signingV2.bulk.reviewAgain')}</PrimaryButton>
                    : <PrimaryButton onPress={execute} disabled={busy || !review.counts.messages}>{busy ? t('signingV2.action.sending') : t('signingV2.bulk.confirm', { value: number(review.counts.messages) })}</PrimaryButton>}
                <SecondaryButton disabled={busy} onPress={() => { setPhase('choose'); setError(null); }}>{t('signingV2.bulk.editSelection')}</SecondaryButton>
            </div>
        </>}
        {phase === 'operation' && operation && <>
            <div role="status"><h2>{t(operation.state === 'running' ? 'signingV2.bulk.processing' : 'signingV2.bulk.finished')}</h2>
                <p>{t('signingV2.bulk.accepted', { value: number(operation.counts.acceptedMessages) })}</p>
                <p>{t('signingV2.bulk.updated', { time: date(updatedAt) })}</p></div>
            <ul className="lw-signingBulk__outcomes">{operation.items.map((item, index) => <li key={`${item.deliveryId}:${item.packageId}`}>
                <strong><bdi>{packageName(item, index)}</bdi></strong><span>{t(item.state === 'queued' ? 'signingV2.action.queued' : `signingV2.delivery.${item.state}`)}</span>
                {item.state === 'uncertain' && <p>{t('signingV2.uncertainHelp')}</p>}
                {item.state === 'cancelled' && <p>{t(`signingV2.actionCancelledReason.${item.errorCode}`, { defaultValue: t('signingV2.actionCancelledReason.other') })}</p>}
            </li>)}</ul>
            {operation.exclusions.length > 0 && <ul className="lw-signingBulk__excluded">{operation.exclusions.map((item, index) => <li key={`${item.packageId}:${item.personId || index}`}>
                <span>{packageName(item, index)}</span><span>{reason(item)}</span></li>)}</ul>}
            <SecondaryButton disabled={busy} onPress={() => { clear(); setOperation(null); setPhase('choose'); setReload(n => n + 1); }}>{t('signingV2.bulk.newSelection')}</SecondaryButton>
        </>}
    </section>;
}
