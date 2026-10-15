import React, { useEffect, useRef, useState } from 'react';
import SimpleTextArea from '../../../components/simpleComponents/SimpleTextArea';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import { newKey } from './ParticipantActionDialog';
import useSigningLocale from './useSigningLocale';

export default function PackageReplacementDialog({ api, packageId, onClose, onStarted }) {
    const { t, direction, number, errorMessage } = useSigningLocale();
    const dialog = useRef(null), pending = useRef(false), intent = useRef(null);
    const [review, setReview] = useState(null), [error, setError] = useState(null);
    const [reason, setReason] = useState(''), [stopCurrent, setStopCurrent] = useState(true);
    const [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
    useEffect(() => {
        const previous = document.activeElement, element = dialog.current;
        if (element.showModal) element.showModal(); else element.setAttribute('open', '');
        return () => { if (previous?.isConnected) previous.focus?.(); };
    }, []);
    useEffect(() => {
        let current = true;
        setReview(null); setError(null); intent.current = null;
        api.replacement(packageId).then(value => {
            if (!current) return;
            setReview(value); setReason(value.reason || '');
            setStopCurrent(value.stopCurrent ?? value.stopDefault ?? true);
        }).catch(failure => { if (current) setError(failure); });
        return () => { current = false; };
    }, [api, packageId, reload]);
    const start = async () => {
        if (pending.current || !review || !reason.trim()) return;
        pending.current = true; setBusy(true); setError(null);
        if (!intent.current) intent.current = { key: newKey(), body: {
            expectedPackageVersion: review.expectedPackageVersion ?? review.packageVersion,
            expectedRevisionId: review.expectedRevisionId ?? review.revisionId,
            sourceReviewHash: review.sourceReviewHash,
            reason: reason.trim(), stopCurrent,
        } };
        try {
            const started = await api.startReplacement(packageId, intent.current.body, intent.current.key);
            onStarted({ ...review, ...started, packageId, reason: intent.current.body.reason, stopCurrent: started.stopCurrent ?? intent.current.body.stopCurrent });
        } catch (failure) {
            setError(failure);
            if (['FORBIDDEN', 'NOT_FOUND', 'ACCESS_CHANGED'].includes(failure.code)) setReview(null);
        } finally { pending.current = false; setBusy(false); }
    };
    const dismiss = event => { event.preventDefault(); event.stopPropagation(); if (!pending.current) onClose(); };
    const changed = ['VERSION_CHANGED', 'REPLACEMENT_CHANGED', 'REVISION_INACTIVE', 'PREVIEW_CHANGED'].includes(error?.code);
    return <dialog ref={dialog} dir={direction} className="lw-signingPackages__actionDialog" aria-labelledby="package-replacement-title"
        onCancel={dismiss} onKeyDown={event => { if (event.key === 'Escape') dismiss(event); }}>
        <h2 id="package-replacement-title">{t('signingV2.replacement.title')}</h2>
        {!review && !error && <p role="status">{t('common.loading')}</p>}
        {review && <div className="lw-signingPackages__contactFields">
            <p>{t('signingV2.replacement.help')}</p>
            <p>{t('signingV2.replacement.preserved', { count: review.acceptedCount, formattedCount: number(review.acceptedCount) })}</p>
            <SimpleTextArea style={{ direction }} textStyle={{ textAlign: 'start' }} title={t('signingV2.replacement.reason')}
                aria-label={t('signingV2.replacement.reason')} value={reason} maxLength={1000} disabled={busy || !!intent.current}
                onChange={setReason} />
            <label className="lw-signingPackages__approvalCheck">
                <input type="checkbox" checked={stopCurrent} disabled={busy || !!intent.current || review.sourceState === 'replacement_pending'}
                    onChange={event => setStopCurrent(event.target.checked)} />
                <span>{t('signingV2.replacement.stop')}</span>
            </label>
            <p>{t(review.sourceState === 'replacement_pending' ? 'signingV2.replacement.stoppedHelp' : stopCurrent ? 'signingV2.replacement.stopPlanHelp' : 'signingV2.replacement.activeHelp')}</p>
        </div>}
        {error && <StatusNotice embedded><p>{errorMessage(error)}</p></StatusNotice>}
        <div className="lw-signingPackages__actionButtons">
            {review && <PrimaryButton onPress={start} disabled={busy || !reason.trim() || changed}>{t(busy ? 'common.loading' : 'signingV2.replacement.start')}</PrimaryButton>}
            {(changed || (!review && error)) && <SecondaryButton onPress={() => setReload(value => value + 1)}>{t('signingV2.refresh')}</SecondaryButton>}
            <SecondaryButton onPress={dismiss} disabled={busy}>{t('common.close')}</SecondaryButton>
        </div>
    </dialog>;
}
