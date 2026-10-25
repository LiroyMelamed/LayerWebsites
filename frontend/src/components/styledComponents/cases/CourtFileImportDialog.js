import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SimplePopUp from '../../simpleComponents/SimplePopUp';
import SimpleInput from '../../simpleComponents/SimpleInput';
import SimpleCheckbox from '../../simpleComponents/SimpleCheckbox';
import PrimaryButton from '../buttons/PrimaryButton';
import SecondaryButton from '../buttons/SecondaryButton';
import { officeIntegrationsApi } from '../../../api/officeIntegrationsApi';

const MAX_BYTES = 5 * 1024 * 1024;
export function courtImportErrorKey(error) {
    if (error?.status === 403 || error?.code === 'FORBIDDEN') return 'forbidden';
    if (error?.status === 413 || error?.code === 'LIMIT_FILE_SIZE') return 'fileTooLarge';
    if (error?.code === 'COURT_REFERENCE_CHANGED') return 'referenceChanged';
    if (error?.code === 'COURT_IMPORT_ACTION_CONFLICT') return 'actionConflict';
    if (error?.code === 'COURT_IMPORT_ACTION_STALE') return 'actionStale';
    if (error?.code === 'COURT_IMPORT_PDF_INVALID') return 'invalidPdf';
    if (error?.code === 'COURT_IMPORT_SOURCE_CONFIRMATION_REQUIRED') return 'sourceConfirmationRequired';
    if (error?.code === 'COURT_OWNER_IMPORT_DISABLED') return 'unavailable';
    return 'failed';
}

export default function CourtFileImportDialog({ caseId, courtNumber, maxBytes = MAX_BYTES, onClose, onImported }) {
    const { t, i18n } = useTranslation();
    const tr = key => t(`officeIntegrations.courtImport.${key}`);
    const headingId = useId(), fileRef = useRef(null), action = useRef(null), inFlight = useRef(false), mounted = useRef(true);
    const [file, setFile] = useState(null), [issuedOn, setIssuedOn] = useState('');
    const [title, setTitle] = useState(tr('defaultTitle')), [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const language = String(i18n?.resolvedLanguage || i18n?.language || 'he').split('-')[0];
    const direction = language === 'en' ? 'ltr' : 'rtl';
    const limit = Math.min(MAX_BYTES, Number(maxBytes) || MAX_BYTES);

    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const changed = () => { action.current = null; setError(''); };
    const selectFile = event => {
        const selected = event.target.files?.[0];
        event.target.value = '';
        if (!selected || inFlight.current) return;
        changed();
        if (!/\.pdf$/i.test(selected.name) || (selected.type && selected.type !== 'application/pdf')) {
            setFile(null); setError('invalidPdf'); return;
        }
        if (!selected.size || selected.size > limit) {
            setFile(null); setError(selected.size > limit ? 'fileTooLarge' : 'invalidPdf'); return;
        }
        setFile(selected); setConfirmed(false);
    };
    const save = async event => {
        event.preventDefault();
        if (inFlight.current || !file || !confirmed || !title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(issuedOn)) return;
        inFlight.current = true; setBusy(true); setError('');
        try {
            if (!action.current) action.current = { actionId: crypto.randomUUID(), file, issuedOn, title: title.trim() };
            const frozen = action.current;
            const body = new FormData();
            for (const [key, value] of Object.entries({ caseId, courtNumber, issuedOn: frozen.issuedOn, title: frozen.title, actionId: frozen.actionId, sourceConfirmed: 'true' })) body.append(key, String(value));
            body.append('file', frozen.file, frozen.file.name);
            const result = await officeIntegrationsApi.importCourtFile(body);
            if (!result?.ok || result.sourceKind !== 'owner_file' || result.automaticConnected !== false ||
                typeof result.imported !== 'boolean' || Number(result.caseId) !== Number(caseId) || result.courtNumber !== courtNumber) throw new Error('INVALID_IMPORT_RECEIPT');
            if (mounted.current) onImported(result);
        } catch (failure) {
            if (mounted.current) {
                if (failure?.status === 409 && failure?.code === 'COURT_IMPORT_ACTION_STALE') {
                    action.current = null;
                    setConfirmed(false);
                }
                setError(courtImportErrorKey(failure));
            }
        } finally {
            inFlight.current = false;
            if (mounted.current) setBusy(false);
        }
    };

    return <SimplePopUp isOpen onClose={busy ? undefined : onClose} className="oi-court-import-popup"
        role="dialog" aria-modal="true" aria-labelledby={headingId} dir={direction}>
        <form className="oi-court-import-form" onSubmit={save} aria-busy={busy}>
            <h3 id={headingId}>{tr('title')}</h3>
            <p>{tr('help')}</p>
            <p className="oi-court-import-reference">{tr('caseNumber')} <bdi dir="ltr">{courtNumber}</bdi></p>
            <input ref={fileRef} type="file" hidden accept=".pdf,application/pdf" aria-label={tr('chooseFile')}
                onChange={selectFile} disabled={busy} />
            <div className="oi-court-import-file">
                <SecondaryButton type="button" onPress={() => fileRef.current?.click()} disabled={busy}>{tr(file ? 'replaceFile' : 'chooseFile')}</SecondaryButton>
                <p>{file ? file.name : tr('fileHint')}</p>
            </div>
            <SimpleInput title={tr('documentTitle')} value={title} disabled={busy} maxLength={160} timeToWaitInMilli={0}
                containerDir={direction} onChange={event => { changed(); setTitle(event.target.value); }} />
            <SimpleInput type="date" title={tr('issuedOn')} value={issuedOn} disabled={busy} timeToWaitInMilli={0}
                containerDir={direction} onChange={event => { changed(); setIssuedOn(event.target.value); }} />
            <SimpleCheckbox className="oi-court-import-confirm" checked={confirmed} disabled={busy}
                title={tr('confirmSource')} onChange={event => { setConfirmed(event.target.checked); setError(''); }} />
            {error && <p role="alert">{tr(error)}</p>}
            {busy && <p role="status">{tr('uploading')}</p>}
            <div className="oi-court-import-actions">
                <SecondaryButton type="button" onPress={onClose} disabled={busy}>{t('common.cancel')}</SecondaryButton>
                <PrimaryButton type="submit" disabled={busy || !file || !confirmed || !title.trim() || !issuedOn} isPerforming={busy}>{tr('submit')}</PrimaryButton>
            </div>
        </form>
    </SimplePopUp>;
}
