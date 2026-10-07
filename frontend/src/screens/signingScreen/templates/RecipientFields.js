import React, { useEffect, useState } from 'react';
import api from '../../../api/signingTemplatesApi';

export default function RecipientFields({ role, value = {}, onChange, disabled }) {
    const [search, setSearch] = useState('');const [matches, setMatches] = useState([]);const [error, setError] = useState('');
    useEffect(() => {
        if (!search.trim()) { setMatches([]);return undefined; }
        let active = true;const timer = setTimeout(() => {
            api.contacts(search, role.kind === 'lawyer').then(data => { if (active) { setMatches(data.contacts);setError(''); } }).catch(() => { if (active) setError('החיפוש לא הצליח. נסה שוב'); });
        }, 300);
        return () => { active = false;clearTimeout(timer); };
    }, [search, role.kind]);
    const change = patch => onChange({ ...value, ...patch });
    return <fieldset className="lw-templates__recipient" disabled={disabled}>
        <legend>{role.name}</legend>
        {value.userId ? <div className="lw-templates__chosen"><strong>{value.name || `משתמש ${value.userId}`}</strong><span dir="ltr">{value.email || value.phone}</span><button type="button" onClick={() => { onChange({ deliveryMethod: 'email' });setSearch(''); }}>החלפת נמען</button></div> : <>
            <label>{role.kind === 'lawyer' ? 'בחירת עורך דין מהמשרד' : 'חיפוש משתמש קיים (אפשר גם להזין נמען חדש)'}<input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם או אימייל" autoComplete="off" /></label>
            {error && <p role="alert">{error}</p>}
            {!!matches.length && <ul className="lw-templates__matches">{matches.map(person => <li key={person.userId}><button type="button" onClick={() => { onChange({ ...person, deliveryMethod: person.email ? 'email' : 'phone' });setMatches([]);setSearch(''); }}>{person.name} <small dir="ltr">{person.email || person.phone}</small></button></li>)}</ul>}
            {role.kind !== 'lawyer' && <div className="lw-templates__contactGrid">
                <label>שם מלא<input value={value.name || ''} maxLength={120} onChange={e => change({ name: e.target.value })} /></label>
                <label>אימייל<input type="email" dir="ltr" value={value.email || ''} onChange={e => change({ email: e.target.value })} /></label>
                <label>טלפון<input type="tel" dir="ltr" value={value.phone || ''} onChange={e => change({ phone: e.target.value })} /></label>
            </div>}
        </>}
        <label>ערוץ הזמנה<select value={value.deliveryMethod || 'email'} onChange={e => change({ deliveryMethod: e.target.value })}><option value="email">אימייל</option><option value="phone">SMS</option><option value="both">אימייל ו־SMS</option></select></label>
    </fieldset>;
}
