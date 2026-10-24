import React, { useCallback, useEffect, useRef, useState } from 'react';
import signingStageAutomationApi from '../../../api/signingStageAutomationApi';
import signingPackagesApi from '../../../api/signingPackagesApi';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import SigningSelect from './SigningSelect';
import useSigningLocale from './useSigningLocale';
import ApprovalReviewerField from './ApprovalReviewerField';
import SigningPackagesWorkspace from './SigningPackagesWorkspace';
import { RolePeople, DocumentDataFields, SigningOrderFields, changePerson, blankRole, clean, templateOrder } from './PackageComposer';
import './caseStageAutomation.scss';

function boundPerson(person, language) {
    if (Array.isArray(person?.people)) return { people: person.people.map(item => boundPerson(item, language)) };
    return { ...clean(person || {}, language), ...(person?.contactUserId && !person.sameAsRole ? { contactUserId: person.contactUserId } : {}) };
}

function hydratePerson(person) {
    if (Array.isArray(person?.people)) return { ...person, people: person.people.map(hydratePerson) };
    // Saved rules omit the automatic channel; the editor selects it with ''.
    return { ...person, channel: person?.channel ?? '' };
}
const hydrateRoles = roles => Object.fromEntries(Object.entries(roles || {}).map(([key, person]) => [key, hydratePerson(person)]));

export default function CaseStageAutomationPanel({ caseId, canEdit = false, initiallyOpen = false, initialRunId, api = signingStageAutomationApi, packagesApi = signingPackagesApi }) {
    const { t, direction, number, date, language, errorMessage } = useSigningLocale();
    const [open, setOpen] = useState(initiallyOpen);
    const [data, setData] = useState(null);
    const [catalog, setCatalog] = useState([]);
    const [casePeople, setCasePeople] = useState([]);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null);
    const [editor, setEditor] = useState(null);
    const [check, setCheck] = useState(null);
    const [saved, setSaved] = useState(false);
    const [submissionId, setSubmissionId] = useState(null);
    const generation = useRef(0);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);

    const load = useCallback(async () => {
        setBusy('load'); setError(null);
        try {
            const [next, templates, context] = await Promise.all([api.list(caseId), packagesApi.templates(), packagesApi.caseContext(caseId)]);
            if (!mounted.current) return;
            setData(next); setCatalog(templates.templates || []); setCasePeople(context.people || []);
        } catch (failure) { if (mounted.current) setError(failure); }
        finally { if (mounted.current) setBusy(null); }
    }, [api, packagesApi, caseId]);
    useEffect(() => { if (open && !data) load(); }, [open, data, load]);
    useEffect(() => {
        if (data && initialRunId) document.getElementById(`stage-run-${initialRunId}`)?.scrollIntoView?.({ block: 'nearest' });
    }, [data, initialRunId]);

    const message = failure => t(`stageAutomation.errors.${failure?.code}`, { defaultValue: errorMessage(failure) });
    const validationLabel = item => {
        const parts = String(item.path || '').split('.');
        const dataIndex = parts.indexOf('data');
        if (dataIndex >= 0) return editor?.template?.dataKeys?.find(field => field.key === parts[dataIndex + 1])?.label || t('signingV2.compose.data.heading');
        const roleIndex = parts[0] === 'shared' ? 1 : parts.indexOf('recipients') + 1;
        return editor?.template?.roles.find(role => role.key === parts[roleIndex])?.label || t('stageAutomation.editor');
    };
    const invalidate = next => { generation.current += 1; setCheck(null); setSaved(false); setEditor(next); };
    const edit = (stage, rule) => {
        const template = rule?.template || catalog.find(item => item.versionId === rule?.templateVersionId) || null;
        const ordering = rule?.signingOrder || templateOrder(template?.roles || []);
        invalidate({ descriptionId: stage.descriptionId, stageTitle: stage.title, stageNumber: stage.stage,
            version: rule?.version || 0, alreadyTriggered: !!rule?.alreadyTriggered,
            template, name: rule?.name || template?.name || '', shared: hydrateRoles(rule?.shared), roleAudience: rule?.roleAudience || {},
            rows: [{ ...(rule?.rows?.[0] || {}), id: 'stage-row', key: rule?.rows?.[0]?.key || '', recipients: hydrateRoles(rule?.rows?.[0]?.recipients), data: rule?.rows?.[0]?.data || {} }],
            omittedRoles: rule?.omittedRoles || [], reviewerUserId: rule?.reviewerUserId || null,
            mode: ordering.mode || 'parallel', groups: ordering.groups || (ordering.roles || []).map(key => [key]),
            orderRoles: ordering.roles || ordering.groups?.flat() || template?.roles.map(role => role.key) || [] });
        setError(null);
    };
    const choose = versionId => {
        const template = catalog.find(item => item.versionId === versionId);
        if (!template) return;
        const ordering = templateOrder(template.roles);
        invalidate({ ...editor, template, name: template.name, reviewerUserId: null, roleAudience: {}, omittedRoles: [],
            rows: [{ id: 'stage-row', key: '', recipients: Object.fromEntries(template.roles.filter(role => role.audience !== 'shared').map(role => [role.key, blankRole(role)])), data: {} }],
            shared: Object.fromEntries(template.roles.filter(role => role.audience === 'shared').map(role => [role.key, blankRole(role)])),
            mode: ordering.mode, orderRoles: ordering.roles, groups: ordering.groups });
    };
    const roles = (editor?.template?.roles || []).map(role => ({ ...role, audience: editor.roleAudience[role.key] || role.audience }));
    const activeRoles = roles.filter(role => !editor.omittedRoles.includes(role.key));
    const updatePerson = (roleKey, field, value) => {
        generation.current += 1; setCheck(null); setSaved(false);
        // Identity controls can emit a role link and occurrence in one event.
        // Apply each change to the latest person instead of overwriting its peer.
        setEditor(current => {
            const role = current.template.roles.find(item => item.key === roleKey);
            const audience = current.roleAudience[roleKey] || role.audience;
            if (audience === 'shared') return { ...current, shared: { ...current.shared, [roleKey]: changePerson(current.shared[roleKey] || blankRole(role), field, value) } };
            return { ...current, rows: [{ ...current.rows[0], recipients: { ...current.rows[0].recipients, [roleKey]: changePerson(current.rows[0].recipients[roleKey] || blankRole(role), field, value) } }] };
        });
    };
    const body = () => ({ expectedVersion: editor.version, enabled: true, templateVersionId: editor.template.versionId, name: editor.name.trim(),
        ...(editor.template.approvalRequired ? { reviewerUserId: editor.reviewerUserId } : {}), roleAudience: editor.roleAudience,
        omittedRoles: editor.omittedRoles,
        signingOrder: editor.mode === 'grouped' ? { mode: 'grouped', groups: editor.groups.map(group => group.filter(key => activeRoles.some(role => role.key === key))).filter(group => group.length) }
            : editor.mode === 'sequential' ? { mode: 'sequential', roles: editor.orderRoles.filter(key => activeRoles.some(role => role.key === key)) } : { mode: 'parallel' },
        shared: Object.fromEntries(activeRoles.filter(role => role.audience === 'shared').map(role => [role.key, boundPerson(editor.shared[role.key], language)])),
        rows: [{ ...(editor.rows[0].key ? { key: editor.rows[0].key } : {}), data: editor.rows[0].data || {}, recipients: Object.fromEntries(activeRoles.filter(role => role.audience !== 'shared').map(role => [role.key, boundPerson(editor.rows[0].recipients[role.key], language)])) }] });
    const preview = async () => {
        if (busy || !editor?.template) return;
        const current = generation.current, request = body();
        setBusy('preview'); setError(null);
        try {
            const result = await api.preview(caseId, editor.descriptionId, request);
            if (mounted.current && current === generation.current) setCheck({ ...result, request });
        } catch (failure) { if (mounted.current && current === generation.current) setError(failure); }
        finally { if (mounted.current) setBusy(null); }
    };
    const save = async () => {
        if (busy || !check?.valid) return;
        setBusy('save'); setError(null);
        try {
            await api.save(caseId, editor.descriptionId, { ...check.request, ...(check.previewHash ? { previewHash: check.previewHash } : {}) });
            if (!mounted.current) return;
            setEditor(null); setCheck(null); setSaved(true); await load();
        } catch (failure) { if (mounted.current) { setError(failure); setCheck(null); } }
        finally { if (mounted.current) setBusy(null); }
    };
    const pause = async rule => {
        if (busy) return;
        setBusy('pause'); setError(null);
        try { await api.save(caseId, rule.descriptionId, { expectedVersion: rule.version, enabled: false }); if (mounted.current) await load(); }
        catch (failure) { if (mounted.current) setError(failure); }
        finally { if (mounted.current) setBusy(null); }
    };
    const retry = async run => {
        if (busy) return;
        setBusy('retry'); setError(null);
        try { await api.retry(caseId, run.id, run.version); if (mounted.current) await load(); }
        catch (failure) { if (mounted.current) setError(failure); }
        finally { if (mounted.current) setBusy(null); }
    };

    if (submissionId) return <SigningPackagesWorkspace initialSubmissionId={submissionId} onClose={() => setSubmissionId(null)} backLabel={t('stageAutomation.back')} />;
    return <details className="lw-stageAutomation" dir={direction} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary>{t('stageAutomation.title')}</summary>
        {open && <div className="lw-stageAutomation__content">
            <p>{t('stageAutomation.help')}</p>
            <p className="lw-stageAutomation__muted">{t('stageAutomation.savedStages')}</p>
            {error && <StatusNotice embedded><p>{message(error)}</p><SecondaryButton onPress={load} disabled={!!busy}>{t('common.retry')}</SecondaryButton></StatusNotice>}
            {busy && <p role="status">{t(busy === 'load' ? 'common.loading' : 'stageAutomation.working')}</p>}
            {saved && <p role="status">{t('stageAutomation.saved')}</p>}
            {data && !editor && <>
                {!data.stages?.length && <p>{t('stageAutomation.emptyStages')}</p>}
                <ul className="lw-stageAutomation__stages">{(data.stages || []).map(stage => {
                    const rule = data.rules?.find(item => String(item.descriptionId) === String(stage.descriptionId));
                    return <li key={stage.descriptionId}>
                        <h4>{t('stageAutomation.stage', { number: number(stage.stage) })} · <bdi>{stage.title}</bdi></h4>
                        <p>{rule ? <><bdi>{rule.templateName}</bdi> · {t(rule.enabled ? 'stageAutomation.active' : 'stageAutomation.paused')}</> : t('stageAutomation.noRule')}</p>
                        {rule?.alreadyTriggered && <p className="lw-stageAutomation__muted">{t('stageAutomation.onceUsed')}</p>}
                        {canEdit && <div className="lw-stageAutomation__actions">
                            <SecondaryButton onPress={() => edit(stage, rule)} disabled={!!busy}>{t(rule ? 'stageAutomation.edit' : 'stageAutomation.configure')}</SecondaryButton>
                            {rule?.enabled && <SecondaryButton onPress={() => pause(rule)} disabled={!!busy}>{t('stageAutomation.pause')}</SecondaryButton>}
                        </div>}
                    </li>;
                })}</ul>
            </>}
            {editor && <section aria-label={t('stageAutomation.editor')} className="lw-signingCompose">
                <h3>{t('stageAutomation.stage', { number: number(editor.stageNumber) })} · <bdi>{editor.stageTitle}</bdi></h3>
                <fieldset disabled={!!busy} className="lw-stageAutomation__editor">
                    <label htmlFor={`stage-template-${caseId}`}>{t('stageAutomation.template')}</label>
                    <SigningSelect id={`stage-template-${caseId}`} value={editor.template?.versionId || ''} onChange={event => choose(event.target.value)}>
                        <option value="">{t('stageAutomation.chooseTemplate')}</option>
                        {editor.template && !catalog.some(item => item.versionId === editor.template.versionId) && <option value={editor.template.versionId}>{editor.template.name} · {t('stageAutomation.pinned')}</option>}
                        {catalog.map(item => <option key={item.versionId} value={item.versionId}>{item.name}</option>)}
                    </SigningSelect>
                    {!catalog.length && <p>{t('stageAutomation.noTemplates')}</p>}
                    {editor.template && <>
                        <p>{t('stageAutomation.revisionHelp')}</p>
                        <label htmlFor={`stage-name-${caseId}`}>{t('stageAutomation.name')}</label>
                        <input id={`stage-name-${caseId}`} value={editor.name} maxLength={200} onChange={event => invalidate({ ...editor, name: event.target.value })} />
                        {roles.map(role => <fieldset key={role.key} className="lw-signingCompose__roleBlock">
                            <legend>{role.label}</legend>
                            <label className="lw-stageAutomation__toggle"><input type="checkbox" disabled={activeRoles.length <= 1 && !editor.omittedRoles.includes(role.key)} checked={!editor.omittedRoles.includes(role.key)} onChange={event => invalidate({ ...editor, omittedRoles: event.target.checked ? editor.omittedRoles.filter(key => key !== role.key) : [...editor.omittedRoles, role.key] })} />{t('stageAutomation.includeRole')}</label>
                            {!editor.omittedRoles.includes(role.key) && <RolePeople role={role} person={(role.audience === 'shared' ? editor.shared[role.key] : editor.rows[0].recipients[role.key]) || blankRole(role)} scope={`stage-${caseId}-${editor.descriptionId}`} onChange={updatePerson} casePeople={casePeople} otherRoles={roles.filter(item => item.key !== role.key)} bindContacts />}
                        </fieldset>)}
                        <DocumentDataFields row={editor.rows[0]} fields={editor.template.dataKeys || []} onChange={(_id, key, value) => invalidate({ ...editor, rows: [{ ...editor.rows[0], data: { ...editor.rows[0].data, [key]: value } }] })} />
                        <SigningOrderFields mode={editor.mode} roles={editor.orderRoles.map(key => activeRoles.find(role => role.key === key)).filter(Boolean)} groups={editor.groups}
                            onMode={mode => invalidate({ ...editor, mode })}
                            onMove={(from, to) => { const next = [...editor.orderRoles]; const [key] = next.splice(from, 1); next.splice(to, 0, key); invalidate({ ...editor, orderRoles: next }); }}
                            onGroup={(key, index) => { const next = editor.groups.map(group => group.filter(item => item !== key)); (next[index] ||= []).push(key); invalidate({ ...editor, groups: next.filter(group => group.length) }); }} />
                        {editor.template.approvalRequired && <ApprovalReviewerField api={packagesApi} value={editor.reviewerUserId} soloAllowed={editor.template.soloApproval} onChange={reviewerUserId => invalidate({ ...editor, reviewerUserId })} />}
                        <p>{t('stageAutomation.contactHelp')}</p>
                        {editor.alreadyTriggered && <p role="note">{t('stageAutomation.onceUsed')}</p>}
                    </>}
                </fieldset>
                {check && (check.valid ? <>
                    <p role="status">{t('stageAutomation.reviewReady')}</p>
                    <p>{t('stageAutomation.confirmHelp')}</p>
                </> : <StatusNotice embedded><p>{t('stageAutomation.reviewFailed')}</p>
                    <ul>{(check.errors || []).map((item, index) => <li key={index}><bdi>{validationLabel(item)}</bdi> · {errorMessage(item)}</li>)}</ul>
                </StatusNotice>)}
                <div className="lw-stageAutomation__actions">
                    <SecondaryButton onPress={() => { generation.current += 1; setEditor(null); setCheck(null); }} disabled={!!busy}>{t('common.cancel')}</SecondaryButton>
                    <SecondaryButton onPress={preview} disabled={!!busy || !editor.template || !editor.name.trim()}>{t('stageAutomation.check')}</SecondaryButton>
                    <PrimaryButton onPress={save} disabled={!!busy || !check?.valid}>{t('stageAutomation.save')}</PrimaryButton>
                </div>
            </section>}
            {!!data?.runs?.length && <section aria-label={t('stageAutomation.runs')}>
                <div className="lw-stageAutomation__runHeader"><h3>{t('stageAutomation.runs')}</h3><SecondaryButton onPress={load} disabled={!!busy}>{t('stageAutomation.refresh')}</SecondaryButton></div>
                <ul className="lw-stageAutomation__runs">{data.runs.map(run => <li key={run.id} id={`stage-run-${run.id}`}>
                    <strong>{t(`stageAutomation.status.${run.status}`, { defaultValue: run.status })}</strong>
                    <span><bdi>{run.stageTitle || t('stageAutomation.removedStage')}</bdi> · {date(run.createdAt)}</span>
                    {run.status === 'created' && <p>{t('stageAutomation.createdHelp')}</p>}
                    {run.errorCode && <p role="note">{message({ code: run.errorCode })}</p>}
                    <div className="lw-stageAutomation__actions">
                        {run.submissionId && <SecondaryButton onPress={() => setSubmissionId(run.submissionId)}>{t('stageAutomation.openPackage')}</SecondaryButton>}
                        {canEdit && run.status === 'blocked' && <SecondaryButton onPress={() => retry(run)} disabled={!!busy}>{t('stageAutomation.retry')}</SecondaryButton>}
                    </div>
                </li>)}</ul>
            </section>}
        </div>}
    </details>;
}
