import SigningBackButton from './SigningBackButton';
import React, { useEffect, useRef, useState } from 'react';
import PdfViewer from '../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer';
import { uploadFileToR2 } from '../../../utils/fileUploadUtils';
import StatusNotice from '../../../components/ui/StatusNotice';
import api from '../../../api/signingTemplatesApi';
import useSigningLocale from './useSigningLocale';
import TemplateRoles from './TemplateRoles';
import TemplateDataKeys from './TemplateDataKeys';
import TemplateDocumentCondition from './TemplateDocumentCondition';
import { conditionSummary } from './templateConditions';
import './templates.scss';

const FIELD_TYPES = ['signature', 'initials', 'text', 'date', 'number', 'checkbox'];
const initial = name => ({ name: '', roles: [{ id: 'first', name, kind: 'custom' }], documents: [], requireOtp: true, signingOrder: 'parallel', completionEmail: '', completionMode: 'document' });

export default function TemplateBuilder({ template, onBack, onSaved, adapter, onSaveDraft, onDirtyChange }) {
    const { t: translate, direction, number } = useSigningLocale();
    const t = (key, args) => translate(`signingV2.builder.${key}`, args);
    const native = !!adapter;
    const service = adapter || api;
    const saving = useRef(false);
    const [step, setStep] = useState(0);
    const [draft, setDraft] = useState(() => template?.definition || initial(t('roleDefault', { index: number(1) })));
    const [activeDoc, setActiveDoc] = useState(0);const [selected, setSelected] = useState(null);
    const [pdfFiles, setPdfFiles] = useState({});const [page, setPage] = useState(1);
    const [roleId, setRoleId] = useState(draft.roles[0].id);const [type, setType] = useState('signature');
    const [busy, setBusy] = useState(false);const [error, setError] = useState('');
    const original = useRef(JSON.stringify(draft));
    const dirty = original.current !== JSON.stringify(draft);
    useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
    const leave = () => { if (!dirty || window.confirm(t('leave'))) onBack(); };
    useEffect(() => {
        const prevent = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', prevent);
        return () => window.removeEventListener('beforeunload', prevent);
    }, [dirty]);
    const document = draft.documents[activeDoc];const field = document?.fields[selected];
    useEffect(() => {
        if (!template || !document || pdfFiles[document.id]) return undefined;
        let cancelled = false;
        service.pdf(template.id, document.id).then(blob => { if (!cancelled) setPdfFiles(prev => ({ ...prev, [document.id]: blob })); }).catch(e => { if (!cancelled) setError(e.message); });
        return () => { cancelled = true; };
    }, [template, document, pdfFiles, service]);
    const change = patch => { if (!native || !saving.current) setDraft(prev => ({ ...prev, ...patch })); };
    const updateDocument = update => { if (!native || !saving.current) setDraft(prev => ({ ...prev, documents: prev.documents.map((doc, i) => i === activeDoc ? update(doc) : doc) })); };
    const updateField = (index, patch) => updateDocument(doc => ({ ...doc, fields: doc.fields.map((item, i) => i === index ? { ...item, ...patch } : item) }));
    const removeField = index => { updateDocument(doc => ({ ...doc, fields: doc.fields.filter((_, i) => i !== index) }));setSelected(null); };
    async function upload(file) {
        if (!file || saving.current) return;if (!/\.pdf$/i.test(file.name) || file.size > 20 * 1024 * 1024) { setError(t('pdfError'));return; }
        if (saving.current) return; saving.current = true;
        setBusy(true);setError('');
        try {
            const result = await uploadFileToR2(file);if (!result.success) throw new Error(t('uploadError'));
            const source = native ? await service.source(result.data.key) : {};
            const id = native ? `document_${crypto.randomUUID().replace(/-/g, '')}` : crypto.randomUUID();setPdfFiles(prev => ({ ...prev, [id]: file }));
            setDraft(prev => ({ ...prev, documents: [...prev.documents, { id, name: file.name, fileKey: result.data.key, ...source, fields: [] }] }));
            setActiveDoc(draft.documents.length);setSelected(null);setPage(1);
        } catch (e) { setError(e.message); } finally { saving.current = false; setBusy(false); }
    }
    function addField() {
        const next = { ...(native ? { id: `field_${crypto.randomUUID().replace(/-/g, '')}`, ...(type === 'data' ? { dataKey: draft.dataKeys?.[0]?.key, fontSize: 14, align: 'start' } : {}) } : {}), pageNum: page, x: 48, y: 60 + Math.min(document.fields.length, 6) * 60, width: type === 'checkbox' ? 28 : 180, height: type === 'checkbox' ? 28 : 48, roleId: type === 'data' ? undefined : roleId, fieldType: type, isRequired: true, fieldLabel: '' };
        updateDocument(doc => ({ ...doc, fields: [...doc.fields, next] }));setSelected(document.fields.length);
    }
    async function save() {
        if (saving.current) return; saving.current = true;
        setBusy(true);setError('');
        try { const result = await service.save(draft, template?.id, template?.version);onSaved(result.template); }
        catch (e) { setError(e.message); } finally { saving.current = false; setBusy(false); }
    }
    return <section className="lw-templates" dir={direction}>
        <SigningBackButton onPress={leave} disabled={busy}>{t('back')}</SigningBackButton>
        <header className="lw-templates__heading"><div><h1>{t(template && !template.isNew ? 'edit' : 'new')}</h1><p>{t('intro')}</p></div></header>
        {error && <StatusNotice><p>{error}</p></StatusNotice>}
        <fieldset className="lw-templates__unboxed" disabled={native && busy} aria-busy={busy}>
        <nav className="lw-templates__steps" aria-label={t('review')}>
            {['setup', 'documents', 'review'].map((key, index) => <button key={key} type="button" aria-current={step === index ? 'step' : undefined} disabled={busy || (index > 0 && (!draft.name.trim() || draft.roles.some(role => !role.name.trim())))} onClick={() => setStep(index)}><span>{number(index + 1)}</span>{t(key)}</button>)}
        </nav>
        {step === 0 && <><div className="lw-templates__setup">
            <label>{t('name')}<input value={draft.name} maxLength={120} onChange={e => change({ name: e.target.value })} placeholder={t('nameExample')} /></label>
            <label>{t('order')}<select dir={direction} value={draft.signingOrder} onChange={e => change({ signingOrder: e.target.value, ...(e.target.value === 'grouped' ? { signingGroups: draft.signingOrder === 'sequential' ? draft.roles.map(role => [role.id]) : [draft.roles.map(role => role.id)] } : {}) })}><option value="parallel">{t('parallel')}</option><option value="sequential">{t('sequential')}</option>{native && <option value="grouped">{translate('signingV2.compose.order.grouped')}</option>}</select></label>
        </div>
        <TemplateRoles draft={draft} onChange={change} roleId={roleId} onRoleId={setRoleId} native={native} />
        {native && <TemplateDataKeys draft={draft} onChange={change} />}
        </>}
        {step === 1 && <>
        <h2>{t('documents')}</h2>
        <div className="lw-templates__toolbar"><div className="lw-templates__tabs" role="tablist" aria-label={t('documentTabs')}>{draft.documents.map((doc, i) => <button type="button" key={doc.id} role="tab" aria-selected={activeDoc === i} onClick={() => { setActiveDoc(i);setSelected(null);setPage(1); }}>{doc.name} <small>{t('fields', { count: doc.fields.length, formattedCount: number(doc.fields.length) })}</small></button>)}</div>
            <label className="lw-templates__file">{t('addPdf')}<input type="file" accept=".pdf,application/pdf" disabled={busy || draft.documents.length >= 10} onChange={e => { upload(e.target.files?.[0]);e.target.value = ''; }} /></label></div>
        {!document ? <div className="lw-templates__empty"><h3>{t('emptyTitle')}</h3><p>{t('emptyBody')}</p></div> : <div className="lw-templates__editor">
            <aside className="lw-templates__fieldTools">
                <label>{t('documentName')}<input value={document.name} maxLength={160} onChange={e => updateDocument(doc => ({ ...doc, name: e.target.value }))} /></label>
                {native && <TemplateDocumentCondition key={document.id} fields={draft.dataKeys || []} condition={document.nativeDocument?.when}
                    onChange={when => updateDocument(doc => ({ ...doc, nativeDocument: { ...doc.nativeDocument, when } }))} />}
                {type !== 'data' && <label>{t('signer')}<select dir={direction} value={roleId} onChange={e => setRoleId(e.target.value)}>{draft.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>}
                <label>{t('fieldType')}<select dir={direction} value={type} onChange={e => setType(e.target.value)}>{(native ? [...FIELD_TYPES.filter(key => key !== 'number'), 'data'] : FIELD_TYPES).map(key => <option key={key} value={key}>{key === 'data' ? translate('signingV2.authoring.dataField') : t(`types.${key}`)}</option>)}</select></label>
                <label>{t('page')}<input type="number" min="1" max="500" value={page} onChange={e => setPage(Number(e.target.value) || 1)} /></label>
                <button type="button" className="is-primary" disabled={!pdfFiles[document.id] || document.fields.length >= 150 || (type === 'data' && !draft.dataKeys?.length)} onClick={addField}>{t('addField', { page: number(page) })}</button>
                <p>{t('dragHint')}</p>
                {field && <fieldset><legend>{t('selectedField')}</legend>
                    {field.fieldType === 'data' ? <>
                        <label>{translate('signingV2.authoring.dataField')}<select dir={direction} value={field.dataKey || ''} onChange={e => updateField(selected, { dataKey: e.target.value })}>{draft.dataKeys.map(key => <option value={key.key} key={key.key}>{key.label || key.key}</option>)}</select></label>
                        <label>{translate('signingV2.authoring.fontSize')}<input type="number" min="8" max="72" value={field.fontSize || 14} onChange={e => updateField(selected, { fontSize: Number(e.target.value) })} /></label>
                        <p>{translate('signingV2.authoring.overflow')}</p>
                    </> : <label>{t('signer')}<select dir={direction} value={field.roleId} onChange={e => updateField(selected, { roleId: e.target.value })}>{draft.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>}
                    {native && field.fieldType !== 'data' && (() => {
                        const role = draft.roles.find(item => item.id === field.roleId)?.nativeRole;
                        return (role?.when || role?.min <= (field.nativeField?.occurrence || 0)) && <label>{translate('signingV2.authoring.condition.inactive')}
                            <select dir={direction} value={field.inactiveTreatment || ''} onChange={event => updateField(selected, { inactiveTreatment: event.target.value || undefined })}>
                                <option value="">{translate('signingV2.authoring.condition.chooseTreatment')}</option>
                                {['exclude_document', 'authored_inactive'].map(value => <option key={value} value={value}>{translate(`signingV2.authoring.condition.${value}`)}</option>)}
                            </select></label>;
                    })()}
                    <label>{t('label')}<input value={field.fieldLabel || ''} maxLength={120} onChange={e => updateField(selected, { fieldLabel: e.target.value })} /></label>
                    {field.fieldType !== 'data' && <label className="lw-templates__check"><input type="checkbox" checked={field.isRequired} onChange={e => updateField(selected, { isRequired: e.target.checked })} />{t('required')}</label>}
                    <button type="button" onClick={() => removeField(selected)}>{t('deleteField')}</button>
                </fieldset>}
                <button type="button" onClick={() => { change({ documents: draft.documents.filter((_, i) => i !== activeDoc) });setActiveDoc(0);setSelected(null); }}>{t('removeDoc')}</button>
            </aside>
            <div className="lw-templates__pdf">{pdfFiles[document.id] ? <PdfViewer key={document.id} pdfFile={pdfFiles[document.id]} spots={document.fields.map(f => ({ ...f, ...(f.fieldType === 'data' ? { type: 'text', fieldType: 'text', authoredDataLabel: draft.dataKeys?.find(key => key.key === f.dataKey)?.label || translate('signingV2.authoring.dataField'), isRequired: !!draft.dataKeys?.find(key => key.key === f.dataKey)?.required } : {}), signerIndex: draft.roles.findIndex(r => r.id === f.roleId), signerName: f.fieldType === 'data' ? draft.dataKeys?.find(key => key.key === f.dataKey)?.label || translate('signingV2.authoring.dataField') : draft.roles.find(r => r.id === f.roleId)?.name }))} signers={draft.roles.map((r, i) => ({ UserId: i + 1, Name: r.name }))} onUpdateSpot={updateField} onRemoveSpot={removeField} onRequestRemove={removeField} onSelectSpot={setSelected} selectedSpotIndex={selected} /> : <p role="status">{t('loadingPdf')}</p>}</div>
        </div>}
        </>}
        {step === 2 && <section className="lw-templates__review">
            <h2>{draft.name}</h2>
            <p>{draft.signingOrder === 'grouped' ? translate('signingV2.compose.order.grouped') : t(draft.signingOrder === 'sequential' ? 'sequential' : 'parallel')}</p>
            {draft.signingOrder === 'grouped' && <ol>{draft.signingGroups.map((group, index) => <li key={index}>{group.map(key => draft.roles.find(role => role.id === key)?.name).join(' · ')}</li>)}</ol>}
            <ol>{draft.roles.map(role => <li key={role.id}><bdi>{role.name}</bdi> · {t(role.kind === 'shared' || role.kind === 'lawyer' ? 'shared' : 'each')}
                {native && role.nativeRole?.when && <span dir="auto"> · {conditionSummary(role.nativeRole.when, draft.dataKeys || [], (key, values) => translate(`signingV2.authoring.condition.${key}`, values))}</span>}
            </li>)}</ol>
            <ul>{draft.documents.map(doc => <li key={doc.id}><bdi>{doc.name}</bdi> · {t('fields', { count: doc.fields.length, formattedCount: number(doc.fields.length) })}
                {native && doc.nativeDocument?.when && <span dir="auto"> · {conditionSummary(doc.nativeDocument.when, draft.dataKeys || [], (key, values) => translate(`signingV2.authoring.condition.${key}`, values))}</span>}
            </li>)}</ul>
            {draft.roles.some(role => !draft.documents.some(doc => doc.fields.some(field => field.roleId === role.id))) && <p role="alert">{t('missingFields')}</p>}
            {!native && <details><summary>{t('extra')}</summary><div className="lw-templates__setup">            <label>{t('completionEmail')}<input type="email" dir="ltr" value={draft.completionEmail} onChange={e => change({ completionEmail: e.target.value })} placeholder="office@example.com" /></label>
            <label>{t('completionMode')}<select dir={direction} value={draft.completionMode || 'document'} onChange={e => change({ completionMode: e.target.value })}><option value="document">{t('completionDocument')}</option><option value="package">{t('completionPackage')}</option></select></label>
</div></details>}
        </section>}
        <footer className="lw-templates__footer"><div hidden={step !== 2}><label className="lw-templates__check"><input type="checkbox" disabled={native} checked={draft.requireOtp} onChange={e => change({ requireOtp: e.target.checked, otpWaiverAcknowledged: false })} />{t('otp')}</label>
            {!draft.requireOtp && <label className="lw-templates__check"><input type="checkbox" checked={!!draft.otpWaiverAcknowledged} onChange={e => change({ otpWaiverAcknowledged: e.target.checked })} />{t('waiver')}</label>}
            {template && !template.isNew && <p>{t('futureOnly')}</p>}</div>
            {onSaveDraft && <button type="button" disabled={busy || !draft.name.trim()} onClick={async () => { if (saving.current) return; saving.current = true; setBusy(true); setError(''); try { await onSaveDraft(draft); original.current = JSON.stringify(draft); } catch(e) { setError(e.message); } finally { saving.current = false; setBusy(false); } }}>{translate('signingV2.authoring.saveDraft')}</button>}
            <button type="button" hidden={step !== 2} className="is-primary" disabled={busy || !draft.name.trim() || !draft.documents.length || (native && draft.dataKeys?.some(key => !key.label?.trim())) || draft.roles.some(role => !draft.documents.some(doc => doc.fields.some(field => field.roleId === role.id)))} onClick={save}>{native && !busy ? translate('signingV2.authoring.publish') : t(busy ? 'saving' : 'save')}</button>
            {step > 0 && <SigningBackButton onPress={() => setStep(step - 1)} disabled={busy}>{t('previous')}</SigningBackButton>}
            {step < 2 && <button type="button" className="is-primary" disabled={busy || !draft.name.trim() || draft.roles.some(role => !role.name.trim()) || (step === 1 && !draft.documents.length)} onClick={() => setStep(step + 1)}>{t('next')}</button>}
        </footer>
        </fieldset>
    </section>;
}
