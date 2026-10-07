import React, { useEffect, useRef, useState } from 'react';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import useSigningLocale from './useSigningLocale';

export function newKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const FINAL_STATES = new Set(['provider_accepted', 'delivered', 'failed', 'uncertain', 'cancelled', 'skipped_completed', 'bundled']);
const POLL_MS = 1500;

function LastContact({ label, item }) {
    const { t, date } = useSigningLocale();
    if (!item) return <p><span>{label}: </span>{t('signingV2.notYet')}</p>;
    const at = item.attemptedAt || item.createdAt;
    return <p><span>{label}: </span>{t(`signingV2.delivery.${item.state}`)} · <time dateTime={at}>{date(at)}</time></p>;
}

export default function ParticipantActionDialog({ api, packageId, personId, purpose, onClose }) {
    const { t, direction, number, date, errorMessage } = useSigningLocale();
    const dialog = useRef(null);
    const key = useRef(null);
    if (!key.current) key.current = newKey();
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState(null);
    const [phase, setPhase] = useState('loading');
    const [operation, setOperation] = useState(null);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const element = dialog.current;
        if (element.showModal) element.showModal(); else element.setAttribute('open', '');
        const controller = new AbortController();
        api.previewAction(packageId, personId, { purpose }, { signal: controller.signal })
            .then(result => { setPreview(result); setPhase('review'); })
            .catch(failure => { if (!controller.signal.aborted) { setError(failure); setPhase('error'); } });
        return () => { controller.abort(); if (previousFocus?.isConnected) previousFocus.focus?.(); };
    }, [api, packageId, personId, purpose]);

    useEffect(() => {
        if (phase !== 'sent' || !operation || operation.items?.every(item => FINAL_STATES.has(item.state))) return undefined;
        const timer = setTimeout(() => api.operation(operation.operationId).then(setOperation).catch(() => {}), POLL_MS);
        return () => clearTimeout(timer);
    }, [api, phase, operation]);

    const title = useRef(null);
    const result = useRef(null);
    useEffect(() => {
        // The confirm button disappears and a freshly inserted live region is often not announced, so the outcome takes focus.
        if (phase === 'sent') result.current?.focus();
        else if (phase !== 'loading' && phase !== 'sending' && !dialog.current.contains(document.activeElement)) title.current?.focus();
    }, [phase]);

    const inFlight = useRef(false);
    const confirm = async () => {
        // Two clicks can land before React re-renders the disabled button.
        if (inFlight.current) return;
        inFlight.current = true;
        setPhase('sending'); setError(null);
        try {
            const result = await api.executeAction(packageId, personId, { purpose, previewHash: preview.previewHash }, key.current);
            setOperation(result); setPhase('sent');
        } catch (failure) {
            setError(failure);
            // A changed state is shown fresh instead of retrying a decision made on stale data.
            setPhase('review');
            if (['PREVIEW_CHANGED', 'COOLDOWN_ACTIVE', 'MESSAGE_ALREADY_QUEUED', 'PREVIOUS_OUTCOME_UNCERTAIN'].includes(failure.code)) {
                api.previewAction(packageId, personId, { purpose }).then(setPreview).catch(() => {});
                key.current = newKey();
            }
        } finally {
            inFlight.current = false;
        }
    };

    const item = operation?.items?.[0];
    const titleId = `signing-action-${personId}`;
    const dismiss = event => { event.preventDefault(); event.stopPropagation(); if (phase !== 'sending') onClose(Boolean(operation)); };
    return <dialog ref={dialog} className="lw-signingPackages__actionDialog" dir={direction} aria-labelledby={titleId}
        onCancel={dismiss} onKeyDown={event => { if (event.key === 'Escape') dismiss(event); }}>
        <h2 id={titleId} ref={title} tabIndex={-1}>{t(`signingV2.action.${purpose}.title`)}</h2>
        {phase === 'loading' && <p role="status">{t('common.loading')}</p>}
        {error && <div className="lw-signingPackages__error" role="alert"><span>{errorMessage(error)}</span></div>}
        {preview && phase !== 'sent' && <div className="lw-signingPackages__actionBody">
            <dl>
                <div><dt>{t('signingV2.action.recipient')}</dt><dd><strong>{preview.recipient.name}</strong>
                    {preview.recipient.participations.map(item => <small key={`${item.roleKey}:${item.occurrence}`}>
                        {t(`signingV2.capacity.${item.capacity}`)}{item.partyName ? ` · ${item.partyName}` : ''}</small>)}</dd></div>
                <div><dt>{t('signingV2.action.package')}</dt><dd>{preview.package.name}{preview.package.caseName ? ` · ${preview.package.caseName}` : ''}</dd></div>
                <div><dt>{t('signingV2.action.documents')}</dt><dd>
                    <span>{t('signingV2.action.tasks', { count: preview.tasks.length, formattedCount: number(preview.tasks.length) })}</span>
                    <ul>{preview.tasks.map(task => <li key={task.taskId}>{task.documentName}</li>)}</ul></dd></div>
                <div><dt>{t('signingV2.action.destination')}</dt><dd>{preview.destination
                    ? <span>{t(`signingV2.channel.${preview.destination.channel}`)} · <bdi dir="ltr">{preview.destination.masked}</bdi></span>
                    : t('signingV2.action.noDestination')}</dd></div>
            </dl>
            <LastContact label={t('signingV2.action.lastInvitation')} item={preview.lastInvitation} />
            <LastContact label={t('signingV2.action.lastFollowUp')} item={preview.lastFollowUp} />
            {!preview.eligible && <p className="lw-signingPackages__attention" role="status">
                {t(`signingV2.reasons.${preview.reason}`, { time: preview.cooldownUntil ? date(preview.cooldownUntil) : '' })}</p>}
            {preview.eligible && <p>{t(`signingV2.action.${purpose}.effect`)}</p>}
        </div>}
        {phase === 'sent' && item && <div className="lw-signingPackages__actionBody" role="status" ref={result} tabIndex={-1}>
            <p><strong>{item.state === 'queued' ? t('signingV2.action.queued') : t(`signingV2.delivery.${item.state}`)}</strong></p>
            {item.state === 'queued' && <p>{t('signingV2.action.queuedHelp')}</p>}
            {item.state === 'uncertain' && <p>{t('signingV2.uncertainHelp')}</p>}
            {item.state === 'failed' && <p>{t('signingV2.action.failedHelp')}</p>}
        </div>}
        <div className="lw-signingPackages__actionButtons">
            {phase !== 'sent' && preview?.eligible && <PrimaryButton onPress={confirm} disabled={phase === 'sending'}>
                {phase === 'sending' ? t('signingV2.action.sending') : t(`signingV2.action.${purpose}.confirm`)}</PrimaryButton>}
            <SecondaryButton onPress={() => onClose(Boolean(operation))} disabled={phase === 'sending'}>{t('common.close')}</SecondaryButton>
        </div>
    </dialog>;
}
