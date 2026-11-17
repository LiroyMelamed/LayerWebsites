import React from 'react';
import SmallAddButton from '../buttons/SmallAddButton';
import { useTranslation } from 'react-i18next';
import SimpleInput from '../../simpleComponents/SimpleInput';
import SimpleCheckbox from '../../simpleComponents/SimpleCheckbox';
import StageActionButton from '../buttons/StageActionButton';
import TertiaryButton from '../buttons/TertiaryButton';
import { buttonSizes } from '../../../styles/buttons/buttonSizes';

export default function StageDocumentDefaults({ value, onChange, disabled }) {
    const { t } = useTranslation();
    const text = key => t(`documentRequests.${key}`);
    const items = value?.items || [];
    const update = next => onChange({ items: next, sendOnEntry: next.length > 0 && Boolean(value?.sendOnEntry) });
    const add = () => update([...items, '']);
    if (!items.length) return disabled ? null : <StageActionButton label={text('addRequest')} onPress={add}/>;
    return <div className="lw-caseTypeFullView__documents">
        <div className="lw-caseTypeFullView__documentsHeader"><strong>{text('title')}</strong>{!disabled && <SmallAddButton label={text('add')} disabled={items.length >= 40} onPress={add}/>}</div>
        {items.map((title, index) => <div className="lw-caseTypeFullView__document" key={index}>
            <SimpleInput title={text('documentTitle')} aria-label={text('documentTitle')} value={title} maxLength={120} timeToWaitInMilli={0} disabled={disabled}
                onChange={event => update(items.map((item, i) => i === index ? event.target.value : item))}/>
            {!disabled && <TertiaryButton size={buttonSizes.MEDIUM} aria-label={`${text('remove')}: ${title}`} onPress={() => update(items.filter((_, i) => i !== index))}>{text('remove')}</TertiaryButton>}
        </div>)}
        <SimpleCheckbox title={text('sendOnEntry')} checked={Boolean(value?.sendOnEntry)} disabled={disabled}
            onChange={event => onChange({ items, sendOnEntry: event.target.checked })}/>
    </div>;
}
