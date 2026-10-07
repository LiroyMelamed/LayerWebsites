import React, { useEffect, useState } from 'react';
import PdfViewer from '../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer';
import { uploadFileToR2 } from '../../../utils/fileUploadUtils';
import StatusNotice from '../../../components/ui/StatusNotice';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import api from '../../../api/signingTemplatesApi';

const FIELD_LABELS = { signature: 'חתימה', initials: 'ראשי תיבות', text: 'טקסט', date: 'תאריך', number: 'מספר', checkbox: 'תיבת סימון' };
const ROLE_LABELS = { first: 'חותם ראשון', second: 'חותם שני', shared: 'חותם משותף לכל החבילות', lawyer: 'עורך דין', custom: 'תפקיד נוסף' };
const initial = () => ({ name: '', roles: [{ id: 'first', name: 'חותם ראשון', kind: 'first' }], documents: [], requireOtp: true, signingOrder: 'parallel', completionEmail: '', completionMode: 'document' });

export default function TemplateBuilder({ template, onBack, onSaved }) {
    const [draft, setDraft] = useState(() => template?.definition || initial());
    const [activeDoc, setActiveDoc] = useState(0);const [selected, setSelected] = useState(null);
    const [pdfFiles, setPdfFiles] = useState({});const [page, setPage] = useState(1);
    const [roleId, setRoleId] = useState(draft.roles[0].id);const [type, setType] = useState('signature');
    const [busy, setBusy] = useState(false);const [error, setError] = useState('');
    const document = draft.documents[activeDoc];const field = document?.fields[selected];
    useEffect(() => {
        if (!template || !document || pdfFiles[document.id]) return undefined;
        let cancelled = false;
        api.pdf(template.id, document.id).then(blob => { if (!cancelled) setPdfFiles(prev => ({ ...prev, [document.id]: blob })); }).catch(e => { if (!cancelled) setError(e.message); });
        return () => { cancelled = true; };
    }, [template, document, pdfFiles]);
    const change = patch => setDraft(prev => ({ ...prev, ...patch }));
    const updateDocument = update => setDraft(prev => ({ ...prev, documents: prev.documents.map((doc, i) => i === activeDoc ? update(doc) : doc) }));
    const updateField = (index, patch) => updateDocument(doc => ({ ...doc, fields: doc.fields.map((item, i) => i === index ? { ...item, ...patch } : item) }));
    const removeField = index => { updateDocument(doc => ({ ...doc, fields: doc.fields.filter((_, i) => i !== index) }));setSelected(null); };
    async function upload(file) {
        if (!file) return;if (!/\.pdf$/i.test(file.name) || file.size > 20 * 1024 * 1024) { setError('יש לבחור קובץ PDF עד 20MB');return; }
        setBusy(true);setError('');
        try {
            const result = await uploadFileToR2(file);if (!result.success) throw new Error('העלאת המסמך נכשלה. נסה שוב');
            const id = crypto.randomUUID();setPdfFiles(prev => ({ ...prev, [id]: file }));
            setDraft(prev => ({ ...prev, documents: [...prev.documents, { id, name: file.name, fileKey: result.data.key, fields: [] }] }));
            setActiveDoc(draft.documents.length);setSelected(null);setPage(1);
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    function addField() {
        const next = { pageNum: page, x: 48, y: 60 + Math.min(document.fields.length, 6) * 60, width: type === 'checkbox' ? 28 : 180, height: type === 'checkbox' ? 28 : 48, roleId, fieldType: type, isRequired: true, fieldLabel: '' };
        updateDocument(doc => ({ ...doc, fields: [...doc.fields, next] }));setSelected(document.fields.length);
    }
    async function save() {
        setBusy(true);setError('');
        try { const result = await api.save(draft, template?.id, template?.version);onSaved(result.template); }
        catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    return <section className="lw-templates" dir="rtl">
        <SecondaryButton onPress={onBack} disabled={busy}>חזרה לתבניות</SecondaryButton>
        <header className="lw-templates__heading"><div><h1>{template ? 'עריכת תבנית' : 'תבנית חתימה חדשה'}</h1><p>מגדירים מסמכים ותפקידי חותמים פעם אחת. בוחרים את האנשים בכל שליחה.</p></div></header>
        {error && <StatusNotice><p>{error}</p></StatusNotice>}
        <div className="lw-templates__setup">
            <label>שם התבנית<input value={draft.name} maxLength={120} onChange={e => change({ name: e.target.value })} placeholder="לדוגמה: הסכם התקשרות וייפוי כוח" /></label>
            <label>סדר החתימות<select value={draft.signingOrder} onChange={e => change({ signingOrder: e.target.value })}><option value="parallel">כל החותמים במקביל</option><option value="sequential">לפי סדר התפקידים</option></select></label>
            <label>אימייל לקבלת מסמכים שהושלמו<input type="email" dir="ltr" value={draft.completionEmail} onChange={e => change({ completionEmail: e.target.value })} placeholder="office@example.com" /></label>
            <label>הודעת סיום למשרד<select value={draft.completionMode || 'document'} onChange={e => change({ completionMode: e.target.value })}><option value="document">הודעה על כל מסמך שהושלם</option><option value="package">הודעה אחת עם קישור לכל החבילה</option></select></label>
        </div>
        <h2>תפקידי החותמים</h2>
        <div className="lw-templates__roles">{draft.roles.map((role, index) => <div className="lw-templates__role" key={role.id}>
            <span>{index + 1}</span><label>שם התפקיד<input aria-label={`שם תפקיד ${index + 1}`} value={role.name} maxLength={80} onChange={e => change({ roles: draft.roles.map(r => r.id === role.id ? { ...r, name: e.target.value } : r) })} /></label>
            <label>סוג החותם<select value={role.kind} onChange={e => change({ roles: draft.roles.map(r => r.id === role.id ? { ...r, kind: e.target.value } : r) })}>{Object.entries(ROLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <button type="button" disabled={draft.roles.length === 1 || draft.documents.some(doc => doc.fields.some(f => f.roleId === role.id))} onClick={() => { const roles = draft.roles.filter(r => r.id !== role.id);change({ roles });if (roleId === role.id) setRoleId(roles[0].id); }}>הסרת תפקיד</button>
        </div>)}</div>
        <button type="button" disabled={draft.roles.length >= 8} onClick={() => change({ roles: [...draft.roles, { id: `role_${crypto.randomUUID().slice(0, 8)}`, name: 'חותם נוסף', kind: 'custom' }] })}>הוספת תפקיד</button>
        <h2>המסמכים ושדות החתימה</h2>
        <div className="lw-templates__toolbar"><div className="lw-templates__tabs" role="tablist" aria-label="מסמכי התבנית">{draft.documents.map((doc, i) => <button type="button" key={doc.id} role="tab" aria-selected={activeDoc === i} onClick={() => { setActiveDoc(i);setSelected(null);setPage(1); }}>{doc.name} <small>({doc.fields.length} שדות)</small></button>)}</div>
            <label className="lw-templates__file">הוספת PDF<input type="file" accept=".pdf,application/pdf" disabled={busy || draft.documents.length >= 10} onChange={e => { upload(e.target.files?.[0]);e.target.value = ''; }} /></label></div>
        {!document ? <div className="lw-templates__empty"><h3>הוסף את המסמך הראשון</h3><p>לאחר ההעלאה אפשר למקם שדות על כל עמוד ולשייך אותם לתפקידי החותמים.</p></div> : <div className="lw-templates__editor">
            <aside className="lw-templates__fieldTools">
                <label>שם המסמך<input value={document.name} maxLength={160} onChange={e => updateDocument(doc => ({ ...doc, name: e.target.value }))} /></label>
                <label>תפקיד חותם<select value={roleId} onChange={e => setRoleId(e.target.value)}>{draft.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
                <label>סוג שדה<select value={type} onChange={e => setType(e.target.value)}>{Object.entries(FIELD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label>עמוד<input type="number" min="1" max="500" value={page} onChange={e => setPage(Number(e.target.value) || 1)} /></label>
                <button type="button" className="is-primary" disabled={!pdfFiles[document.id] || document.fields.length >= 150} onClick={addField}>הוספת שדה לעמוד {page}</button>
                <p>גרור את השדה למקום הרצוי. בחר שדה כדי לשנות את השיוך או הגודל.</p>
                {field && <fieldset><legend>השדה שנבחר</legend>
                    <label>תפקיד<select value={field.roleId} onChange={e => updateField(selected, { roleId: e.target.value })}>{draft.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
                    <label>תווית<input value={field.fieldLabel || ''} maxLength={120} onChange={e => updateField(selected, { fieldLabel: e.target.value })} /></label>
                    <label className="lw-templates__check"><input type="checkbox" checked={field.isRequired} onChange={e => updateField(selected, { isRequired: e.target.checked })} />שדה חובה</label>
                    <button type="button" onClick={() => removeField(selected)}>מחיקת השדה</button>
                </fieldset>}
                <button type="button" onClick={() => { change({ documents: draft.documents.filter((_, i) => i !== activeDoc) });setActiveDoc(0);setSelected(null); }}>הסרת המסמך מהתבנית</button>
            </aside>
            <div className="lw-templates__pdf">{pdfFiles[document.id] ? <PdfViewer key={document.id} pdfFile={pdfFiles[document.id]} spots={document.fields.map(f => ({ ...f, signerIndex: draft.roles.findIndex(r => r.id === f.roleId), signerName: draft.roles.find(r => r.id === f.roleId)?.name }))} signers={draft.roles.map((r, i) => ({ UserId: i + 1, Name: r.name }))} onUpdateSpot={updateField} onRemoveSpot={removeField} onRequestRemove={removeField} onSelectSpot={setSelected} selectedSpotIndex={selected} /> : <p role="status">טוען מסמך…</p>}</div>
        </div>}
        <footer className="lw-templates__footer"><div><label className="lw-templates__check"><input type="checkbox" checked={draft.requireOtp} onChange={e => change({ requireOtp: e.target.checked, otpWaiverAcknowledged: false })} />אימות החותמים באמצעות קוד חד־פעמי</label>
            {!draft.requireOtp && <label className="lw-templates__check"><input type="checkbox" checked={!!draft.otpWaiverAcknowledged} onChange={e => change({ otpWaiverAcknowledged: e.target.checked })} />אני מאשר במפורש שליחה ללא אימות קוד</label>}
            {template && <p>השינוי יחול על שליחות חדשות. חבילות שכבר נוצרו ישמרו את הגרסה הקודמת.</p>}</div>
            <button type="button" className="is-primary" disabled={busy || !draft.name.trim() || !draft.documents.length} onClick={save}>{busy ? 'שומר…' : 'שמירת התבנית'}</button></footer>
    </section>;
}
