import React, { useState } from 'react';
import AddFieldPanel from '../../../components/specializedComponents/signFiles/fieldToolbar/AddFieldPanel';
import SearchInput from '../../../components/specializedComponents/containers/SearchInput';
import SigningSelect from '../templates/SigningSelect';

export default function WordDataFieldPanel({ definitions, roles, value, onChange, disabled, fieldLabel, text }) {
    const [group, setGroup] = useState('client'); const [query, setQuery] = useState('');
    const groups = ['client', 'case', 'office', ...roles.map(role => `role.${role.key}`)];
    const activeGroup = groups.includes(group) ? group : 'client';
    const matches = definitions.filter(item => item.available !== false && item.phase === 'storedData' &&
        item.key.startsWith(`${activeGroup}.`) && fieldLabel(item.key).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    return <div className="lw-word__dataPanel" aria-label={text('dataFields')}>
        <label>{text('dataGroup')}<SigningSelect value={activeGroup} disabled={disabled} onChange={event => { setGroup(event.target.value); setQuery(''); }}>
            {groups.map(key => <option key={key} value={key}>{key.startsWith('role.') ? roles.find(role => `role.${role.key}` === key)?.label : text(`groups.${key}`)}</option>)}
        </SigningSelect></label>
        <SearchInput title={text('findDataField')} aria-label={text('findDataField')} value={query} onSearch={setQuery} disabled={disabled} />
        {disabled ? <p>{text('working')}</p> : <AddFieldPanel fieldTypeOptions={matches.map(item => ({ id: item.key, label: fieldLabel(item.key, true) }))}
            onSelectField={onChange} isInline />}
        {matches.length === 0 && <p>{text('noMatchingFields')}</p>}
        <p className="lw-word__selectedField">{text('selectedDataField')}: <strong>{fieldLabel(value)}</strong></p>
        {definitions.find(item => item.key === value)?.resolver === 'manual' && <p>{text('manualDataFieldHelp')}</p>}
    </div>;
}
