import SigningBackButton from './SigningBackButton';
import React, { useEffect, useRef, useState } from 'react';
import api from '../../../api/signingTemplatesApi';
import TemplateBuilder from './TemplateBuilder';
import BatchComposer from './BatchComposer';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';
import StatusNotice from '../../../components/ui/StatusNotice';
import './templates.scss';

const STATUS = { draft: 'טיוטה — טרם פורסם לנמען', ready: 'מפורסם — ממתין לחתימות', sending: 'השליחה מתבצעת', sent: 'ההזמנות נשלחו', partial: 'נדרשת בדיקת מסירה', pending: 'ממתין', uncertain: 'המסירה לא אושרה', signed: 'נחתם', rejected: 'נדחה', cancelled: 'בוטל' };
export default function TemplatesWorkspace({ onClose, canUpload, canManage, onSendTemplate }) {
    const [mode, setMode] = useState('list');const [templates, setTemplates] = useState([]);const [batches, setBatches] = useState([]);
    const [current, setCurrent] = useState(null);const [batch, setBatch] = useState(null);const [busy, setBusy] = useState(false);const [error, setError] = useState('');const [link, setLink] = useState('');const sending = useRef(false);
    async function refresh() { setBusy(true);setError('');try { const [t, b] = await Promise.all([api.list(), api.batches()]);setTemplates(t.templates);setBatches(b.batches); } catch (e) { setError(e.message); } finally { setBusy(false); } }
    useEffect(() => { refresh(); }, []);
    async function openTemplate(id, next) { setBusy(true);setError('');try { setCurrent((await api.load(id)).template);setMode(next); } catch (e) { setError(e.message); } finally { setBusy(false); } }
    async function openBatch(id) { setBusy(true);setError('');try { setBatch(await api.batch(id));setMode('batch');setLink(''); } catch (e) { setError(e.message); } finally { setBusy(false); } }
    const back = () => { setMode('list');setError('');refresh(); };
    if (mode === 'builder') return <TemplateBuilder template={current} onBack={back} onSaved={back} />;
    if (mode === 'compose') return <BatchComposer template={current} onBack={back} onCreated={openBatch} />;
    return <section className="lw-templates" dir="rtl">
        <SigningBackButton onPress={mode === 'batch' ? back : onClose}>{mode === 'batch' ? 'חזרה לתבניות' : 'חזרה למסמכים'}</SigningBackButton>
        <header className="lw-templates__heading"><div><h1>{mode === 'batch' ? batch.batch.name : 'תבניות ושליחה מרוכזת'}</h1><p>{mode === 'batch' ? 'חבילות, הזמנות והתקדמות החתימות' : 'מסמכים מוכנים לשימוש חוזר, עם שדות ותפקידי חותמים קבועים.'}</p></div></header>
        {error && <StatusNotice onAction={() => mode === 'batch' ? openBatch(batch.batch.id) : refresh()} actionLabel="רענון"><p>{error}</p></StatusNotice>}
        {busy && <p role="status">טוען…</p>}
        {mode === 'list' ? <>
            <div className="lw-templates__toolbar"><h2>התבניות במשרד</h2>{canUpload && <button type="button" className="is-primary" onClick={() => { setCurrent(null);setMode('builder'); }}>תבנית חדשה</button>}</div>
            {!templates.length && !busy && <div className="lw-templates__empty"><h3>מכינים פעם אחת, שולחים שוב ושוב</h3><p>הוסף תבנית עם מסמכי המשרד והגדר היכן כל תפקיד צריך לחתום.</p></div>}
            <ul className="lw-templates__list">{templates.map(template => <li key={template.id}><div><strong>{template.name}</strong><p>{template.document_count} מסמכים · גרסה {template.version}</p></div><div className="lw-templates__actions">
                {canUpload && <button type="button" className="is-primary" disabled={busy} onClick={() => onSendTemplate ? onSendTemplate(template) : openTemplate(template.id, 'compose')}>שליחה מהתבנית</button>}
                {canManage && canUpload && <button type="button" disabled={busy} onClick={() => openTemplate(template.id, 'builder')}>עריכה</button>}
                {canManage && <button type="button" disabled={busy} onClick={async () => { if (!window.confirm(`להעביר את ״${template.name}״ לארכיון? חבילות קיימות לא ישתנו.`)) return;try { await api.archive(template.id, template.version);refresh(); } catch (e) { setError(e.message); } }}>ארכיון</button>}
            </div></li>)}</ul>
            <h2>שליחות מרוכזות</h2><ul className="lw-templates__list">{batches.map(item => <li key={item.id}><div><strong>{item.name}</strong><p>{STATUS[item.status] || item.status} · {new Date(item.created_at).toLocaleDateString('he-IL')}</p></div><button type="button" onClick={() => openBatch(item.id)}>פרטי השליחה</button></li>)}</ul>
            {!batches.length && !busy && <p>שליחות שתיצור מתבנית יופיעו כאן למעקב.</p>}
        </> : <>
            <div className="lw-templates__toolbar"><div><strong>{STATUS[batch.batch.status]}</strong><p>{batch.files.length} מסמכים · {batch.recipients.length} נמענים · גרסת תבנית {batch.batch.template_version}</p></div><div className="lw-templates__actions">
                <button type="button" disabled={busy} onClick={() => openBatch(batch.batch.id)}>רענון מצב</button>
                {batch.canDeliver && batch.recipients.some(r => r.status === 'pending') && <button type="button" className="is-primary" disabled={busy} onClick={async () => { if (sending.current) return;sending.current = true;setBusy(true);setError('');try { setBatch(await api.send(batch.batch.id)); } catch (e) { setError(e.message); } finally { setBusy(false);sending.current = false; } }}>שליחת ההזמנות לנמענים</button>}
            </div></div>
            <h2>הזמנות</h2><ul className="lw-templates__list">{batch.recipients.map(person => <li key={person.id}><div><strong>{person.name}</strong><p>{STATUS[person.status] || person.status} · {person.delivery_method === 'email' ? 'אימייל' : person.delivery_method === 'phone' ? 'SMS' : 'אימייל ו־SMS'}</p>{person.status === 'uncertain' && <p>ייתכן שההודעה התקבלה. לא נשלחת הזמנה חוזרת אוטומטית.</p>}</div>{batch.canDeliver && <button type="button" onClick={async () => { try { const result = await api.link(batch.batch.id, person.id);setLink(result.url);setBatch(await api.batch(batch.batch.id)); } catch (e) { setError(e.message); } }}>קישור לחתימה</button>}</li>)}</ul>
            {link && <label>קישור למסירה לנמען<input readOnly dir="ltr" value={link} onFocus={e => e.target.select()} /><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); } catch { setError('בחר את הקישור והעתק אותו ידנית'); } }}>העתקת הקישור</button></label>}
            <h2>מסמכי החבילות</h2><ul className="lw-templates__list">{batch.files.map(file => <li key={file.signingfileid}><strong>{file.filename}</strong><span>{STATUS[file.status] || file.status} · {file.signed_count}/{file.required_count} שדות הושלמו</span></li>)}</ul>
            <div className="lw-templates__actions">{batch.batch.snapshot.packages.map((item, index) => {
                const files = batch.files.filter(file => file.package_index === index);
                return files.length === batch.batch.snapshot.definition.documents.length && files.every(file => file.status === 'signed') && <button type="button" key={index} disabled={busy} onClick={async () => {
                    setBusy(true);setError('');try { await downloadBlobAsFile(await api.downloadPackage(batch.batch.id, index), `signed-package-${index + 1}.zip`); } catch (e) { setError(e.message); } finally { setBusy(false); }
                }}>הורדת {item.label || `חבילה ${index + 1}`} והראיות</button>;
            })}</div>
            {batch.batch.snapshot.definition.completionMode === 'package' && <><h2>מסירת החבילות שהושלמו</h2><p>הודעת הסיום כוללת קישור להורדת המסמכים החתומים ותעודות הראיות יחד. חבילה נמסרת לאחר שכל המסמכים בה נחתמו.</p>
                <ul className="lw-templates__list">{(batch.completion || []).map(item => <li key={`${item.package_index}:${item.recipient_email}`}><span>חבילה {item.package_index + 1} · <bdi>{item.recipient_email}</bdi></span><strong>{item.status === 'sent' ? 'הודעת הסיום נשלחה' : 'המסירה לא אושרה'}</strong></li>)}</ul>
                {canManage && <button type="button" disabled={busy} onClick={async () => { setBusy(true);setError('');try { setBatch(await api.completion(batch.batch.id)); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>בדיקת השלמה ומסירת חבילות מוכנות</button>}
            </>}
        </>}
    </section>;
}
