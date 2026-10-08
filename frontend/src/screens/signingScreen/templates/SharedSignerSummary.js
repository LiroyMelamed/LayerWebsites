import React, { useEffect, useState } from 'react';
import SimpleCard from '../../../components/simpleComponents/SimpleCard';
import StatusNotice from '../../../components/ui/StatusNotice';
import useSigningLocale from './useSigningLocale';

const counts = ['attentionPackages', 'readyPackages', 'waitingPackages', 'completePackages'];
const privateAccessError = error => ['FORBIDDEN', 'NOT_FOUND', 'UNAUTHORIZED', 'ACCESS_CHANGED'].includes(error?.code);

export default function SharedSignerSummary({ api, submissionId }) {
    const { t, direction, number, date, errorMessage } = useSigningLocale();
    const [open, setOpen] = useState(false), [data, setData] = useState(null);
    const [error, setError] = useState(null), [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!open) { setData(null); setError(null); setBusy(false); return undefined; }
        let current = true, sequence = 0;
        const controllers = new Set();
        const load = async () => {
            const request = ++sequence, controller = new AbortController();
            controllers.add(controller); setBusy(true);
            try {
                const summary = await api.participantSummary(submissionId, { signal: controller.signal });
                if (current && request === sequence) { setData(summary); setError(null); }
            } catch (failure) {
                if (current && request === sequence && !controller.signal.aborted) {
                    if (privateAccessError(failure)) setData(null);
                    setError(failure);
                }
            } finally {
                controllers.delete(controller);
                if (current && request === sequence) setBusy(false);
            }
        };
        load();
        const interval = setInterval(() => { if (!document.hidden) load(); }, 8000);
        return () => { current = false; clearInterval(interval); controllers.forEach(controller => controller.abort()); };
    }, [api, submissionId, open]);
    return <SimpleCard className="lw-signingCompose__card" dir={direction}>
        <details aria-label={t('signingV2.sharedSummary.title')} onToggle={event => setOpen(event.currentTarget.open)}>
            <summary style={{ minHeight: 44, cursor: 'pointer' }}>{t('signingV2.sharedSummary.title')}</summary>
            {open && <>
                <p>{t('signingV2.sharedSummary.scope')}</p>
                {busy && !data && <p role="status">{t('common.loading')}</p>}
                {error && <StatusNotice embedded><p>{errorMessage(error)}</p>{data && <p>{t('signingV2.sharedSummary.lastAvailable')}</p>}</StatusNotice>}
                {data && <>
                    <p>{t('signingV2.sharedSummary.asOf')}: <time dateTime={data.asOf}>{date(data.asOf)}</time></p>
                    {!data.rows.length ? <p>{t('signingV2.sharedSummary.empty')}</p> : <ul className="lw-signingPackages__people">{data.rows.map(person => <li key={`${person.personId}:${person.partyId || ''}:${person.capacity}`}>
                        <h3><bdi>{person.name}</bdi></h3>
                        <p>{t(`signingV2.capacity.${person.capacity}`)}{person.partyName && <> · <bdi>{person.partyName}</bdi></>}</p>
                        <p>{t('signingV2.sharedSummary.packageCount', { count: person.packageCount, formattedCount: number(person.packageCount) })}</p>
                        <dl className="lw-signingCompose__summary">{counts.map(key => <div key={key}>
                            <dt>{t(`signingV2.sharedSummary.${key}`)}</dt><dd><bdi>{number(person[key])}</bdi></dd>
                        </div>)}</dl>
                    </li>)}</ul>}
                </>}
            </>}
        </details>
    </SimpleCard>;
}
