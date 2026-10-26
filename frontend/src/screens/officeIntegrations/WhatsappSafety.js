import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../components/styledComponents/buttons/SecondaryButton';
import SimpleCheckbox from '../../components/simpleComponents/SimpleCheckbox';

const PAUSE_REASONS = new Set([
    'MANUAL_PAUSE', 'RESULT_UNKNOWN', 'PROVIDER_RATE_LIMIT', 'PROVIDER_AUTH',
    'PROVIDER_DISCONNECTED', 'PROVIDER_REJECTED', 'INVALID_SAFETY_STATE',
]);

function timestamp(value) {
    if (!value) return NaN;
    return new Date(value).getTime();
}

export default function WhatsappSafety({ whatsapp, canManage = false, busy = false, onPause, onCheck, onResume }) {
    const { t, i18n } = useTranslation();
    const titleId = useId();
    const [acknowledgedPause, setAcknowledgedPause] = useState(null);
    const language = String(i18n?.resolvedLanguage || i18n?.language || 'he').split('-')[0];
    const locale = { he: 'he-IL', ar: 'ar-IL', en: 'en-GB' }[language] || 'he-IL';
    const tr = (key, values) => t(`officeIntegrations.safety.${key}`, values);
    const safety = whatsapp?.safety;
    // An absent row must not suggest that the office has a saved connection.
    if (!safety) return null;

    const paused = safety.paused === true;
    const pauseKey = paused ? String(safety.pausedAt || '') : null;
    const acknowledged = paused && acknowledgedPause === pauseKey;
    const invalidState = safety.reason === 'INVALID_SAFETY_STATE';
    const freshCheck = whatsapp.connected === true && whatsapp.status === 'ready'
        && Number.isFinite(timestamp(safety.pausedAt))
        && timestamp(whatsapp.lastCheckedAt) > timestamp(safety.pausedAt);
    const hasPendingDispatch = safety.hasPendingDispatch === true;
    const canResume = canManage && paused && !invalidState && !hasPendingDispatch && freshCheck && acknowledged && !busy;
    const reason = PAUSE_REASONS.has(safety.reason) ? safety.reason : 'OTHER';
    const policy = safety.policy || {};
    const number = value => Number.isFinite(value) ? new Intl.NumberFormat(locale).format(value) : '—';
    const duration = (value, unit) => Number.isFinite(value) ? number(value / unit) : '—';
    const nextTime = value => {
        const at = timestamp(value);
        if (paused) return tr('unavailableWhilePaused');
        if (!value) return tr('availableNow');
        if (!Number.isFinite(at)) return tr('timeUnavailable');
        return <time dateTime={new Date(at).toISOString()}>{new Intl.DateTimeFormat(locale, {
            timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short',
        }).format(new Date(at))}</time>;
    };

    return <section className="oi-safety" aria-labelledby={titleId} dir={language === 'en' ? 'ltr' : 'rtl'}>
        <div className="oi-card-heading">
            <h3 id={titleId}>{tr('title')}</h3>
            <span className="oi-badge">{tr(paused ? 'paused' : 'active')}</span>
        </div>
        <p className="oi-muted">{tr('description')}</p>
        {paused && <p role="status" className="oi-safety-reason">{tr(`reasons.${reason}`)}</p>}
        <p className="oi-muted oi-safety-window">{tr('rollingWindow', { hours: duration(policy.rollingWindowMs, 3600000) })}</p>
        <dl className="oi-safety-usage">
            <div><dt>{tr('groups')}</dt><dd><bdi>{tr('usage', { used: number(safety.counts?.groups), limit: number(policy.maxGroupsPerWindow) })}</bdi></dd></div>
            <div><dt>{tr('invites')}</dt><dd><bdi>{tr('usage', { used: number(safety.counts?.invites), limit: number(policy.maxInvitesPerWindow) })}</bdi></dd></div>
        </dl>
        <dl className="oi-safety-times">
            <div><dt>{tr('nextGroup')}</dt><dd>{nextTime(safety.nextGroupAt)}</dd></div>
            <div><dt>{tr('nextInvite')}</dt><dd>{nextTime(safety.nextInviteAt)}</dd></div>
        </dl>
        <p className="oi-muted">{tr('spacing', {
            groupMinutes: duration(policy.groupIntervalMs, 60000),
            mutationSeconds: duration(policy.mutationIntervalMs, 1000),
            recipientMinutes: duration(policy.recipientInviteCooldownMs, 60000),
        })}</p>
        <p className="oi-muted">{tr('unknownDelivery')}</p>
        {canManage && (paused ? <div className="oi-safety-recovery">
            <p className="oi-muted">{tr(invalidState ? 'invalidStateHelp' : hasPendingDispatch ? 'pendingDispatchHelp' : freshCheck ? 'checkReady' : 'checkRequired')}</p>
            <div className="oi-actions">
                <SecondaryButton type="button" disabled={busy} onPress={onCheck}>{tr('checkConnection')}</SecondaryButton>
            </div>
            <SimpleCheckbox className="oi-safety-acknowledgement" title={tr('acknowledgement')}
                checked={acknowledged} disabled={busy || invalidState}
                onChange={event => setAcknowledgedPause(event.target.checked ? pauseKey : null)} />
            <div className="oi-actions">
                <PrimaryButton type="button" disabled={!canResume}
                    onPress={() => { if (canResume) onResume?.({ acknowledged: true }); }}>{tr('resume')}</PrimaryButton>
            </div>
        </div> : <div className="oi-actions">
            <SecondaryButton type="button" disabled={busy} onPress={onPause}>{tr('pause')}</SecondaryButton>
        </div>)}
        {!canManage && <p className="oi-muted">{tr('permissionHelp')}</p>}
    </section>;
}
