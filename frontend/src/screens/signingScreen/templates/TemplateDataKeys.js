import React from 'react';
import useSigningLocale from './useSigningLocale';
import TemplateDataValueInput from './TemplateDataValueInput';

export default function TemplateDataKeys({ draft, onChange }) {
    const { t, direction } = useSigningLocale();
    const text = key => t(`signingV2.authoring.${key}`);
    const update = (key, patch) => onChange({ dataKeys: draft.dataKeys.map(field => field.key === key ? { ...field, ...patch } : field) });
    const usedByCondition = key => draft.documents.some(doc => doc.nativeDocument?.when?.key === key) || draft.roles.some(role => role.nativeRole?.when?.key === key);
    return <section aria-labelledby="template-data-title">
        <h2 id="template-data-title">{text('dataTitle')}</h2><p>{text('dataHelp')}</p>
        {(draft.dataKeys || []).map(field => <fieldset key={field.key} className="lw-templates__dataKey">
            <legend>{field.label || text('newData')}</legend>
            <div className="lw-templates__setup">
                <label>{text('label')}<input dir="auto" value={field.label || ''} maxLength={120} onChange={event => update(field.key, { label: event.target.value })} /></label>
                <label>{text('type')}<select dir={direction} value={field.type} disabled={usedByCondition(field.key)} onChange={event => update(field.key, { type: event.target.value, defaultValue: undefined, options: event.target.value === 'enum' ? [] : undefined })}>
                    {['text','identifier','decimal','date','boolean','enum'].map(type => <option key={type} value={type}>{text(`types.${type}`)}</option>)}
                </select></label>
                {field.type === 'enum' && <label>{text('options')}<textarea dir="auto" value={(field.options || []).join('\n')} onChange={event => update(field.key, { options: event.target.value.split('\n') })} /></label>}
                <label className="lw-templates__check"><input type="checkbox" checked={!!field.required} onChange={event => update(field.key, { required: event.target.checked })} />{text('required')}</label>
            </div>
            <details className="lw-templates__defaults" open={field.defaultValue !== undefined ? true : undefined}>
                <summary>{text('defaultTitle')}</summary><p>{text('defaultHelp')}</p>
                <label className="lw-templates__check"><input type="checkbox" checked={field.defaultValue !== undefined}
                    onChange={event => update(field.key, { defaultValue: event.target.checked ? (field.type === 'boolean' ? false : '') : undefined })} />{text('useDefault')}</label>
                {field.defaultValue !== undefined && <TemplateDataValueInput field={field} label={text('defaultValue')} value={field.defaultValue} onChange={value => update(field.key, { defaultValue: value })} />}
            </details>
            {usedByCondition(field.key) && <p className="lw-templates__hint">{text('conditionReference')}</p>}
            <button type="button" disabled={usedByCondition(field.key) || draft.documents.some(doc => doc.fields.some(spot => spot.fieldType === 'data' && spot.dataKey === field.key))}
                onClick={() => onChange({ dataKeys: draft.dataKeys.filter(item => item.key !== field.key) })}>{text('removeData')}</button>
        </fieldset>)}
        <button type="button" disabled={(draft.dataKeys || []).length >= 150} onClick={() => onChange({ dataKeys: [...(draft.dataKeys || []),
            { key: `data_${crypto.randomUUID().replace(/-/g, '')}`, label: '', type: 'text', required: false }] })}>{text('addData')}</button>
    </section>;
}
