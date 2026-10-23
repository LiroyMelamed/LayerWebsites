import React, { useEffect, useRef, useState } from 'react';
import api from '../../../api/wordTemplatesApi';
import { uploadFileToR2 } from '../../../utils/fileUploadUtils';
import SigningSelect from '../templates/SigningSelect';
import SigningBackButton from '../templates/SigningBackButton';
import useSigningLocale from '../templates/useSigningLocale';
import PdfViewer from '../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer';
import StatusNotice from '../../../components/ui/StatusNotice';
import SimplePopUp from '../../../components/simpleComponents/SimplePopUp';
import ConfirmationDialog from '../../../components/styledComponents/popups/ConfirmationDialog';
import WordRecordPicker from './WordRecordPicker';
import './WordTemplatesWorkspace.scss';

const CLIENT_FIELDS = ['fullName', 'companyName', 'identityNumber', 'companyNumber', 'address', 'email', 'phone'];
const CASE_FIELDS = ['reference', 'title', 'address', 'amount', 'date'];
const OFFICE_FIELDS = ['name', 'address', 'email', 'phone'];
const ROLE_FIELDS = ['fullName', 'companyName', 'identityNumber', 'companyNumber', 'capacity', 'authority'];
const positiveId = value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
const uuid = () => globalThis.crypto.randomUUID();

export default function WordTemplatesWorkspace({ onBack, onContinue }) {
    const { t, direction, number } = useSigningLocale();
    const text = (key, values) => t(`signingWord.${key}`, values);
    const [sources, setSources] = useState([]);
    const [converterAvailable, setConverterAvailable] = useState(false);
    const [source, setSource] = useState(null);
    const [name, setName] = useState('');
    const [roles, setRoles] = useState([]);
    const [bindings, setBindings] = useState([]);
    const [dirty, setDirty] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [selection, setSelection] = useState(null);
    const [field, setField] = useState('client.fullName');
    const [required, setRequired] = useState(true);
    const [inputs, setInputs] = useState({ clientId: '', caseId: '', roleClientIds: {}, manualValues: {}, clientRecord: null, caseRecord: null, roleRecords: {} });
    const [preview, setPreview] = useState(null);
    const [pdfReady, setPdfReady] = useState(false);
    const [acknowledged, setAcknowledged] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [leaveAction, setLeaveAction] = useState(null);
    const generation = useRef(0);
    const lock = useRef(false);
    const alive = useRef(true);
    const urlRef = useRef(null);
    const previewRef = useRef(null);
    const latestDraft = useRef(null);
    latestDraft.current = { source, name, roles, bindings, inputs, selectedFile };

    const clearPreview = () => {
        generation.current += 1;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = null; previewRef.current = null;
        setPreview(null); setPdfReady(false); setAcknowledged(false);
    };
    useEffect(() => {
        alive.current = true;
        let cancelled = false;
        api.list().then(result => { if (!cancelled) { setSources(result.sources || []); setConverterAvailable(result.converterAvailable === true); } })
            .catch(() => { if (!cancelled) setError('requestFailed'); });
        return () => { cancelled = true; alive.current = false; generation.current += 1; if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
    }, []);
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = event => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    function edit(change) { if (lock.current) return; clearPreview(); setNotice(''); change(); setDirty(true); }
    function editInput(change) { if (lock.current) return; clearPreview(); setNotice(''); setInputs(previous => change(previous)); }
    function leave(action) { if (lock.current) return; if (dirty) setLeaveAction(() => action); else action(); }
    function receive(next) {
        clearPreview(); setSource(next); setName(next.name); setRoles(next.roles || []); setBindings(next.bindings || []);
        setSelection(null); setInputs({ clientId: '', caseId: '', roleClientIds: {}, manualValues: {}, clientRecord: null, caseRecord: null, roleRecords: {} });
        setSelectedFile(null); setDirty(false); setNotice(''); setError('');
        setSources(previous => [next, ...previous.filter(item => item.id !== next.id)]);
    }
    async function run(operation) {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError(''); setNotice('');
        try { await operation(); }
        catch (err) { if (alive.current) setError([409, 412].includes(err?.status) ? 'conflict' : err?.status === 503 ? 'converterUnavailable' : err?.status === 422 ? 'missingValues' : 'requestFailed'); }
        finally { lock.current = false; if (alive.current) setBusy(false); }
    }
    function openSource(id) {
        if (!id) return;
        leave(() => run(async () => { const result = await api.load(id); if (alive.current) receive(result.source); }));
    }
    function chooseFile(file) {
        if (!file || lock.current) return;
        if (!/\.docx$/i.test(file.name) || file.size <= 0 || file.size > 20 * 1024 * 1024) { setError('fileInvalid'); return; }
        leave(() => { clearPreview(); setSource(null); setRoles([]); setBindings([]); setSelection(null); setSelectedFile(file); setName(file.name.replace(/\.docx$/i, '')); setDirty(true); setError(''); });
    }
    async function importSource() {
        if (!selectedFile || !name.trim()) return;
        const snapshot = latestDraft.current;
        await run(async () => {
            const upload = await uploadFileToR2(snapshot.selectedFile);
            if (!upload?.success || !upload.data?.key) throw new Error('UPLOAD_FAILED');
            if (!alive.current || latestDraft.current.selectedFile !== snapshot.selectedFile) return;
            const result = await api.create({ fileKey: upload.data.key, name: snapshot.name.trim(), roles: [] });
            if (alive.current) { receive(result.source); setNotice('saved'); }
        });
    }
    function saveSource() {
        if (!source || !name.trim() || roles.some(role => !role.label.trim())) return;
        const snapshot = latestDraft.current;
        return run(async () => {
            const result = await api.save(snapshot.source.id, { expectedVersion: snapshot.source.version, sourceHash: snapshot.source.sourceHash,
                name: snapshot.name.trim(), roles: snapshot.roles.map(role => ({ key: role.key, label: role.label.trim() })), bindings: snapshot.bindings });
            if (!alive.current) return;
            // Saving mappings does not clear explicitly entered preview inputs.
            const savedInputs = snapshot.inputs;
            receive(result.source); setInputs(savedInputs); setNotice('saved');
        });
    }
    function selectedText(event, part, paragraph) {
        if (lock.current || !paragraph.editable) return;
        const selectionObject = window.getSelection();
        if (!selectionObject || selectionObject.isCollapsed || selectionObject.rangeCount !== 1) return;
        const range = selectionObject.getRangeAt(0); const host = event.currentTarget;
        if (!host.contains(range.startContainer) || !host.contains(range.endContainer)) return;
        const prefix = range.cloneRange(); prefix.selectNodeContents(host); prefix.setEnd(range.startContainer, range.startOffset);
        const start = prefix.toString().length; const end = start + range.toString().length;
        setSelection({ part, paragraphId: paragraph.id, start, end });
    }
    const paragraphs = (source?.model?.parts || []).flatMap(part => (part.paragraphs || []).map(paragraph => ({ ...paragraph, part: part.name })));
    const selectedParagraph = paragraphs.find(item => item.part === selection?.part && item.id === selection?.paragraphId);
    const fields = [...CLIENT_FIELDS.map(value => `client.${value}`), ...CASE_FIELDS.map(value => `case.${value}`), ...OFFICE_FIELDS.map(value => `office.${value}`),
        ...roles.flatMap(role => ROLE_FIELDS.map(value => `role.${role.key}.${value}`))];
    function fieldLabel(value) {
        const pieces = value.split('.');
        return pieces[0] === 'role' ? text('roleField', { role: roles.find(role => role.key === pieces[1])?.label || pieces[1], field: text(`fields.${pieces[2]}`) })
            : text('fieldLabel', { group: text(`groups.${pieces[0]}`), field: text(`fields.${pieces[1]}`) });
    }
    function addBinding() {
        if (!selection || !selectedParagraph?.editable) return;
        const { start, end } = selection;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > selectedParagraph.text.length || !fields.includes(field)) { setError('selectionInvalid'); return; }
        if (bindings.some(item => item.part === selection.part && item.paragraphId === selection.paragraphId && item.start < end && start < item.end)) { setError('selectionOverlap'); return; }
        edit(() => setBindings(previous => [...previous, { id: uuid(), ...selection, field, required }])); setSelection(null); setError('');
    }
    const uniqueFields = [...new Set(bindings.map(binding => binding.field))];
    const referenceValues = [inputs.clientId, inputs.caseId, ...roles.map(role => inputs.roleClientIds[role.key])];
    const validReferences = referenceValues.every(value => !value || positiveId(value));
    function generatePreview() {
        if (!source || dirty || !validReferences || !converterAvailable) return;
        clearPreview(); const token = generation.current; const snapshot = latestDraft.current;
        run(async () => {
            const payload = { expectedVersion: snapshot.source.version, bindingsHash: snapshot.source.bindingsHash, inputs: {
                manualValues: Object.fromEntries(Object.entries(snapshot.inputs.manualValues).filter(([key]) => snapshot.bindings.some(binding => binding.field === key))),
                roleClientIds: Object.fromEntries(snapshot.roles.filter(role => snapshot.inputs.roleClientIds[role.key]).map(role => [role.key, Number(snapshot.inputs.roleClientIds[role.key])])),
                ...(snapshot.inputs.clientId ? { clientId: Number(snapshot.inputs.clientId) } : {}), ...(snapshot.inputs.caseId ? { caseId: Number(snapshot.inputs.caseId) } : {}),
            } };
            const result = await api.preview(snapshot.source.id, payload, uuid());
            if (!alive.current || token !== generation.current) return;
            const blob = await api.pdf(result.preview.id);
            if (!alive.current || token !== generation.current) return;
            const url = URL.createObjectURL(blob); urlRef.current = url;
            const next = { ...result.preview, fileBlob: blob, url }; previewRef.current = next; setPreview(next);
        });
    }
    function continueToSigning() {
        if (lock.current || !preview || previewRef.current !== preview || !pdfReady || !acknowledged || dirty) return;
        onContinue?.(preview);
    }

    return <section className="lw-templates lw-word" dir={direction} aria-label={text('title')}>
        <SigningBackButton onPress={() => leave(onBack)}>{text('back')}</SigningBackButton>
        <header className="lw-templates__heading"><div><h1>{text('title')}</h1><p>{text('intro')}</p></div></header>
        {error && <StatusNotice><p>{text(error)}</p></StatusNotice>}
        {notice && <p role="status" className="lw-word__notice">{text(notice)}</p>}
        {busy && <p role="status">{text('working')}</p>}
        <div className="lw-word__library">
            <label>{text('library')}<SigningSelect value={source?.id || ''} disabled={busy} onChange={event => openSource(event.target.value)}><option value="">{text('chooseSource')}</option>{sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SigningSelect></label>
            <label>{text('upload')}<input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
        </div>
        {(selectedFile || source) && <>
            <label className="lw-word__name">{text('name')}<input value={name} maxLength={160} disabled={busy} onChange={event => edit(() => setName(event.target.value))} /></label>
            {selectedFile && <div className="lw-templates__actions"><button className="is-primary" type="button" disabled={busy || !name.trim()} onClick={importSource}>{text('import')}</button></div>}
        </>}
        {source && <>
            <section className="lw-word__section" aria-label={text('roles')}><h2>{text('roles')}</h2><p>{text('rolesHelp')}</p>
                {roles.map((role, index) => <div key={role.key} className="lw-word__role"><label>{text('roleNumber', { number: number(index + 1) })}<input value={role.label} maxLength={80} disabled={busy} onChange={event => edit(() => setRoles(previous => previous.map(item => item.key === role.key ? { ...item, label: event.target.value } : item)))} /></label>
                    <button type="button" disabled={busy || bindings.some(binding => binding.field.startsWith(`role.${role.key}.`))} onClick={() => edit(() => setRoles(previous => previous.filter(item => item.key !== role.key)))}>{text('removeRole')}</button></div>)}
                <button type="button" disabled={busy || roles.length >= 20} onClick={() => edit(() => { const used = new Set(roles.map(role => role.key)); let index = 1; while (used.has(`role${index}`)) index += 1; setRoles(previous => [...previous, { key: `role${index}`, label: text('newRole', { number: number(index) }) }]); })}>{text('addRole')}</button>
            </section>
            <section className="lw-word__section" aria-label={text('mapping')}><h2>{text('mapping')}</h2><p>{text('mappingHelp')}</p>
                <div className="lw-word__mappingLayout"><div className="lw-word__document" aria-label={text('documentText')}>{paragraphs.map(paragraph => <div key={`${paragraph.part}:${paragraph.id}`} className="lw-word__paragraph">
                    <p onMouseUp={event => selectedText(event, paragraph.part, paragraph)} onKeyUp={event => selectedText(event, paragraph.part, paragraph)}>{paragraph.text || text('emptyParagraph')}</p>
                    {!paragraph.editable && <small>{text('unsupportedParagraph')}</small>}
                    {paragraph.editable && <div className="lw-word__blanks">{(paragraph.blanks || []).map((blank, index) => <button type="button" key={index} disabled={busy} onClick={() => setSelection({ part: paragraph.part, paragraphId: paragraph.id, start: blank.start, end: blank.end })}>{text('chooseBlank', { number: number(index + 1) })}</button>)}</div>}
                </div>)}</div><div className="lw-word__mappingForm">
                    <label>{text('paragraph')}<SigningSelect value={selectedParagraph ? `${selectedParagraph.part}:${selectedParagraph.id}` : ''} disabled={busy} onChange={event => { const paragraph = paragraphs.find(item => `${item.part}:${item.id}` === event.target.value); if (paragraph) setSelection({ part: paragraph.part, paragraphId: paragraph.id, start: 0, end: paragraph.text.length }); }}><option value="">{text('chooseParagraph')}</option>{paragraphs.filter(paragraph => paragraph.editable).map((paragraph, index) => <option key={`${paragraph.part}:${paragraph.id}`} value={`${paragraph.part}:${paragraph.id}`}>{text('paragraphNumber', { number: number(index + 1) })}: {paragraph.text.slice(0, 70)}</option>)}</SigningSelect></label>
                    {selection && <><div className="lw-word__range"><label>{text('start')}<input type="number" min="0" max={selectedParagraph?.text.length || 0} value={selection.start} disabled={busy} onChange={event => setSelection(previous => ({ ...previous, start: Number(event.target.value) }))} /></label><label>{text('end')}<input type="number" min="0" max={selectedParagraph?.text.length || 0} value={selection.end} disabled={busy} onChange={event => setSelection(previous => ({ ...previous, end: Number(event.target.value) }))} /></label></div><p className="lw-word__selected"><bdi>{selectedParagraph?.text.slice(selection.start, selection.end)}</bdi></p></>}
                    <label>{text('field')}<SigningSelect value={field} disabled={busy} onChange={event => setField(event.target.value)}>{fields.map(value => <option key={value} value={value}>{fieldLabel(value)}</option>)}</SigningSelect></label>
                    <label className="lw-word__check"><input type="checkbox" checked={required} disabled={busy} onChange={event => setRequired(event.target.checked)} />{text('required')}</label>
                    <button type="button" className="is-primary" disabled={busy || !selection} onClick={addBinding}>{text('bind')}</button>
                </div></div>
                <ul className="lw-word__bindings" aria-label={text('bindings')}>{bindings.map(binding => <li key={binding.id}><div><strong>{fieldLabel(binding.field)}</strong><p><bdi>{paragraphs.find(paragraph => paragraph.part === binding.part && paragraph.id === binding.paragraphId)?.text.slice(binding.start, binding.end)}</bdi> · {text(binding.required ? 'required' : 'optional')}</p></div><button type="button" disabled={busy} onClick={() => edit(() => setBindings(previous => previous.filter(item => item.id !== binding.id)))}>{text('removeBinding')}</button></li>)}</ul>
            </section>
            <div className="lw-templates__actions"><button type="button" className="is-primary" disabled={busy || !dirty || !name.trim() || roles.some(role => !role.label.trim())} onClick={saveSource}>{text('save')}</button><p>{text('privateHelp')}</p></div>
            <section className="lw-word__section" aria-label={text('fill')}><h2>{text('fill')}</h2><p>{text('fillHelp')}</p>
                <div className="lw-word__references"><WordRecordPicker kind="client" label={text('clientId')} value={inputs.clientRecord} disabled={busy} onChange={record => editInput(previous => ({ ...previous, clientRecord: record, clientId: record ? String(record.id) : '' }))} />
                    <WordRecordPicker kind="case" label={text('caseId')} value={inputs.caseRecord} disabled={busy} onChange={record => editInput(previous => ({ ...previous, caseRecord: record, caseId: record ? String(record.id) : '' }))} />
                    {roles.map(role => <WordRecordPicker key={role.key} label={text('roleClientId', { role: role.label })} value={inputs.roleRecords[role.key]} disabled={busy} onChange={record => editInput(previous => ({ ...previous, roleRecords: { ...previous.roleRecords, [role.key]: record }, roleClientIds: { ...previous.roleClientIds, [role.key]: record ? String(record.id) : '' } }))} />)}
                </div>
                {!validReferences && <p role="alert">{text('referenceInvalid')}</p>}
                <p>{text('overrideHelp')}</p><div className="lw-word__overrides">{uniqueFields.map(value => { const overridden = Object.hasOwn(inputs.manualValues, value); return <div key={value}><label className="lw-word__check"><input type="checkbox" checked={overridden} disabled={busy} onChange={event => editInput(previous => { const next = { ...previous.manualValues }; if (event.target.checked) next[value] = ''; else delete next[value]; return { ...previous, manualValues: next }; })} />{text('manualField', { field: fieldLabel(value) })}</label>{overridden && <label>{fieldLabel(value)}<input value={inputs.manualValues[value]} maxLength={4000} disabled={busy} onChange={event => editInput(previous => ({ ...previous, manualValues: { ...previous.manualValues, [value]: event.target.value } }))} /></label>}</div>; })}</div>
                {!converterAvailable && <StatusNotice><p>{text('converterUnavailable')}</p></StatusNotice>}
                {dirty && <p>{text('saveFirst')}</p>}
                <button type="button" className="is-primary" disabled={busy || dirty || !validReferences || !converterAvailable} onClick={generatePreview}>{text('preview')}</button>
            </section>
            {preview && <section className="lw-word__section" aria-label={text('finalPreview')}><h2>{text('finalPreview')}</h2><p>{text('freshGeometry')}</p><PdfViewer pdfSource={preview.url} spots={[]} signers={[]} onDocumentReady={setPdfReady} /><label className="lw-word__check"><input type="checkbox" checked={acknowledged} disabled={!pdfReady || busy} onChange={event => setAcknowledged(event.target.checked)} />{text('previewAcknowledgement')}</label><button type="button" className="is-primary" disabled={busy || !pdfReady || !acknowledged || dirty || !onContinue} onClick={continueToSigning}>{text('continue')}</button></section>}
        </>}
        {leaveAction && <SimplePopUp isOpen onClose={() => setLeaveAction(null)} role="dialog" aria-modal="true" aria-label={text('discardTitle')} dir={direction}><ConfirmationDialog title={text('discardTitle')} message={text('discardMessage')} confirmText={text('discard')} cancelText={text('keepEditing')} onCancel={() => setLeaveAction(null)} onConfirm={() => { const action = leaveAction; setLeaveAction(null); action(); }} /></SimplePopUp>}
    </section>;
}
