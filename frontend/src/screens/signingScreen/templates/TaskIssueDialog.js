import React, { useEffect, useRef, useState } from 'react';
import SimpleTextArea from '../../../components/simpleComponents/SimpleTextArea';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import { newKey } from './ParticipantActionDialog';
import useSigningLocale from './useSigningLocale';
import './TaskIssues.scss';

// The same review form is used by the recipient and the authorized office.
// A response loss retries a frozen note/key; editing creates a new intent.
export default function TaskIssueDialog({ kind, documentName, originalNote, onSubmit, onClose }) {
    const { t, direction, errorMessage } = useSigningLocale();
    const dialog = useRef(null), pending = useRef(false), intent = useRef(null);
    const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(null);
    useEffect(() => {
        const prior = document.activeElement, element = dialog.current;
        if (element.showModal) element.showModal(); else element.setAttribute('open', '');
        return () => { if (prior?.isConnected) prior.focus?.(); };
    }, []);
    const dismiss = event => { event?.preventDefault(); event?.stopPropagation(); if (!pending.current) onClose(false); };
    const submit = async () => {
        if (pending.current || (kind !== 'decline' && !note.trim())) return;
        pending.current = true; setBusy(true); setError(null);
        const value = note.trim();
        if (!intent.current || intent.current.note !== value) intent.current = { note: value, key: newKey() };
        try { await onSubmit(value, intent.current.key); onClose(true); }
        catch (failure) { setError(failure); }
        finally { pending.current = false; setBusy(false); }
    };
    return <dialog ref={dialog} className="lw-signingTaskIssue__dialog" dir={direction} aria-labelledby="signing-issue-title"
        onCancel={dismiss} onKeyDown={event => { if (event.key === 'Escape') dismiss(event); }}>
        <h2 id="signing-issue-title">{t(`signingV2.issue.${kind}Title`)}</h2>
        <p><strong><bdi>{documentName}</bdi></strong></p>
        {originalNote && <blockquote>{originalNote}</blockquote>}
        <p>{t(`signingV2.issue.${kind}Help`)}</p>
        <SimpleTextArea title={t(`signingV2.issue.${kind === 'resolve' ? 'resolution' : kind === 'decline' ? 'optionalReason' : 'reason'}`)}
            aria-label={t(`signingV2.issue.${kind === 'resolve' ? 'resolution' : kind === 'decline' ? 'optionalReason' : 'reason'}`)}
            value={note} onChange={setNote} maxLength={2000} disabled={busy} autoFocus />
        {error && <StatusNotice embedded><p>{errorMessage(error)}</p></StatusNotice>}
        <div className="lw-signingTaskIssue__buttons">
            <PrimaryButton onPress={submit} disabled={busy || (kind !== 'decline' && !note.trim())}>
                {t(busy ? 'common.loading' : `signingV2.issue.${kind}Confirm`)}</PrimaryButton>
            <SecondaryButton onPress={dismiss} disabled={busy}>{t('common.cancel')}</SecondaryButton>
        </div>
    </dialog>;
}
