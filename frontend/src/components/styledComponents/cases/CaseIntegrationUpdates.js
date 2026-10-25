import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { officeIntegrationsApi } from '../../../api/officeIntegrationsApi';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';
import SecondaryButton from '../buttons/SecondaryButton';
import CourtFileImportDialog from './CourtFileImportDialog';
import '../../../screens/officeIntegrations/OfficeIntegrations.scss';
export default function CaseIntegrationUpdates({ caseId }) {
    const { t, i18n } = useTranslation();
    const [record, setRecord] = useState(null), [failure, setFailure] = useState(null), [notice, setNotice] = useState(null);
    const [open, setOpen] = useState(false), [downloading, setDownloading] = useState(null);
    const generation = useRef(0), currentCase = useRef(caseId), downloadingRef = useRef(false), mounted = useRef(true);
    currentCase.current = caseId;
    const language = String(i18n?.resolvedLanguage || i18n?.language || 'he').split('-')[0];
    const locale = { he: 'he-IL', ar: 'ar-IL', en: 'en-GB' }[language] || 'he-IL';
    const tr = key => t(`officeIntegrations.courtImport.${key}`);
    const data = record?.caseId === caseId ? record.value : null;
    const failed = failure?.caseId === caseId;
    const load = useCallback(async () => {
        const expected = ++generation.current;
        setFailure(null);
        try {
            const value = await officeIntegrationsApi.caseUpdates(caseId);
            if (!value || !Array.isArray(value.updates)) throw new Error('INVALID_CASE_UPDATES');
            if (mounted.current && expected === generation.current && currentCase.current === caseId) setRecord({ caseId, value });
        } catch (error) {
            if (mounted.current && expected === generation.current && currentCase.current === caseId) {
                if (error?.status === 403 || error?.status === 404) setRecord(null);
                setFailure({ caseId });
            }
        }
    }, [caseId]);
    useEffect(() => {
        mounted.current = true;
        setOpen(false); setNotice(null); setDownloading(null); downloadingRef.current = false;
        void load();
        return () => { mounted.current = false; };
    }, [load]);
    const importAllowed = Boolean(!failed && data?.courtImport?.canImport && data.courtImport.enabled && data.courtImport.courtNumber);
    const download = async item => {
        if (downloadingRef.current || !item.document_id) return;
        downloadingRef.current = true; setDownloading(item.document_id); setNotice(null);
        try {
            const file = await officeIntegrationsApi.courtDocument(caseId, item.document_id);
            if (!mounted.current || currentCase.current !== caseId) return;
            if (!(file instanceof Blob) || file.size === 0 || file.type !== 'application/pdf') throw new Error('INVALID_COURT_DOCUMENT');
            await downloadBlobAsFile(file, item.source_filename || 'court-decision.pdf');
        } catch (_) { if (mounted.current && currentCase.current === caseId) setNotice({ caseId, text: tr('downloadFailed'), error: true }); }
        finally {
            if (mounted.current && currentCase.current === caseId) { downloadingRef.current = false; setDownloading(null); }
        }
    };
    const imported = result => {
        if (!mounted.current || currentCase.current !== caseId) return;
        setOpen(false); setNotice({ caseId, text: tr(result.imported ? 'imported' : 'alreadyImported') });
        void load();
    };
    const date = value => {
        if (!value || !Number.isFinite(+new Date(value))) return null;
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
    };
    if (!data && !failed) return null;
    if (!data?.updates.length && !data?.group && !importAllowed && !failed) return null;
    return <section className="office-integrations oi-embedded oi-case-updates" dir={language === 'en' ? 'ltr' : 'rtl'}><div className="oi-card">
        {(Boolean(data?.updates.length) || importAllowed) && <div className="oi-card-heading"><h3>{t('officeIntegrations.courtUpdates')}</h3>
            {importAllowed && <SecondaryButton onPress={() => setOpen(true)}>{tr('open')}</SecondaryButton>}</div>}
        {notice?.caseId === caseId && <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
        {failed && <div className="oi-case-updates-retry"><p role="alert">{t('officeIntegrations.caseLoadFailed')}</p>
            <SecondaryButton onPress={load}>{t('common.retry')}</SecondaryButton></div>}
        {data?.updates.map(item => <article key={item.id}>
            <div className="oi-case-update-heading"><strong>{item.title}</strong>
                {item.is_demo === true && <span className="oi-badge">{t('officeIntegrations.demo')}</span>}
                {item.source_kind === 'owner_file' && <span className="oi-badge">{tr('manualSource')}</span>}
            </div>
            {date(item.issued_on || item.occurred_at) && <p className="oi-case-update-date">{date(item.issued_on || item.occurred_at)}</p>}
            {item.body && <p>{item.body}</p>}
            {item.source_kind === 'owner_file' && item.document_id && <SecondaryButton onPress={() => download(item)}
                disabled={Boolean(downloading)} isPerforming={downloading === item.document_id} aria-label={tr('downloadNamed') + ' ' + item.title}>{tr('download')}</SecondaryButton>}
        </article>)}
        {data?.group && <p>WhatsApp: {t(`officeIntegrations.statuses.${data.group.status}`)} {data.group.mode === 'demo' && `(${t('officeIntegrations.demo')})`}</p>}
        {data?.group?.error_code?.startsWith('MANAGER_PHONE_') && <p className="oi-note">{t('officeIntegrations.managerPhoneIssue')}</p>}
    </div>{open && importAllowed && <CourtFileImportDialog key={`${caseId}:${data.courtImport.courtNumber}`} caseId={caseId}
        courtNumber={data.courtImport.courtNumber} maxBytes={data.courtImport.maxBytes}
        onClose={() => setOpen(false)} onImported={imported} />}</section>;
}
