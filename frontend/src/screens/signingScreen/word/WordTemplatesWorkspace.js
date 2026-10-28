import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../api/wordTemplatesApi';
import { uploadFileToR2 } from '../../../utils/fileUploadUtils';
import SigningSelect from '../templates/SigningSelect';
import SigningBackButton from '../templates/SigningBackButton';
import useSigningLocale from '../templates/useSigningLocale';
import PdfViewer from '../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer';
import StatusNotice from '../../../components/ui/StatusNotice';
import SimplePopUp from '../../../components/simpleComponents/SimplePopUp';
import ConfirmationDialog from '../../../components/styledComponents/popups/ConfirmationDialog';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import TertiaryButton from '../../../components/styledComponents/buttons/TertiaryButton';
import SimpleInput from '../../../components/simpleComponents/SimpleInput';
import FileUploadBox from '../../../components/styledComponents/fileUpload/FileUploadBox';
import { Text14, TextBold18, TextBold24 } from '../../../components/specializedComponents/text/AllTextKindFile';
import WordRecordPicker from './WordRecordPicker';
import WordSourceViewer from './WordSourceViewer';
import WordDataFieldPanel from './WordDataFieldPanel';
import { selectorForAnchor, validateAuthoring, verifyPdfBlob } from './wordAuthoringSelection';
import './WordTemplatesWorkspace.scss';

const CLIENT_FIELDS = ['fullName', 'companyName', 'identityNumber', 'companyNumber', 'address', 'email', 'phone'];
const CASE_FIELDS = ['reference', 'title', 'address', 'amount', 'date'];
const OFFICE_FIELDS = ['name', 'address', 'email', 'phone'];
const ROLE_FIELDS = ['fullName', 'companyName', 'identityNumber', 'companyNumber', 'capacity', 'authority'];
const positiveId = value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
const uuid = () => window.crypto.randomUUID();
const record = value => value && positiveId(String(value.id)) && typeof value.label === 'string'
    ? { id: Number(value.id), label: value.label } : null;
const emptyInputs = (context = {}) => {
    const clientRecord = record(context?.clientRecord); const caseRecord = record(context?.caseRecord);
    return { clientId: clientRecord ? String(clientRecord.id) : '', caseId: caseRecord ? String(caseRecord.id) : '',
        roleClientIds: {}, manualValues: {}, clientRecord, caseRecord, roleRecords: {} };
};
const contextSignature = context => JSON.stringify(['clientRecord', 'caseRecord'].map(key =>
    [Object.hasOwn(context || {}, key), record(context?.[key])]));
const isDirtyDraft = draft => draft?.dirty === true || !!(draft?.source &&
    ((draft.name ?? draft.source.name) !== draft.source.name ||
    JSON.stringify(draft.roles ?? draft.source.roles ?? []) !== JSON.stringify(draft.source.roles || []) ||
    JSON.stringify(draft.bindings ?? draft.source.bindings ?? []) !== JSON.stringify(draft.source.bindings || [])));

export default function WordTemplatesWorkspace({ onBack, onContinue, initialContext, resumeDraft, onDraftChange }) {
    const { t, direction, number } = useSigningLocale();
    const text = (key, values) => t(`signingWord.${key}`, values);
    const [sources, setSources] = useState([]);
    const [listLoaded, setListLoaded] = useState(false);
    const [converterAvailable, setConverterAvailable] = useState(false);
    const [catalog, setCatalog] = useState(null);
    const [authoring, setAuthoring] = useState(null);
    const [authoringLoading, setAuthoringLoading] = useState(false);
    const [authoringError, setAuthoringError] = useState('');
    const [authoringAttempt, setAuthoringAttempt] = useState(0);
    const [readable, setReadable] = useState(false);
    const initialDraft = useRef(resumeDraft);
    const [source, setSource] = useState(() => initialDraft.current?.source || null);
    const [name, setName] = useState(() => initialDraft.current?.name || initialDraft.current?.source?.name || '');
    const [roles, setRoles] = useState(() => initialDraft.current?.roles || initialDraft.current?.source?.roles || []);
    const [bindings, setBindings] = useState(() => initialDraft.current?.bindings || initialDraft.current?.source?.bindings || []);
    const [dirty, setDirty] = useState(() => isDirtyDraft(initialDraft.current));
    const [mode, setMode] = useState(() => isDirtyDraft(initialDraft.current) || initialDraft.current?.mode === 'manage' ? 'manage' : 'use');
    const [selectedFile, setSelectedFile] = useState(null);
    const [selection, setSelection] = useState(null);
    const [field, setField] = useState('client.fullName');
    const [required, setRequired] = useState(true);
    const [inputs, setInputs] = useState(() => ({ ...emptyInputs(initialContext), ...initialDraft.current?.inputs,
        roleClientIds: { ...initialDraft.current?.inputs?.roleClientIds }, manualValues: { ...initialDraft.current?.inputs?.manualValues },
        roleRecords: { ...initialDraft.current?.inputs?.roleRecords } }));
    const [preview, setPreview] = useState(null);
    const [pdfReady, setPdfReady] = useState(false);
    const [acknowledged, setAcknowledged] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [leaveAction, setLeaveAction] = useState(null);
    const [showOverrides, setShowOverrides] = useState(false);
    const generation = useRef(0);
    const lock = useRef(false);
    const alive = useRef(true);
    const urlRef = useRef(null);
    const previewRef = useRef(null);
    const latestDraft = useRef(null);
    const draftListener = useRef(onDraftChange); draftListener.current = onDraftChange;
    const appliedContext = useRef(contextSignature(initialContext));
    const nextContext = contextSignature(initialContext);
    const previewHeading = useRef(null);
    const authoringGeneration = useRef(0);
    const selectionGeneration = useRef(0);
    const authoringRef = useRef(null); authoringRef.current = authoring;
    latestDraft.current = { source, name, roles, bindings, inputs, selectedFile, dirty, mode };

    const clearPreview = useCallback(() => {
        generation.current += 1;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = null; previewRef.current = null;
        setPreview(null); setPdfReady(false); setAcknowledged(false); setReadable(false);
    }, []);
    useEffect(() => {
        alive.current = true;
        let cancelled = false;
        api.list().then(result => { if (!cancelled) { setSources(result.sources || []); setCatalog(result.catalog || null); setConverterAvailable(result.converterAvailable === true); setListLoaded(true); } })
            .catch(() => { if (!cancelled) { setError('requestFailed'); setListLoaded(true); } });
        return () => { cancelled = true; alive.current = false; generation.current += 1; if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
    }, []);
    useEffect(() => {
        const token = ++authoringGeneration.current; selectionGeneration.current += 1;
        setAuthoring(null); setSelection(null); setAuthoringError('');
        if (mode !== 'manage' || !source || !converterAvailable) { setAuthoringLoading(false); return undefined; }
        let cancelled = false; setAuthoringLoading(true);
        (async () => {
            try {
                const result = await api.authoringRender(source.id, { expectedVersion: source.version, sourceHash: source.sourceHash });
                if (cancelled || token !== authoringGeneration.current) return;
                const data = validateAuthoring(result.authoring, source);
                const blob = await api.authoringPdf(data.renderId);
                await verifyPdfBlob(blob, data.pdfHash);
                if (!cancelled && token === authoringGeneration.current) {
                    setAuthoring({ data, pdfFile: blob }); if (data.catalog) setCatalog(data.catalog);
                }
            } catch (err) {
                if (!cancelled && token === authoringGeneration.current) setAuthoringError([409, 412].includes(err?.status) ? 'conflict' : 'authoringUnavailable');
            } finally { if (!cancelled && token === authoringGeneration.current) setAuthoringLoading(false); }
        })();
        return () => { cancelled = true; authoringGeneration.current += 1; selectionGeneration.current += 1; };
    }, [source, mode, converterAvailable, authoringAttempt]);
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = event => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);
    useEffect(() => {
        if (appliedContext.current === nextContext) return;
        appliedContext.current = nextContext;
        clearPreview(); setError('');
        setInputs(previous => {
            const next = { ...previous };
            for (const key of ['clientRecord', 'caseRecord']) if (Object.hasOwn(initialContext || {}, key)) {
                next[key] = record(initialContext[key]); next[key === 'clientRecord' ? 'clientId' : 'caseId'] = next[key] ? String(next[key].id) : '';
            }
            return next;
        });
    }, [nextContext, initialContext, clearPreview]); // Equal context objects must not replace the user's later choices.
    useEffect(() => {
        draftListener.current?.({ source, name, roles, bindings, inputs, dirty, mode });
    }, [source, name, roles, bindings, inputs, dirty, mode]);
    useEffect(() => {
        if (!preview) return;
        previewHeading.current?.focus(); previewHeading.current?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
    }, [preview]);

    function edit(change) { if (lock.current) return; clearPreview(); setNotice(''); setError(''); change(); setDirty(true); }
    function editInput(change) { if (lock.current) return; clearPreview(); setNotice(''); setError(''); setInputs(previous => change(previous)); }
    function discardTemplateChanges() {
        const current = latestDraft.current;
        const next = { source: current.source, name: current.source?.name || '', roles: current.source?.roles || [],
            bindings: current.source?.bindings || [], inputs: current.inputs, dirty: false, mode: current.mode };
        clearPreview(); setName(next.name); setRoles(next.roles); setBindings(next.bindings); setSelectedFile(null); setSelection(null); setDirty(false);
        draftListener.current?.(next);
    }
    function leave(action) { if (lock.current) return; if (dirty) setLeaveAction(() => () => { discardTemplateChanges(); action?.(); }); else action?.(); }
    function switchMode(next) { leave(() => setMode(next)); }
    function receive(next, { preserveDocumentInputs = false } = {}) {
        const sameSource = preserveDocumentInputs && latestDraft.current.source?.id === next.id;
        clearPreview(); setSource(next); setName(next.name); setRoles(next.roles || []); setBindings(next.bindings || []);
        setSelection(null); setInputs(previous => sameSource ? previous : ({ ...emptyInputs(), clientId: previous.clientId, caseId: previous.caseId,
            clientRecord: previous.clientRecord, caseRecord: previous.caseRecord }));
        setSelectedFile(null); setDirty(false); setNotice(''); setError('');
        if (next.catalog) setCatalog(next.catalog);
        setSources(previous => [next, ...previous.filter(item => item.id !== next.id)]);
    }
    async function run(operation) {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError(''); setNotice('');
        try { await operation(); }
        catch (err) { if (alive.current) { setError([409, 412].includes(err?.status) ? 'conflict' : err?.status === 503 ? 'converterUnavailable' : err?.status === 422 ? 'missingValues' : 'requestFailed'); if (err?.status === 422) setShowOverrides(true); } }
        finally { lock.current = false; if (alive.current) setBusy(false); }
    }
    function openSource(id, { preserveDocumentInputs = false } = {}) {
        if (!id) return;
        leave(() => run(async () => {
            const result = await api.load(id);
            if (alive.current) { receive(result.source, { preserveDocumentInputs }); setAuthoringAttempt(value => value + 1); }
        }));
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
        if (!source || !name.trim() || roles.some(role => !role.label.trim()) || authoringLoading || authoringError) return;
        const snapshot = latestDraft.current;
        let mapping;
        try {
            if (authoring) {
                validateAuthoring(authoring.data, snapshot.source);
                mapping = { bindingSchemaVersion: 2, authoringRenderId: authoring.data.renderId, authoringMapHash: authoring.data.mapHash,
                    bindings: snapshot.bindings.map(binding => ({ id: binding.id, field: binding.field, required: binding.required,
                        selector: binding.authoringRenderId === authoring.data.renderId ? binding.selector : selectorForAnchor(authoring.data, binding) })) };
            } else {
                if (snapshot.bindings.some(binding => binding.selector)) throw new Error('Missing authoring render');
                mapping = { bindings: snapshot.bindings };
            }
        } catch { setError('authoringUnmapped'); return; }
        return run(async () => {
            const result = await api.save(snapshot.source.id, { expectedVersion: snapshot.source.version, sourceHash: snapshot.source.sourceHash,
                name: snapshot.name.trim(), roles: snapshot.roles.map(role => ({ key: role.key, label: role.label.trim() })), ...mapping });
            if (!alive.current) return;
            // Saving mappings does not clear explicitly entered preview inputs.
            const savedInputs = snapshot.inputs;
            receive(result.source); setInputs(savedInputs); setNotice('saved');
        });
    }
    async function resolveVisualSelection(selector) {
        const current = authoringRef.current;
        if (lock.current || !current || authoringLoading || authoringError) return;
        const token = ++selectionGeneration.current; const renderToken = authoringGeneration.current;
        setSelection(null); setError('');
        try {
            const result = await api.resolveSelection(source.id, current.data.renderId, { expectedVersion: source.version, sourceHash: source.sourceHash,
                mapHash: current.data.mapHash, selector });
            if (!alive.current || token !== selectionGeneration.current || renderToken !== authoringGeneration.current || current !== authoringRef.current) return;
            const resolved = result.selection; const anchor = resolved?.anchor;
            const paragraph = paragraphs.find(item => item.part === anchor?.part && item.id === anchor?.paragraphId);
            if (!paragraph?.editable || anchor.sourceHash !== source.sourceHash || anchor.paragraphHash !== paragraph.textHash ||
                !Number.isInteger(anchor.start) || !Number.isInteger(anchor.end) || anchor.start < 0 || anchor.end > paragraph.text.length ||
                (resolved.kind === 'insert' ? anchor.start !== anchor.end : anchor.end <= anchor.start) ||
                resolved.kind !== selector.kind || JSON.stringify(resolved.selector) !== JSON.stringify(selector) ||
                resolved.selectedText !== paragraph.text.slice(anchor.start, anchor.end)) throw new Error('Invalid server selection');
            setSelection({ ...resolved, renderId: current.data.renderId, mapHash: current.data.mapHash });
        } catch (err) {
            if (alive.current && token === selectionGeneration.current && renderToken === authoringGeneration.current) setError([409, 412].includes(err?.status) ? 'conflict' : 'selectionInvalid');
        }
    }
    const paragraphs = (source?.model?.parts || []).flatMap(part => (part.paragraphs || []).map(paragraph => ({ ...paragraph, part: part.name })));
    const legacyDefinitions = [...CLIENT_FIELDS.map(value => ({ key: `client.${value}`, resolver: 'client', requiresRecord: 'client' })),
        ...CASE_FIELDS.map(value => ({ key: `case.${value}`, resolver: ['reference', 'title'].includes(value) ? 'case' : 'manual', requiresRecord: 'case' })),
        ...OFFICE_FIELDS.map(value => ({ key: `office.${value}`, resolver: 'manual' }))].map(item => ({ ...item, phase: 'storedData', available: true }));
    const definitions = [...(catalog?.fields || legacyDefinitions), ...roles.flatMap(role => (catalog?.roleFields || ROLE_FIELDS.map(property => ({ property,
        phase: 'storedData', available: true, resolver: ['capacity', 'authority'].includes(property) ? 'manual' : 'role' })))
        .map(item => ({ ...item, key: `role.${role.key}.${item.property}` })))].filter(item => item.phase === 'storedData' && item.available !== false);
    const fields = definitions.map(item => item.key);
    function fieldLabel(value, short = false) {
        const pieces = value.split('.');
        const property = pieces[0] === 'role' ? pieces[2] : pieces.slice(1).join('.');
        const label = text(`fields.${property.replace(/\./g, '_')}`);
        return short ? label : pieces[0] === 'role' ? text('roleField', { role: roles.find(role => role.key === pieces[1])?.label || pieces[1], field: label })
            : text('fieldLabel', { group: text(`groups.${pieces[0]}`), field: label });
    }
    function addBinding() {
        if (!selection || !authoring || authoringError || selection.renderId !== authoring.data.renderId || selection.mapHash !== authoring.data.mapHash || !fields.includes(field)) return;
        const { start, end, part, paragraphId } = selection.anchor;
        if (bindings.some(item => item.part === part && item.paragraphId === paragraphId &&
            (start === end || item.start === item.end ? start >= item.start && start <= item.end || item.start >= start && item.start <= end : item.start < end && start < item.end))) { setError('selectionOverlap'); return; }
        edit(() => setBindings(previous => [...previous, { id: uuid(), ...selection.anchor, kind: selection.kind,
            selector: selection.selector, authoringRenderId: authoring.data.renderId, field, required }])); setSelection(null); setError('');
    }
    const uniqueFields = [...new Set(bindings.map(binding => binding.field))];
    const neededRoles = roles.filter(role => bindings.some(binding => binding.field.startsWith(`role.${role.key}.`)));
    const referenceValues = [inputs.clientId, inputs.caseId, ...neededRoles.map(role => inputs.roleClientIds[role.key])];
    const validReferences = referenceValues.every(value => !value || positiveId(value));
    function needsManualValue(value) {
        const definition = definitions.find(item => item.key === value);
        if (definition?.resolver === 'manual') return true;
        const [group, key, roleField] = value.split('.');
        if (group === 'office') return true;
        if (group === 'case') return definition?.resolver === 'case' ? !inputs.caseId : !['reference', 'title'].includes(key) || !inputs.caseId;
        if (group === 'role') return !['fullName', 'companyName', 'identityNumber', 'companyNumber'].includes(roleField) || !inputs.roleClientIds[key];
        return group === 'client' && !inputs.clientId;
    }
    const requiredManualFields = uniqueFields.filter(value => needsManualValue(value) && bindings.some(binding => binding.field === value && binding.required));
    const overrideFields = uniqueFields.filter(value => !requiredManualFields.includes(value));
    const missingManualFields = requiredManualFields.some(value => !String(inputs.manualValues[value] || '').trim());
    function generatePreview() {
        if (!source || dirty || !bindings.length || !validReferences || missingManualFields || !converterAvailable) return;
        clearPreview(); const token = generation.current; const snapshot = latestDraft.current;
        run(async () => {
            const payload = { expectedVersion: snapshot.source.version, bindingsHash: snapshot.source.bindingsHash, inputs: {
                manualValues: Object.fromEntries(Object.entries(snapshot.inputs.manualValues).filter(([key]) => snapshot.bindings.some(binding => binding.field === key))),
                roleClientIds: Object.fromEntries(neededRoles.filter(role => snapshot.inputs.roleClientIds[role.key]).map(role => [role.key, Number(snapshot.inputs.roleClientIds[role.key])])),
                ...(snapshot.inputs.clientId ? { clientId: Number(snapshot.inputs.clientId) } : {}), ...(snapshot.inputs.caseId ? { caseId: Number(snapshot.inputs.caseId) } : {}),
            } };
            const result = await api.preview(snapshot.source.id, payload, uuid());
            if (!alive.current || token !== generation.current) return;
            if (result.preview?.sourceId !== snapshot.source.id || result.preview.sourceVersion !== snapshot.source.version ||
                result.preview.requiresFreshSigningGeometry !== true) throw new Error('Invalid preview provenance');
            const blob = await api.pdf(result.preview.id);
            await verifyPdfBlob(blob, result.preview.pdfHash);
            if (!alive.current || token !== generation.current) return;
            const url = URL.createObjectURL(blob); urlRef.current = url;
            const next = { ...result.preview, fileBlob: blob, url }; previewRef.current = next; setPreview(next);
        });
    }
    function continueToSigning() {
        if (lock.current || appliedContext.current !== nextContext || !preview || previewRef.current !== preview || !pdfReady || !acknowledged || dirty) return;
        onContinue?.(preview);
    }
    function openReadablePreview() {
        if (!alive.current || lock.current || busy || dirty || appliedContext.current !== nextContext ||
            !preview || previewRef.current !== preview || !pdfReady || !preview.fileBlob || preview.url !== urlRef.current) return;
        setReadable(value => !value);
    }

    const manualInput = value => <SimpleInput key={value} title={fieldLabel(value)} aria-label={fieldLabel(value)}
        value={inputs.manualValues[value] || ''} maxLength={4000} disabled={busy} timeToWaitInMilli={0}
        containerDir={direction} onChange={event => editInput(previous => ({ ...previous, manualValues: { ...previous.manualValues, [value]: event.target.value } }))} />;

    return <section className="lw-word" dir={direction} aria-label={text('title')}>
        <SigningBackButton onPress={() => leave(onBack)}>{text('back')}</SigningBackButton>
        <header className="lw-word__heading">
            <div><h1><TextBold24>{text('title')}</TextBold24></h1><Text14>{text(mode === 'use' ? 'useIntro' : 'manageIntro')}</Text14></div>
            <SecondaryButton onPress={() => switchMode(mode === 'use' ? 'manage' : 'use')} disabled={busy}>
                {text(mode === 'use' ? 'manageTemplates' : 'useTemplates')}
            </SecondaryButton>
        </header>
        {error && <StatusNotice><p>{text(error)}</p></StatusNotice>}
        {notice && <p role="status" className="lw-word__notice">{text(notice)}</p>}
        {busy && <p role="status">{text('working')}</p>}
        <div className="lw-word__library">
            <label>{text('library')}<SigningSelect value={source?.id || ''} disabled={busy} onChange={event => openSource(event.target.value)}>
                <option value="">{text('chooseSource')}</option>{sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </SigningSelect></label>
            {!source && <Text14>{text(!listLoaded ? 'loadingTemplates' : sources.length ? 'chooseSourceHelp' : 'noTemplates')}</Text14>}
        </div>
        {mode === 'manage' && <>
            <section className="lw-word__section" aria-label={text('importSection')}>
                <h2><TextBold18>{text('importSection')}</TextBold18></h2>
                <FileUploadBox accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy}
                    fileName={selectedFile?.name} onFileSelected={chooseFile} label={text('upload')} hint={text('uploadHint')} />
                {(selectedFile || source) && <SimpleInput title={text('name')} aria-label={text('name')} value={name} maxLength={160}
                    disabled={busy} timeToWaitInMilli={0} onChange={event => edit(() => setName(event.target.value))} />}
                {selectedFile && <PrimaryButton disabled={busy || !name.trim()} onPress={importSource}>{text('import')}</PrimaryButton>}
            </section>
            {source && <>
                <section className="lw-word__section" aria-label={text('roles')}>
                    <h2><TextBold18>{text('roles')}</TextBold18></h2><Text14>{text('rolesHelp')}</Text14>
                    {roles.map((role, index) => <div key={role.key} className="lw-word__role">
                        <SimpleInput title={text('roleNumber', { number: number(index + 1) })} aria-label={text('roleNumber', { number: number(index + 1) })}
                            value={role.label} maxLength={80} disabled={busy} timeToWaitInMilli={0}
                            onChange={event => edit(() => setRoles(previous => previous.map(item => item.key === role.key ? { ...item, label: event.target.value } : item)))} />
                        <TertiaryButton disabled={busy || bindings.some(binding => binding.field.startsWith(`role.${role.key}.`))}
                            onPress={() => edit(() => setRoles(previous => previous.filter(item => item.key !== role.key)))}>{text('removeRole')}</TertiaryButton>
                    </div>)}
                    <SecondaryButton disabled={busy || roles.length >= 20} onPress={() => edit(() => {
                        const used = new Set(roles.map(role => role.key)); let index = 1; while (used.has(`role${index}`)) index += 1;
                        setRoles(previous => [...previous, { key: `role${index}`, label: text('newRole', { number: number(index) }) }]);
                    })}>{text('addRole')}</SecondaryButton>
                </section>
                <section className="lw-word__section" aria-label={text('mapping')}>
                    <h2><TextBold18>{text('mapping')}</TextBold18></h2><Text14>{text('mappingHelp')}</Text14>
                    <p>{text('finalSigningFieldsHelp')}</p>
                    {authoringLoading && <p role="status">{text('authoringLoading')}</p>}
                    {authoringError && <StatusNotice><p>{text(authoringError)}</p>
                        <SecondaryButton disabled={authoringLoading || busy} onPress={() => openSource(source.id, { preserveDocumentInputs: true })}>{text('retryAuthoring')}</SecondaryButton>
                    </StatusNotice>}
                    {!converterAvailable && <StatusNotice><p>{text('converterUnavailable')}</p></StatusNotice>}
                    {authoring && <div className="lw-signing-pdfViewerWrapper">
                        <div className="lw-signing-pdfViewerRow lw-word__visualRow">
                            <aside className="lw-word__mappingForm">
                                <WordDataFieldPanel definitions={definitions} roles={roles} value={field} disabled={busy}
                                    onChange={setField} fieldLabel={fieldLabel} text={text} />
                                {selection ? <div className="lw-word__selected" role="status"><strong>{text(selection.kind === 'insert' ? 'insertionSelected' : 'textSelected')}</strong>
                                    <p><bdi>{selection.selectedText || text('insertionSelected')}</bdi></p></div> : <p>{text('selectTextHelp')}</p>}
                                <label className="lw-word__check"><input type="checkbox" checked={required} disabled={busy} onChange={event => setRequired(event.target.checked)} />{text('required')}</label>
                                <PrimaryButton disabled={busy || !!authoringError || !selection || !fields.includes(field)} onPress={addBinding}>{text('bind')}</PrimaryButton>
                            </aside>
                            <div className="lw-signing-pdfViewerMain">
                                <WordSourceViewer key={authoring.data.renderId} authoring={authoring.data} pdfFile={authoring.pdfFile} bindings={bindings}
                                    disabled={busy || !!authoringError} onSelect={resolveVisualSelection} onError={message => { selectionGeneration.current += 1; setSelection(null); setAuthoringError(message); }} fieldLabel={fieldLabel} text={text} />
                            </div>
                        </div>
                    </div>}
                    <ul className="lw-word__bindings" aria-label={text('bindings')}>{bindings.map(binding => <li key={binding.id}>
                        <div><strong>{fieldLabel(binding.field)}</strong><p><bdi>{binding.kind === 'insert' ? text('insertionSelected') : paragraphs.find(paragraph => paragraph.part === binding.part && paragraph.id === binding.paragraphId)?.text.slice(binding.start, binding.end)}</bdi> · {text(binding.required ? 'required' : 'optional')}</p></div>
                        <TertiaryButton disabled={busy} onPress={() => edit(() => setBindings(previous => previous.filter(item => item.id !== binding.id)))}>{text('removeBinding')}</TertiaryButton>
                    </li>)}</ul>
                </section>
                <div className="lw-word__actions">
                    <PrimaryButton disabled={busy || authoringLoading || !!authoringError || !dirty || !name.trim() || roles.some(role => !role.label.trim())} onPress={saveSource}>{text('save')}</PrimaryButton>
                    <SecondaryButton disabled={busy} onPress={() => switchMode('use')}>{text('useThisTemplate')}</SecondaryButton>
                </div><Text14>{text('privateHelp')}</Text14>
            </>}
        </>}
        {mode === 'use' && source && <>
            <section className="lw-word__section" aria-label={text('fill')}>
                <h2><TextBold18>{text('fill')}</TextBold18></h2><Text14>{text('fillHelp')}</Text14>
                <div className="lw-word__references">
                    <WordRecordPicker kind="client" label={text('clientId')} value={inputs.clientRecord} disabled={busy}
                        onChange={value => editInput(previous => ({ ...previous, clientRecord: value, clientId: value ? String(value.id) : '' }))} />
                    <WordRecordPicker kind="case" label={text('caseId')} value={inputs.caseRecord} disabled={busy}
                        onChange={value => editInput(previous => ({ ...previous, caseRecord: value, caseId: value ? String(value.id) : '' }))} />
                </div>
                {neededRoles.length > 0 && <div className="lw-word__rolePeople"><h3>{text('peopleForFields')}</h3><Text14>{text('peopleForFieldsHelp')}</Text14>
                    <div className="lw-word__references">{neededRoles.map(role => <WordRecordPicker key={role.key} label={text('roleClientId', { role: role.label })}
                        value={inputs.roleRecords[role.key]} disabled={busy} onChange={value => editInput(previous => ({ ...previous,
                            roleRecords: { ...previous.roleRecords, [role.key]: value }, roleClientIds: { ...previous.roleClientIds, [role.key]: value ? String(value.id) : '' } }))} />)}</div>
                </div>}
                {!validReferences && <p role="alert">{text('referenceInvalid')}</p>}
                <Text14>{text('storedValuesHelp')}</Text14>
                {requiredManualFields.length > 0 && <div className="lw-word__manualFields"><h3>{text('requiredDocumentValues')}</h3><Text14>{text('documentOnlyHelp')}</Text14>
                    <div className="lw-word__valueGrid">{requiredManualFields.map(manualInput)}</div>
                </div>}
                {overrideFields.length > 0 && <details className="lw-word__overrides" open={showOverrides} onToggle={event => setShowOverrides(event.currentTarget.open)}>
                    <summary>{text('overrideValues')}</summary><Text14>{text('overrideHelp')}</Text14>
                    {overrideFields.map(value => { const overridden = Object.hasOwn(inputs.manualValues, value); return <div key={value}>
                        <label className="lw-word__check"><input type="checkbox" checked={overridden} disabled={busy} onChange={event => editInput(previous => {
                            const next = { ...previous.manualValues }; if (event.target.checked) next[value] = ''; else delete next[value]; return { ...previous, manualValues: next };
                        })} />{text('manualField', { field: fieldLabel(value) })}</label>{overridden && manualInput(value)}
                    </div>; })}
                </details>}
                {!converterAvailable && <StatusNotice><p>{text('converterUnavailable')}</p></StatusNotice>}
                {dirty && <p>{text('saveFirst')}</p>}
                {!bindings.length && <p>{text('noMappedFields')}</p>}
                {missingManualFields && <p className="lw-word__muted">{text('completeRequiredValues')}</p>}
                <div className="lw-word__actions"><PrimaryButton disabled={busy || dirty || !bindings.length || !validReferences || missingManualFields || !converterAvailable} onPress={generatePreview}>{text('preview')}</PrimaryButton></div>
            </section>
            {preview && <section className="lw-word__section" aria-label={text('finalPreview')}>
                <h2 ref={previewHeading} tabIndex={-1}><TextBold18>{text('finalPreview')}</TextBold18></h2><Text14>{text('freshGeometry')}</Text14>
                <div className="lw-word__actions"><SecondaryButton disabled={busy || !pdfReady || dirty} onPress={openReadablePreview}
                    aria-expanded={readable} aria-describedby="word-readable-preview-help">{text(readable ? 'closeReadablePreview' : 'openReadablePreview')}</SecondaryButton></div>
                <p id="word-readable-preview-help">{text('readablePreviewHelp')}</p>
                <div className={`lw-word__review${readable ? ' lw-word__review--readable' : ''}`}>
                    <PdfViewer key={preview.url} pdfSource={preview.url} spots={[]} signers={[]} onDocumentReady={ready => { if (previewRef.current === preview) setPdfReady(ready); }} />
                </div>
                <label className="lw-word__check"><input type="checkbox" checked={acknowledged} disabled={!pdfReady || busy} onChange={event => setAcknowledged(event.target.checked)} />{text('previewAcknowledgement')}</label>
                <div className="lw-word__actions"><PrimaryButton disabled={busy || !pdfReady || !acknowledged || dirty || !onContinue} onPress={continueToSigning}>{text('continue')}</PrimaryButton></div>
            </section>}
        </>}
        {leaveAction && <SimplePopUp isOpen onClose={() => setLeaveAction(null)} role="dialog" aria-modal="true" aria-label={text('discardTitle')} dir={direction}>
            <ConfirmationDialog title={text('discardTitle')} message={text('discardMessage')} confirmText={text('discard')} cancelText={text('keepEditing')}
                onCancel={() => setLeaveAction(null)} onConfirm={() => { const action = leaveAction; setLeaveAction(null); action(); }} />
        </SimplePopUp>}
    </section>;
}
