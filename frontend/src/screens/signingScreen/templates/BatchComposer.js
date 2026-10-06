import React, { useRef, useState } from 'react';
import api from '../../../api/signingTemplatesApi';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';
import RecipientFields from './RecipientFields';

export default function BatchComposer({ template, onBack, onCreated }) {
    const definition = template.definition;const roles = definition.roles;
    const emptyRow = () => ({ label: '', signers: Object.fromEntries(roles.filter(r => !r.shared).map(r => [r.id, { deliveryMethod: 'email' }])) });
    const [rows, setRows] = useState([emptyRow()]);const [shared, setShared] = useState({});const [name, setName] = useState(template.name);
    const [busy, setBusy] = useState(false);const [error, setError] = useState('');const [importErrors, setImportErrors] = useState([]);
    const [importPreview, setImportPreview] = useState(null);const [locked, setLocked] = useState(false);
    const requestId = useRef(crypto.randomUUID());
    async function importFile(file) {
        if (!file) return;if (file.size > 2 * 1024 * 1024) { setError('יש לבחור קובץ Excel עד 2MB');return; }
        setBusy(true);setError('');setImportErrors([]);setImportPreview(null);
        try {
            const encoded = await new Promise((resolve, reject) => { const reader = new FileReader();reader.onload = () => resolve(String(reader.result).split(',')[1]);reader.onerror = reject;reader.readAsDataURL(file); });
            const data = await api.importWorkbook(template.id, encoded);setImportErrors(data.errors);if (data.valid) setImportPreview(data.rows);
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    async function create() {
        setBusy(true);setLocked(true);setError('');
        try {
            const result = await api.create({ templateId: template.id, templateVersion: template.version, idempotencyKey: requestId.current, name, sharedSigners: shared, packages: rows });onCreated(result.batch.id);
        } catch (e) {
            // Validation can be corrected; an unknown server outcome must retain the exact request.
            if ([400, 402, 403, 404, 422].includes(e.status)) setLocked(false);
            setError(e.status >= 500 ? 'לא התקבל אישור ליצירת החבילות. אפשר ללחוץ שוב כדי לברר את אותה יצירה, ללא שכפול.' : e.message);
        } finally { setBusy(false); }
    }
    const editRow = (index, patch) => setRows(prev => prev.map((row, i) => index === i ? { ...row, ...patch } : row));
    return <section className="lw-templates" dir="rtl">
        <header className="lw-templates__heading"><div><h1>שליחה מתבנית</h1><p>{template.name} · גרסה {template.version} · {definition.documents.length} מסמכים בכל חבילה</p></div><button type="button" onClick={onBack} disabled={busy}>חזרה לתבניות</button></header>
        {error && <div className="lw-templates__error" role="alert"><p>{error}</p></div>}
        <fieldset disabled={busy || locked} className="lw-templates__unboxed">
            <label>שם השליחה<input value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label>
            {roles.some(r => r.shared) && <><h2>חותמים קבועים לכל החבילות</h2><p>כל אחד יקבל קישור אחד שמרכז את המסמכים שלו.</p>{roles.filter(r => r.shared).map(role => <RecipientFields key={role.id} role={role} value={shared[role.id]} onChange={value => setShared(prev => ({ ...prev, [role.id]: value }))} />)}</>}
            <div className="lw-templates__heading"><div><h2>נמעני החבילות</h2><p>כל שורה יוצרת חבילה נפרדת. אפשר לערוך את הנמענים לפני יצירתה.</p></div><div className="lw-templates__actions">
                <button type="button" onClick={async () => { try { await downloadBlobAsFile(await api.workbook(template.id), 'recipients.xlsx'); } catch (e) { setError(e.message); } }}>הורדת קובץ Excel למילוי</button>
                <label className="lw-templates__file">ייבוא מאקסל<input type="file" accept=".xlsx" onChange={e => { importFile(e.target.files?.[0]);e.target.value = ''; }} /></label>
            </div></div>
            {!!importErrors.length && <div className="lw-templates__error" role="alert"><strong>הקובץ לא יובא. תקן את השורות הבאות:</strong><ul>{importErrors.map(item => <li key={item.row}>שורה {item.row}: {item.message}</li>)}</ul></div>}
            {importPreview && <div className="lw-templates__importPreview"><h3>נמצאו {importPreview.length} חבילות תקינות</h3><ul>{importPreview.map((row, i) => <li key={i}>{row.label} — {Object.values(row.signers).map(s => s.name).join(', ')}</li>)}</ul><button type="button" className="is-primary" onClick={() => { setRows(importPreview);setImportPreview(null); }}>החלפת הרשימה בנמענים מהקובץ</button><button type="button" onClick={() => setImportPreview(null)}>ביטול הייבוא</button></div>}
            {rows.map((row, index) => <section className="lw-templates__package" key={index}>
                <div className="lw-templates__heading"><h3>חבילה {index + 1}</h3><button type="button" disabled={rows.length === 1} onClick={() => setRows(prev => prev.filter((_, i) => i !== index))}>הסרת החבילה</button></div>
                <label>שם החבילה<input value={row.label} maxLength={120} placeholder={`חבילה ${index + 1}`} onChange={e => editRow(index, { label: e.target.value })} /></label>
                {roles.filter(r => !r.shared).map(role => <RecipientFields key={role.id} role={role} value={row.signers[role.id]} onChange={value => editRow(index, { signers: { ...row.signers, [role.id]: value } })} />)}
            </section>)}
            <button type="button" disabled={rows.length >= 50 || (rows.length + 1) * definition.documents.length > 200} onClick={() => setRows(prev => [...prev, emptyRow()])}>הוספת חבילה</button>
        </fieldset>
        <footer className="lw-templates__footer"><div><strong>{rows.length} חבילות · {rows.length * definition.documents.length} מסמכים</strong><p>בשלב הבא אפשר לבדוק את החבילות ולאשר את שליחת ההזמנות.</p></div><button type="button" className="is-primary" onClick={create} disabled={busy || !!importPreview}>{busy ? 'יוצר חבילות…' : 'יצירת החבילות לבדיקה'}</button></footer>
    </section>;
}
