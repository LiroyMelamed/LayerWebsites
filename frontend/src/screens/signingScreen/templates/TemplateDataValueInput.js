import React from 'react';
import BlockDateInput from '../../../components/simpleComponents/BlockDateInput';
import useSigningLocale from './useSigningLocale';

// Keep identifiers and decimal amounts as strings all the way to publication.
export default function TemplateDataValueInput({ field, label, value, onChange }) {
    const { t, direction } = useSigningLocale();
    if (field.type === 'date') return <div role="group" aria-label={label}>
        <BlockDateInput title={label} value={value ?? ''} containerDir={direction} onChange={event => onChange(event.target.value)} />
    </div>;
    const options = field.type === 'boolean' ? [true, false] : field.options || [];
    const missing = value != null && value !== '' && !options.some(option => String(option) === String(value));
    return <label>{label}
        {['boolean', 'enum'].includes(field.type) ? <select dir={direction} value={String(value ?? '')} onChange={event => onChange(field.type === 'boolean' && event.target.value !== '' ? event.target.value === 'true' : event.target.value)}>
            <option value="">{t('signingV2.compose.data.choose')}</option>
            {missing && <option value={String(value)}>{t('signingV2.authoring.unavailableValue', { value: String(value) })}</option>}
            {options.map((option, index) => <option key={index} value={String(option)}>{field.type === 'boolean' ? t(`signingV2.compose.data.${option ? 'yes' : 'no'}`) : option}</option>)}
        </select> : <input type="text" autoComplete="off" value={value ?? ''} maxLength={field.maxLength || 2000}
            inputMode={field.type === 'decimal' ? 'decimal' : undefined} dir={['decimal', 'identifier'].includes(field.type) ? 'ltr' : direction}
            onChange={event => onChange(event.target.value)} />}
    </label>;
}
