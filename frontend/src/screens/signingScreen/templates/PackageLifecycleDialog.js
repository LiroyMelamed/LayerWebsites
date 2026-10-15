import React, { useEffect, useRef, useState } from 'react';
import SimpleInput from '../../../components/simpleComponents/SimpleInput';
import SimpleTextArea from '../../../components/simpleComponents/SimpleTextArea';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import { newKey } from './ParticipantActionDialog';
import useSigningLocale from './useSigningLocale';

export default function PackageLifecycleDialog({ api, packageId, action, onClose }) {
    const { t, direction, number, errorMessage } = useSigningLocale();
    const dialog = useRef(null), pending = useRef(false), intent = useRef(null);
    const [preview, setPreview] = useState(null), [selected, setSelected] = useState([]);
    const [reason, setReason] = useState(''), [error, setError] = useState(null), [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false), [reload, setReload] = useState(0), [reviewing, setReviewing] = useState(action === 'cancel');
    const [search, setSearch] = useState('');
    const sequence = useRef(0);
    useEffect(() => {
        const previous = document.activeElement, element = dialog.current;
        if (element.showModal) element.showModal(); else element.setAttribute('open', '');
        return () => { if (previous?.isConnected) previous.focus?.(); };
    }, []);
    useEffect(() => {
        let current = true;
        setPreview(null); setError(null); setReason(''); intent.current = null; setReviewing(action === 'cancel');
        api.previewPackageAction(packageId, { action }).then(value => {
            if (current) { setPreview(value); setSelected(value.assigneeIds); }
        }).catch(e => { if (current) setError(e); });
        return () => { current = false; sequence.current += 1; };
    }, [api, packageId, action, reload]);
    const review = async () => {
        if (pending.current) return;
        pending.current = true; setBusy(true); setError(null);
        const version = ++sequence.current;
        try {
            const next = await api.previewPackageAction(packageId, { action, assigneeIds: selected });
            if (version === sequence.current) { setPreview(next); setReviewing(true); }
        } catch (e) { if (version === sequence.current) setError(e); }
        finally { pending.current = false; setBusy(false); }
    };
    const confirm = async () => {
        if (pending.current || !preview?.eligible || !reason.trim()) return;
        pending.current = true; setBusy(true); setError(null);
        const body = { action, previewHash: preview.previewHash, reason: reason.trim(), ...(action === 'assign' ? { assigneeIds: preview.assigneeIds } : {}) };
        const fingerprint = JSON.stringify(body);
        if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: newKey() };
        try { await api.executePackageAction(packageId, body, intent.current.key); setSaved(true); }
        catch (e) { setError(e); if (['FORBIDDEN', 'NOT_FOUND'].includes(e.code)) setPreview(null); }
        finally { pending.current = false; setBusy(false); }
    };
    const dismiss = event => { event?.preventDefault(); event?.stopPropagation(); if (!pending.current) onClose(saved); };
    const blocked = ['VERSION_CHANGED', 'ASSIGNEE_UNAVAILABLE'].includes(error?.code);
    return <dialog ref={dialog} dir={direction} className="lw-signingPackages__actionDialog" aria-labelledby="package-lifecycle-title"
        onCancel={dismiss} onKeyDown={event => { if (event.key === 'Escape') dismiss(event); }}>
        <h2 id="package-lifecycle-title">{t(`signingV2.lifecycle.${action}.title`)}</h2>
        {saved ? <p role="status">{t(`signingV2.lifecycle.${action}.saved`)}</p> : <>
            {!preview && !error && <p role="status">{t('common.loading')}</p>}
            {preview && <div className="lw-signingPackages__contactFields">
                <strong><bdi>{preview.name}</bdi></strong>
                <p>{t(`signingV2.lifecycle.${action}.help`)}</p>
                {action === 'cancel' ? <>
                    <p>{t('signingV2.lifecycle.cancel.remaining', { count: preview.remainingCount, formattedCount: number(preview.remainingCount), documents: number(preview.remainingDocuments) })}</p>
                    <p>{t('signingV2.lifecycle.cancel.preserved', { count: preview.acceptedCount, formattedCount: number(preview.acceptedCount) })}</p>
                </> : <>
                    <p>{t('signingV2.lifecycle.assign.owner')}: <bdi>{preview.owner?.name}</bdi></p>
                    <p>{t('signingV2.lifecycle.assign.current')}: {preview.assignments.map(u => u.name).join(', ') || t('signingV2.lifecycle.assign.none')}</p>
                    {!reviewing ? <fieldset className="lw-signingPackages__assignees"><legend>{t('signingV2.lifecycle.assign.select')}</legend>
                        <SimpleInput title={t('signingV2.lifecycle.assign.search')} aria-label={t('signingV2.lifecycle.assign.search')} value={search} onChange={event=>setSearch(event.target.value)} timeToWaitInMilli={0} containerDir={direction} dir={direction} textStyle={{textAlign:'start'}} />
                        {preview.eligibleUsers.filter(user=>user.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(user => <label key={user.id}><input type="checkbox" checked={selected.includes(user.id)} disabled={busy}
                            onChange={event => setSelected(ids => event.target.checked ? [...ids, user.id] : ids.filter(id => id !== user.id))} /><bdi>{user.name}</bdi></label>)}
                    </fieldset> : <p>{t('signingV2.lifecycle.assign.next')}: {preview.eligibleUsers.filter(u => preview.assigneeIds.includes(u.id)).map(u => u.name).join(', ') || t('signingV2.lifecycle.assign.none')}</p>}
                </>}
                {reviewing && <>
                    {!preview.eligible && <StatusNotice embedded><p>{errorMessage({ code: preview.reason })}</p></StatusNotice>}
                    {preview.eligible && <SimpleTextArea style={{ direction }} textStyle={{ textAlign: 'start' }} title={t('signingV2.lifecycle.reason')}
                        aria-label={t('signingV2.lifecycle.reason')} value={reason} onChange={setReason} maxLength={1000} disabled={busy} />}
                </>}
            </div>}
        </>}
        {error && <StatusNotice embedded><p>{errorMessage(error)}</p></StatusNotice>}
        <div className="lw-signingPackages__actionButtons">
            {!saved && preview && !reviewing && <PrimaryButton onPress={review} disabled={busy}>{t('signingV2.lifecycle.assign.review')}</PrimaryButton>}
            {!saved && reviewing && preview?.eligible && <PrimaryButton onPress={confirm} disabled={busy || !reason.trim() || blocked}>{t(busy ? 'common.loading' : `signingV2.lifecycle.${action}.confirm`)}</PrimaryButton>}
            {!saved && action === 'assign' && reviewing && preview && <SecondaryButton disabled={busy} onPress={() => { setReviewing(false); setReason(''); }}>{t('signingV2.lifecycle.assign.edit')}</SecondaryButton>}
            {blocked && <SecondaryButton onPress={() => setReload(value => value + 1)}>{t('signingV2.refresh')}</SecondaryButton>}
            <SecondaryButton onPress={dismiss} disabled={busy}>{t('common.close')}</SecondaryButton>
        </div>
    </dialog>;
}
