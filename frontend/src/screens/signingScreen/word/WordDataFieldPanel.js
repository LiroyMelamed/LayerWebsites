import React from 'react';
import SigningSelect from '../templates/SigningSelect';

// One compact field choice. The selected person/source is owned by the workspace,
// so adding another field never silently falls back to a different person.
export default function WordDataFieldPanel({ definitions, group, value, onChange, disabled, fieldLabel, text }) {
    const matches = definitions.filter(item => item.available !== false && item.phase === 'storedData' && item.key.startsWith(`${group}.`));
    const current = matches.some(item => item.key === value) ? value : '';
    return <div className="lw-word__dataPanel" aria-label={text('dataFields')}>
        <label>{text('whatReplacesText')}<SigningSelect aria-label={text('whatReplacesText')} value={current} disabled={disabled}
            onChange={event => onChange(event.target.value)}>
            <option value="" disabled>{text('chooseReplacementField')}</option>
            {matches.map(item => <option key={item.key} value={item.key}>{fieldLabel(item.key, true)}</option>)}
        </SigningSelect></label>
        {matches.length === 0 && <p>{text('noMatchingFields')}</p>}
        {definitions.find(item => item.key === value)?.resolver === 'manual' && <p>{text('manualDataFieldHelp')}</p>}
    </div>;
}
