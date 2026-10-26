import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { officeIntegrationsApi as api } from '../../api/officeIntegrationsApi';
import SimpleCard from '../../components/simpleComponents/SimpleCard';
import SimpleCheckbox from '../../components/simpleComponents/SimpleCheckbox';
import SimpleInput from '../../components/simpleComponents/SimpleInput';
import SimpleTextArea from '../../components/simpleComponents/SimpleTextArea';
import PrimaryButton from '../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../components/styledComponents/buttons/SecondaryButton';
import { TextBold18 } from '../../components/specializedComponents/text/AllTextKindFile';

const SESSION_STATUSES = new Set(['disconnected', 'starting', 'qr', 'connected', 'failed']);
const POLL_INTERVAL = 4000;
const POLL_WINDOW = 120000;
const ERROR_REASONS = new Set(['CONNECTION_START_UNKNOWN', 'CONNECTION_FAILED', 'PROVIDER_RESTRICTED',
    'PROVIDER_INCOMPATIBLE', 'PHONE_CONFLICT', 'RECONNECT_REQUIRED', 'DISCONNECT_UNKNOWN']);

// The server supplies PNG pixels. Never render a provider URL, SVG, or arbitrary data URL.
function safeQr(value) {
    return typeof value === 'string' && value.length < 1500000
        && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
}

function session(value) {
    const source = value?.linkedDevice || value || {};
    const status = source.sessionStatus || source.status;
    return { ...source, sessionStatus: SESSION_STATUSES.has(status) ? status : 'disconnected' };
}

export default function WhatsappLinkedDevice({ linkedDevice, canManage = false, busy = false, embedded = false, otherConnection = false, onConnectionChanged, onBusyChange, onContactPermission, onReviewGroups }) {
    const { t, i18n } = useTranslation();
    const titleId = useId();
    const tr = key => t(`officeIntegrations.linkedDevice.${key}`);
    const language = String(i18n?.resolvedLanguage || i18n?.language || 'he').split('-')[0];
    const providerGeneration = linkedDevice?.connectionGeneration;
    const previousGeneration = useRef(providerGeneration);
    const [current, setCurrent] = useState(() => session(linkedDevice));
    const [unofficialAccepted, setUnofficialAccepted] = useState(false);
    const [permissionsAccepted, setPermissionsAccepted] = useState(false);
    const [pending, setPending] = useState(false);
    const [qr, setQr] = useState('');
    const [error, setError] = useState('');
    const [pollStopped, setPollStopped] = useState(false);
    const [contactPhone, setContactPhone] = useState('');
    const [permissionEvidence, setPermissionEvidence] = useState('');
    const [contactAcknowledged, setContactAcknowledged] = useState(false);
    const operation = useRef(0);
    const mounted = useRef(true);
    const pollDeadline = useRef(0);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; operation.current += 1; };
    }, []);
    useEffect(() => {
        setCurrent(session(linkedDevice));
    }, [linkedDevice]);
    useEffect(() => {
        if (previousGeneration.current === providerGeneration) return;
        previousGeneration.current = providerGeneration;
        operation.current += 1;
        setQr('');
        setUnofficialAccepted(false);
        setPermissionsAccepted(false);
        setContactAcknowledged(false);
        setPollStopped(false);
        pollDeadline.current = 0;
    }, [providerGeneration]);

    const status = current.sessionStatus;
    const waiting = status === 'starting' || status === 'qr';
    const applyResult = useCallback(value => {
        const next = session(value);
        setCurrent(previous => ({ ...previous, ...next }));
        setQr(next.sessionStatus === 'qr' ? safeQr(value?.qrDataUrl) : '');
        return next;
    }, []);

    useEffect(() => {
        if (!waiting || busy || pending || pollStopped || !canManage) return undefined;
        let cancelled = false;
        let timer;
        const expected = operation.current;
        if (!pollDeadline.current) pollDeadline.current = Date.now() + POLL_WINDOW;
        const poll = async () => {
            if (cancelled || operation.current !== expected) return;
            if (Date.now() >= pollDeadline.current) { setQr(''); setPollStopped(true); return; }
            try {
                const result = await api.linkedDeviceQr();
                if (cancelled || !mounted.current || operation.current !== expected) return;
                const next = applyResult(result);
                if (next.sessionStatus !== 'starting' && next.sessionStatus !== 'qr') {
                    await onConnectionChanged?.();
                    return;
                }
                timer = setTimeout(poll, POLL_INTERVAL);
            } catch {
                if (!cancelled && mounted.current && operation.current === expected) {
                    setQr(''); setError('requestFailed'); setPollStopped(true);
                }
            }
        };
        // Polling only observes this session. It never starts or reconnects a device.
        timer = setTimeout(poll, POLL_INTERVAL);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [waiting, busy, pending, pollStopped, canManage, applyResult, onConnectionChanged, providerGeneration]);

    async function perform(kind) {
        if (!canManage || busy || pending) return;
        if (kind === 'start' && (!unofficialAccepted || !permissionsAccepted || !current.configured || !current.enabled || otherConnection)) return;
        const expected = ++operation.current;
        setPending(true); onBusyChange?.(true); setError(''); setQr(''); setPollStopped(false);
        pollDeadline.current = Date.now() + POLL_WINDOW;
        try {
            const result = kind === 'start'
                ? await api.startLinkedDevice(undefined, { acknowledgeUnofficial: true, acknowledgePermissions: true })
                : kind === 'disconnect' ? await api.disconnectLinkedDevice() : await api.checkLinkedDevice();
            if (!mounted.current || operation.current !== expected) return;
            applyResult(result);
            await onConnectionChanged?.();
        } catch {
            if (mounted.current && operation.current === expected) { setError('requestFailed'); setPollStopped(true); }
        } finally {
            if (mounted.current) { setPending(false); onBusyChange?.(false); }
        }
    }

    if (!linkedDevice) return null;
    const disabled = busy || pending;
    return <SimpleCard className="lw-platformSettings__card oi-card oi-linked-device" role="region" aria-labelledby={titleId} dir={language === 'en' ? 'ltr' : 'rtl'}>
        <div className="oi-card-heading"><TextBold18 id={titleId} role="heading" aria-level={embedded ? 3 : 2}>{tr('title')}</TextBold18><span className="oi-badge">{tr('optional')}</span></div>
        <p>{tr('description')}</p>
        <div className="oi-note"><strong>{tr('unofficialTitle')}</strong><p>{tr('riskNotice')}</p></div>
        <div className="oi-connection-status" role="status" aria-live="polite"><span className={`oi-status-dot ${status === 'connected' ? 'is-connected' : ''}`} aria-hidden="true" /><span>{tr('status')}: <strong>{tr(`statuses.${status}`)}</strong></span>{status === 'connected' && current.displayPhone && <bdi>{current.displayPhone}</bdi>}</div>
        {error && <p role="alert" className="oi-linked-device-error">{tr(error)}</p>}
        {current.lastError && !error && <p className="oi-muted">{tr(ERROR_REASONS.has(current.lastError) ? `errors.${current.lastError}` : 'failedHelp')}</p>}
        {status === 'failed' && !current.lastError && !error && <p className="oi-muted">{tr('failedHelp')}</p>}
        {(!current.configured || !current.enabled) && <p className="oi-muted">{tr('unavailable')}</p>}
        {otherConnection && <p className="oi-muted">{tr('otherConnection')}</p>}
        {canManage && ((current.configured && current.enabled) || status !== 'disconnected') && <>
            {status === 'disconnected' && <>
                <SimpleCheckbox className="oi-linked-device-acknowledgement" title={tr('unofficialAcknowledgement')} checked={unofficialAccepted} disabled={disabled} onChange={event => setUnofficialAccepted(event.target.checked)} />
                <SimpleCheckbox className="oi-linked-device-acknowledgement" title={tr('permissionsAcknowledgement')} checked={permissionsAccepted} disabled={disabled} onChange={event => setPermissionsAccepted(event.target.checked)} />
                <div className="oi-actions"><PrimaryButton type="button" disabled={disabled || otherConnection || !unofficialAccepted || !permissionsAccepted} onPress={() => perform('start')}>{tr(pending ? 'working' : 'start')}</PrimaryButton></div>
            </>}
            {waiting && <div className="oi-linked-device-pairing">
                <ol className="oi-steps"><li>{tr('stepOpen')}</li><li>{tr('stepSettings')}</li><li>{tr('stepLinkedDevices')}</li><li>{tr('stepLinkDevice')}</li><li>{tr('stepScan')}</li></ol>
                <div className="oi-linked-device-qr">{qr ? <img src={qr} alt={tr('qrAlt')} width="256" height="256" /> : <p role="status">{tr(pollStopped ? 'pollStopped' : 'preparingQr')}</p>}</div>
                <p className="oi-muted">{tr('qrPrivacy')}</p>
                <p className="oi-muted">{tr('samePhoneHelp')}</p>
            </div>}
            {(waiting || status === 'connected' || status === 'failed') && <div className="oi-actions">
                <SecondaryButton type="button" disabled={disabled} onPress={() => perform('check')}>{tr(pending ? 'working' : 'check')}</SecondaryButton>
                <SecondaryButton type="button" disabled={disabled} onPress={() => perform('disconnect')}>{tr('disconnect')}</SecondaryButton>
            </div>}
            {status === 'connected' && <p className="oi-muted">{tr(current.liveEnabled ? 'connectedHelp' : 'liveUnavailable')}</p>}
            {status === 'connected' && <details className="oi-details oi-linked-device-permissions"><summary>{tr('permissionTitle')}</summary>
                <p className="oi-muted">{tr('permissionHelp')}</p>
                <SimpleInput title={tr('permissionPhone')} aria-label={tr('permissionPhone')} type="tel" dir="ltr" value={contactPhone} maxLength={40} timeToWaitInMilli={0} disabled={disabled} onChange={event => { setContactPhone(event.target.value); setPermissionEvidence(''); setContactAcknowledged(false); }} />
                <SimpleTextArea title={tr('permissionEvidence')} aria-label={tr('permissionEvidence')} rows={2} value={permissionEvidence} maxLength={300} disabled={disabled} onChange={value => { setPermissionEvidence(value); setContactAcknowledged(false); }} />
                <p className="oi-muted">{tr('permissionEvidenceHelp')}</p>
                <SimpleCheckbox className="oi-linked-device-acknowledgement" title={tr('permissionAcknowledgement')} checked={contactAcknowledged} disabled={disabled} onChange={event => setContactAcknowledged(event.target.checked)} />
                <div className="oi-actions">
                    <PrimaryButton type="button" disabled={disabled || !onContactPermission || !contactPhone.trim() || !contactAcknowledged || permissionEvidence.trim().length < 5 || permissionEvidence.trim().length > 300} onPress={() => onContactPermission?.({ phone: contactPhone.trim(), allowed: true, evidence: permissionEvidence.trim() })}>{tr('permissionAllow')}</PrimaryButton>
                    <SecondaryButton type="button" disabled={disabled || !onContactPermission || !contactPhone.trim()} onPress={() => onContactPermission?.({ phone: contactPhone.trim(), allowed: false, evidence: tr('permissionBlockReason') })}>{tr('permissionBlock')}</SecondaryButton>
                </div>
                <p className="oi-muted">{tr('permissionBlockHelp')}</p>
                <p className="oi-muted">{tr('recheckHelp')}</p>
                <div className="oi-actions"><SecondaryButton type="button" disabled={disabled || !onReviewGroups} onPress={onReviewGroups}>{tr('recheck')}</SecondaryButton></div>
            </details>}
        </>}
        {!canManage && <p className="oi-muted">{tr('adminPermissionHelp')}</p>}
    </SimpleCard>;
}
