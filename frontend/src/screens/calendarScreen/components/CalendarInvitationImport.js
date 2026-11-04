import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import calendarApi from '../../../api/calendarApi';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import './CalendarInvitationImport.scss';

export default function CalendarInvitationImport({ onImported, onClose }) {
    const { t, i18n } = useTranslation();
    const [content, setContent] = useState('');
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    async function chooseFile(event) {
        const file = event.target.files?.[0];
        setPreview(null); setResult(null); setContent(''); setError('');
        if (!file) return;
        if (!/\.ics$/i.test(file.name) || file.size > 512 * 1024) { setError(t('calendar.importInviteInvalidFile')); return; }
        setBusy(true);
        try {
            const text = await file.text();
            const response = await calendarApi.importInvitation(text, true);
            if (!response.success) throw new Error(response.data?.message || response.message || t('calendar.importInviteError'));
            setContent(text); setPreview(response.data);
        } catch (err) { setError(err.message || t('calendar.importInviteError')); }
        finally { setBusy(false); }
    }
    async function save() {
        setBusy(true); setError('');
        try {
            const response = await calendarApi.importInvitation(content, false);
            if (!response.success) throw new Error(response.data?.message || response.message || t('calendar.importInviteError'));
            setResult(response.data); setPreview(null); setContent(''); onImported?.();
        } catch (err) { setError(err.message || t('calendar.importInviteError')); }
        finally { setBusy(false); }
    }
    const dateLabel = item => item.startTime ? new Intl.DateTimeFormat(i18n.language || 'he', {
        timeZone: 'Asia/Jerusalem', dateStyle: 'medium', ...(item.allDay ? {} : { timeStyle: 'short' }),
    }).format(new Date(item.startTime)) : '';
    return <section className="lw-calendarInvitationImport" aria-busy={busy}>
        <h2>{t('calendar.importInviteTitle')}</h2>
        <p>{t('calendar.importInviteHint')}</p>
        <label className="lw-calendarInvitationImport__file">
            {t('calendar.importInviteChoose')}
            <input type="file" accept=".ics,text/calendar" onChange={chooseFile} disabled={busy} />
        </label>
        {busy && <p role="status">{t('calendar.importInviteLoading')}</p>}
        {error && <p role="alert">{error}</p>}
        {preview && <>
            <p>{t('calendar.importInvitePreview', { count: preview.events.length })}</p>
            <ul className="lw-calendarInvitationImport__events">{preview.events.map((item, index) => <li key={`${item.uid}:${index}`}>
                <strong>{item.title}</strong>
                <span>{dateLabel(item)}{item.location ? ` · ${item.location}` : ''}</span>
                <span>{t('calendar.importInviteOrganizer')}: {item.organizer}</span>
                {item.cancelled && <strong>{t('calendar.importInviteCancellation')}</strong>}
            </li>)}</ul>
            {preview.outsideWindow > 0 && <p>{t('calendar.importInviteOutside', { count: preview.outsideWindow })}</p>}
        </>}
        {result && <p role="status">{t('calendar.importInviteResult', result)}</p>}
        <footer>
            {preview?.events.length > 0 && <PrimaryButton onPress={save} disabled={busy}>{t('calendar.importInviteConfirm')}</PrimaryButton>}
            <SecondaryButton onPress={onClose} disabled={busy}>{t('common.close')}</SecondaryButton>
        </footer>
    </section>;
}
