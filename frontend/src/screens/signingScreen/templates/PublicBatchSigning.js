import React, { useEffect, useRef, useState } from 'react';
import { signingRequest } from '../../../api/signingTemplatesApi';
import PdfViewer from '../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer';
import './templates.scss';

const signatureLike = field => ['signature', 'initials'].includes(String(field.FieldType || 'signature').toLowerCase());
const typeOf = field => String(field.FieldType || 'text').toLowerCase();
export default function PublicBatchSigning({ token }) {
    const base = `signing-batches/public/${encodeURIComponent(token)}`;
    const [data, setData] = useState(null);const [current, setCurrent] = useState(null);const [pdf, setPdf] = useState(null);const [pdfReady, setPdfReady] = useState(false);
    const [details, setDetails] = useState({});const [reviewed, setReviewed] = useState({});const [values, setValues] = useState({});
    const [phase, setPhase] = useState('review');const [session, setSession] = useState(null);const sessionId = useRef(crypto.randomUUID());
    const [consent, setConsent] = useState(false);const [otp, setOtp] = useState('');const [channel, setChannel] = useState('');const checking = useRef(false);
    const [busy, setBusy] = useState(false);const [error, setError] = useState('');const [done, setDone] = useState([]);const [drawn, setDrawn] = useState(false);
    const canvas = useRef(null);const drawing = useRef(false);const signedImage = useRef(null);
    useEffect(() => { let active = true;signingRequest('get', base).then(result => { if (active) setData(result); }).catch(e => { if (active) setError(e.message); });return () => { active = false; }; }, [base]);
    const fileBase = file => `SigningFiles/public/${encodeURIComponent(file.token)}`;
    const selected = (data?.files || []).filter(file => reviewed[file.id]);
    const ready = (data?.files || []).filter(file => file.token && file.remaining > 0 && file.isMyTurn && file.status === 'pending');
    const headers = { headers: { 'x-signing-session-id': session?.sessionId || sessionId.current } };
    async function open(file) {
        setBusy(true);setError('');setCurrent(file);setPdf(null);setPdfReady(false);
        try {
            const [record, bytes] = await Promise.all([signingRequest('get', fileBase(file)), signingRequest('get', `${fileBase(file)}/pdf`, null, { responseType: 'blob' })]);
            setDetails(prev => ({ ...prev, [file.id]: record }));setPdf(bytes);
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    const myFields = record => (record?.signatureSpots || []).filter(field => Number(field.SignerUserId) === Number(record.signerUserId) && !field.IsSigned);
    function missingValue(file) {
        return myFields(details[file.id]).find(field => !signatureLike(field) && field.IsRequired && typeOf(field) !== 'checkbox' && !String(values[field.SignatureSpotId] ?? '').trim());
    }
    async function begin() {
        setBusy(true);setError('');
        try {
            if (!selected.length || !consent) throw new Error('יש לעיין במסמכים ולאשר את החתימה');
            if (selected.some(missingValue)) throw new Error('יש להשלים את שדות החובה במסמכים שנבחרו');
            const result = await signingRequest('post', `${base}/session`, { sessionId: sessionId.current, documents: selected.map(f => ({ fileId: f.id, sha256: details[f.id].file.PresentedPdfSha256 })), consentAccepted: true, consentVersion: '2026-01-11' });setSession(result);
            if (result.requireOtp) {
                const request = await signingRequest('post', `SigningFiles/public/${encodeURIComponent(result.canonicalToken)}/otp/request`, {}, { headers: { 'x-signing-session-id': result.sessionId } });
                if (!request.channel) throw new Error('קוד האימות לא נשלח. יש לנסות שוב');
                setChannel(request.channel);setPhase('otp');
            } else setPhase('sign');
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    useEffect(() => {
        if (phase !== 'otp' || otp.length !== 6 || checking.current || !session) return;
        checking.current = true;setBusy(true);setError('');
        (async () => {
            try {
                const result = await signingRequest('post', `SigningFiles/public/${encodeURIComponent(session.canonicalToken)}/otp/verify`, { otp }, { headers: { 'x-signing-session-id': session.sessionId } });
                if (result.verified !== true) throw new Error('הקוד אינו תקין או שפג תוקפו. אפשר להזין קוד שוב');
                await signingRequest('post', `${base}/confirm-otp`, { sessionId: session.sessionId });setPhase('sign');
            } catch (e) { setError(e.message);setOtp(''); } finally { checking.current = false;setBusy(false); }
        })();
    }, [otp, phase, session, base]);
    function point(event) { const box = canvas.current.getBoundingClientRect();return { x: (event.clientX - box.left) * 800 / box.width, y: (event.clientY - box.top) * 240 / box.height }; }
    function startDraw(event) {
        if (busy) return;event.preventDefault();drawing.current = true;canvas.current.setPointerCapture(event.pointerId);
        const ctx = canvas.current.getContext('2d');const p = point(event);ctx.lineWidth = 3;ctx.lineCap = 'round';ctx.lineJoin = 'round';ctx.strokeStyle = '#142a47';ctx.beginPath();ctx.moveTo(p.x, p.y);
    }
    function draw(event) { if (!drawing.current || busy) return;const p = point(event);const ctx = canvas.current.getContext('2d');ctx.lineTo(p.x, p.y);ctx.stroke();setDrawn(true);signedImage.current = null; }
    async function signSelected() {
        setBusy(true);setError('');let completed = [...done];
        try {
            const needsImage = selected.some(file => myFields(details[file.id]).some(signatureLike));
            if (needsImage && !drawn && !signedImage.current) throw new Error('יש לצייר חתימה לפני האישור');
            if (needsImage && !signedImage.current) signedImage.current = canvas.current.toDataURL('image/png');
            for (const file of selected) {
                if (completed.includes(file.id)) continue;
                // Refresh on retries: keep committed fields and signatures, submit only what remains.
                const record = await signingRequest('get', fileBase(file));
                const fields = myFields(record);
                for (const field of fields.filter(f => !signatureLike(f))) {
                    const value = typeOf(field) === 'checkbox' ? String(!!values[field.SignatureSpotId]) : String(values[field.SignatureSpotId] || '');
                    if (!field.IsRequired && !value) continue;
                    await signingRequest('post', `${fileBase(file)}/sign`, { signatureSpotId: field.SignatureSpotId, fieldValue: value, consentAccepted: true, consentVersion: record.file.SigningPolicyVersion || '2026-01-11' }, headers);
                }
                const ids = fields.filter(signatureLike).map(f => f.SignatureSpotId);
                if (ids.length) await signingRequest('post', `${fileBase(file)}/sign-batch`, { signatureSpotIds: ids, signatureImage: signedImage.current, consentAccepted: true, consentVersion: record.file.SigningPolicyVersion || '2026-01-11' }, headers);
                completed.push(file.id);setDone([...completed]);
            }
            setPhase('done');signedImage.current = null;
        } catch (e) { setError(`${e.message}. הושלמו ${completed.length} מתוך ${selected.length} מסמכים. ניסיון חוזר ימשיך רק את החסר`); }
        finally { setBusy(false); }
    }
    const record = current ? details[current.id] : null;
    async function restartReview() {
        setBusy(true);setError('');
        try {
            setData(await signingRequest('get', base));setCurrent(null);setPdf(null);setPdfReady(false);setDetails({});setReviewed({});
            setConsent(false);setSession(null);setOtp('');sessionId.current = crypto.randomUUID();signedImage.current = null;setDrawn(false);setDone([]);setPhase('review');
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    return <main className="lw-templates" dir="rtl">
        <header className="lw-templates__heading"><div><h1>{data?.name || 'מסמכים לחתימה'}</h1><p>{data ? `שלום ${data.recipientName}, ${data.files.length} מסמכים מרוכזים כאן עבורך.` : 'טוען את המסמכים…'}</p></div></header>
        {error && <div className="lw-templates__error" role="alert">{error}</div>}
        {['otp', 'sign'].includes(phase) && <button type="button" disabled={busy} onClick={restartReview}>חזרה למסמכים וחידוש האימות</button>}
        {phase === 'review' && data && <>
            <p>פתח כל מסמך, השלם את השדות ואשר שבדקת אותו. בסיום אפשר להחיל חתימה אחת על כל המסמכים שבחרת.</p>
            {!ready.length && <p className="lw-templates__success">אין כרגע מסמכים זמינים לחתימתך. מסמכים שדורשים חותם קודם יהיו זמינים בהמשך.</p>}
            <div className="lw-templates__reviewGrid">
                <ul className="lw-templates__reviewList">{data.files.map(file => <li key={file.id}><button type="button" aria-pressed={current?.id === file.id} disabled={busy || !file.token} onClick={() => open(file)}>{file.name}<small>{!file.remaining ? 'החתימה שלך הושלמה' : !file.isMyTurn ? 'ממתין לחותם קודם' : reviewed[file.id] ? 'נבדק ונבחר לחתימה' : 'פתיחה לבדיקה'}</small></button></li>)}</ul>
                <div>{current ? <>
                    <h2>{current.name}</h2><div className="lw-templates__pdf">{pdf ? <PdfViewer pdfFile={pdf} spots={record?.signatureSpots || []} onDocumentReady={success => setPdfReady(success === true)} /> : <p role="status">טוען את המסמך…</p>}</div>
                    {current.isMyTurn && current.status === 'pending' && !!current.remaining && <>
                        <div className="lw-templates__valueFields">{myFields(record).filter(field => !signatureLike(field)).map(field => <label key={field.SignatureSpotId} className={typeOf(field) === 'checkbox' ? 'lw-templates__check' : ''}>{field.FieldLabel || `שדה בעמוד ${field.PageNumber}`}{field.IsRequired ? ' (חובה)' : ''}
                            <input type={typeOf(field) === 'text' ? 'text' : typeOf(field)} value={typeOf(field) === 'checkbox' ? undefined : values[field.SignatureSpotId] || ''} checked={typeOf(field) === 'checkbox' ? !!values[field.SignatureSpotId] : undefined} maxLength={1000} onChange={e => { const value = typeOf(field) === 'checkbox' ? e.target.checked : e.target.value;setValues(prev => ({ ...prev, [field.SignatureSpotId]: value }));setReviewed(prev => ({ ...prev, [current.id]: false })); }} /></label>)}</div>
                        <label className="lw-templates__check"><input type="checkbox" checked={!!reviewed[current.id]} disabled={!pdfReady || !!missingValue(current)} onChange={e => { setReviewed(prev => ({ ...prev, [current.id]: e.target.checked }));setConsent(false);sessionId.current = crypto.randomUUID(); }} />עיינתי במסמך ובשדות, ואני בוחר לחתום עליו</label>
                    </>}
                </> : <div className="lw-templates__empty"><h2>בחר מסמך כדי להתחיל</h2><p>החתימה תחול רק על המסמכים שתבדוק ותבחר.</p></div>}</div>
            </div>
            <footer className="lw-templates__footer"><div><strong>נבחרו {selected.length} מתוך {ready.length} מסמכים זמינים</strong><label className="lw-templates__check"><input type="checkbox" checked={consent} disabled={!selected.length} onChange={e => setConsent(e.target.checked)} />אני מסכים לחתום אלקטרונית ולהחיל את החתימה שאצייר על המסמכים שבחרתי</label></div><button type="button" className="is-primary" onClick={begin} disabled={busy || !consent || !selected.length}>{busy ? 'מכין את החתימה…' : 'המשך לאימות ולחתימה'}</button></footer>
        </>}
        {phase === 'otp' && <section className="lw-templates__otp"><h2>אימות לפני החתימה</h2><p>הקוד נשלח {channel === 'email' ? 'לאימייל' : 'ב־SMS'}. האימות יתבצע אוטומטית לאחר הזנת 6 ספרות.</p><label>קוד אימות<input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" value={otp} disabled={busy} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>{busy && <p role="status">בודק את הקוד…</p>}<button type="button" disabled={busy} onClick={begin}>בקשת קוד שוב</button></section>}
        {phase === 'sign' && <section><h2>חתימה על {selected.length} מסמכים</h2><ul>{selected.map(file => <li key={file.id}>{file.name}{done.includes(file.id) ? ' — נחתם' : ''}</li>)}</ul>
            <p>החתימה תופיע בשדות שהוקצו לך בכל אחד מהמסמכים שאישרת.</p>
            <canvas ref={canvas} width="800" height="240" className="lw-templates__signCanvas" aria-label="אזור ציור החתימה" onPointerDown={startDraw} onPointerMove={draw} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
            <div className="lw-templates__actions"><button type="button" disabled={busy || !!done.length} onClick={() => { canvas.current.getContext('2d').clearRect(0, 0, 800, 240);setDrawn(false);signedImage.current = null; }}>ניקוי החתימה</button><button type="button" className="is-primary" disabled={busy} onClick={signSelected}>{busy ? `חותם… ${done.length}/${selected.length}` : done.length ? 'המשך המסמכים שנותרו' : 'אישור וחתימה על המסמכים שנבחרו'}</button></div>
        </section>}
        {phase === 'done' && <section className="lw-templates__success"><h2>החתימה שלך נשמרה</h2><p>חתמת על {done.length} מסמכים. אם נדרשות חתימות נוספות, המסמכים יושלמו לאחר קבלתן.</p><button type="button" onClick={() => window.location.reload()}>חזרה לרשימת המסמכים</button></section>}
    </main>;
}
