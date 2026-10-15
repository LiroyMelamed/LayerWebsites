import React, { useEffect, useRef, useState } from 'react';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import SimpleTextArea from '../../../components/simpleComponents/SimpleTextArea';
import StatusNotice from '../../../components/ui/StatusNotice';
import PdfViewer from '../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer';
import useSigningLocale from './useSigningLocale';
import { newKey } from './ParticipantActionDialog';

export default function PackageApprovalDialog({ api, packageId, onClose }) {
    const { t, direction, errorMessage } = useSigningLocale();
    const dialog = useRef(null), pending = useRef(false), intent = useRef(null);
    const [review, setReview] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
    const [opened, setOpened] = useState(null), [files, setFiles] = useState({}), [confirmed, setConfirmed] = useState(false);
    const [returning, setReturning] = useState(false), [reason, setReason] = useState(''), [saved, setSaved] = useState(null);
    useEffect(() => {
        const previous = document.activeElement, element = dialog.current;
        if (element.showModal) element.showModal(); else element.setAttribute('open', '');
        return () => { if (previous?.isConnected) previous.focus?.(); };
    }, []);
    useEffect(() => {
        let current = true; setReview(null); setError(null); setConfirmed(false); setFiles({}); setOpened(null); setReason(''); intent.current = null;
        api.approvalReview(packageId).then(result => { if (current) setReview(result); }).catch(e => { if (current) setError(e); });
        return () => { current = false; };
    }, [api, packageId, attempt]);
    useEffect(() => {
        if (!opened) return undefined;
        let current = true;
        api.documentFile(packageId, opened).then(blob => { if (current) setFiles(previous => ({ ...previous, [opened]: { blob } })); })
            .catch(e => { if (current) setFiles(previous => ({ ...previous, [opened]: { error: e } })); });
        return () => { current = false; };
    }, [api, packageId, opened]);
    const allLoaded = review?.documents.length > 0 && review.documents.every(document => files[document.id]?.ready);
    const decide = async action => {
        if (pending.current || !review?.ready || (action === 'approve' ? !allLoaded || !confirmed : !reason.trim())) return;
        pending.current = true; setBusy(true); setError(null);
        const body = { action, reviewHash: review.reviewHash, ...(action === 'approve'
            ? { reviewed: true, documents: review.documents.map(({ id, hash, artifactId }) => ({ id, hash, artifactId })) } : { reason: reason.trim() }) };
        const fingerprint = JSON.stringify(body);
        if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: newKey() };
        try { const result = await api.decideApproval(packageId, body, intent.current.key); setSaved(result.state); }
        catch (e) { setError(e); if (['FORBIDDEN', 'NOT_FOUND'].includes(e.code)) { setReview(null); setFiles({}); } }
        finally { pending.current = false; setBusy(false); }
    };
    const dismiss = event => { event?.preventDefault(); event?.stopPropagation(); if (!pending.current) onClose(Boolean(saved)); };
    return <dialog ref={dialog} dir={direction} className="lw-signingPackages__panel lw-signingPackages__approval" aria-labelledby="package-approval-title"
        onCancel={dismiss} onKeyDown={event => { if (event.key === 'Escape') dismiss(event); }}>
        <header className="lw-signingPackages__panelHeader"><h2 id="package-approval-title">{t('signingV2.approval.title')}</h2><SecondaryButton disabled={busy} onPress={dismiss}>{t('common.close')}</SecondaryButton></header>
        {saved ? <p role="status">{t(`signingV2.approval.${saved}`)}</p> : <>
            {!review && !error && <p role="status">{t('common.loading')}</p>}
            {review && <><h3><bdi>{review.name}</bdi></h3><p>{t('signingV2.approval.preparer')}: <bdi>{review.preparer}</bdi></p>
                <p>{t('signingV2.approval.help')}</p>{review.soloProfile && <p>{t('signingV2.approval.soloNotice')}</p>}
                {!review.ready ? <p role="status">{t(`signingV2.approval.state.${review.state}`)}</p> : <>
                    <ul className="lw-signingPackages__people">{review.documents.map(document => <li key={document.id}>
                        <SecondaryButton aria-expanded={opened === document.id} onPress={() => setOpened(current => current === document.id ? null : document.id)}>{document.name}</SecondaryButton>
                        {opened === document.id && <div className="lw-signingPackages__viewer lw-signing-pdfViewerMain">{files[document.id]?.blob
                            ? <PdfViewer pdfFile={files[document.id].blob} spots={[]} onDocumentReady={ready => setFiles(previous => previous[document.id]?.ready === ready ? previous : { ...previous, [document.id]: { ...previous[document.id], ready } })} />
                            : files[document.id]?.error ? <StatusNotice embedded><p>{errorMessage(files[document.id].error)}</p></StatusNotice> : <p role="status">{t('signingV2.public.loadingDocument')}</p>}</div>}
                    </li>)}</ul>
                    <label className="lw-signingPackages__approvalCheck"><input type="checkbox" checked={confirmed} disabled={!allLoaded || busy} onChange={event => setConfirmed(event.target.checked)} />{t('signingV2.approval.reviewed')}</label>
                    {returning && <div className="lw-signingPackages__contactFields"><SimpleTextArea title={t('signingV2.approval.reason')} aria-label={t('signingV2.approval.reason')} style={{ direction }} textStyle={{ textAlign: 'start' }} value={reason} onChange={setReason} maxLength={1000} disabled={busy} /></div>}
                    <div className="lw-signingPackages__actionButtons">
                        {!returning && <PrimaryButton disabled={!confirmed || !allLoaded || busy || error?.code === 'VERSION_CHANGED'} onPress={() => decide('approve')}>{t('signingV2.approval.confirm')}</PrimaryButton>}
                        {returning ? <PrimaryButton disabled={!reason.trim() || busy || error?.code === 'VERSION_CHANGED'} onPress={() => decide('return')}>{t('signingV2.approval.returnConfirm')}</PrimaryButton>
                            : <SecondaryButton disabled={busy} onPress={() => setReturning(true)}>{t('signingV2.approval.return')}</SecondaryButton>}
                    </div>
                </>}{review.reason && <p>{review.reason}</p>}</>}
        </>}
        {error && <StatusNotice embedded><p>{errorMessage(error)}</p></StatusNotice>}
        {!saved && <SecondaryButton disabled={busy} onPress={() => setAttempt(value => value + 1)}>{t('signingV2.refresh')}</SecondaryButton>}
    </dialog>;
}
