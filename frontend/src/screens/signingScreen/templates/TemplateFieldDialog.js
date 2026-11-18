import React from 'react';
import SimplePopUp from '../../../components/simpleComponents/SimplePopUp';
import SimpleInput from '../../../components/simpleComponents/SimpleInput';
import SimpleCheckbox from '../../../components/simpleComponents/SimpleCheckbox';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import TertiaryButton from '../../../components/styledComponents/buttons/TertiaryButton';
import SigningSelect from './SigningSelect';
import useSigningLocale from './useSigningLocale';
const FIELD_MOVE_STEP=8;
export default function TemplateFieldDialog({field,roles,dataKeys=[],native=true,busy=false,canMoveField=false,renderSlot,onUpdate,onResize,onRemove,onClose,onMove}) {
    const {t:translate,direction}=useSigningLocale();const t=(key,values)=>translate(`signingV2.builder.${key}`,values);
    return <SimplePopUp isOpen onClose={onClose} role="dialog" aria-modal="true" aria-label={t('selectedField')} dir={direction}>
            <div className="lw-templates lw-templates__fieldDialog">
                <fieldset disabled={busy}><legend>{t('selectedField')}</legend>
                    {field.fieldType === 'data' ? <>
                        <label>{translate('signingV2.authoring.dataField')}<SigningSelect dir={direction} value={field.dataKey || ''} onChange={e => onUpdate({ dataKey: e.target.value })}>{dataKeys.map(key => <option value={key.key} key={key.key}>{key.label || key.key}</option>)}</SigningSelect></label>
                        <label>{translate('signingV2.authoring.fontSize')}<SimpleInput timeToWaitInMilli={0} type="number" min="8" max="72" value={field.fontSize || 14} onChange={e => onUpdate({ fontSize: Number(e.target.value) })} /></label>
                        <p>{translate('signingV2.authoring.overflow')}</p>
                    </> : field.fieldType === 'completionMark' ? <p>{translate('signingV2.completionMark.help')}</p> : <label>{t('signer')}<SigningSelect dir={direction} value={field.roleId} onChange={e => onUpdate({ roleId: e.target.value, occurrence: 0 })}>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</SigningSelect></label>}
                    {!['data', 'completionMark'].includes(field.fieldType) && renderSlot?.(roles.find(role => role.id === field.roleId), field.occurrence ?? field.nativeField?.occurrence ?? 0, next => onUpdate({ occurrence: next }))}
                    {native && !['data', 'completionMark'].includes(field.fieldType) && (() => {
                        const role = roles.find(item => item.id === field.roleId)?.nativeRole;
                        return (role?.when || role?.min <= (field.occurrence ?? field.nativeField?.occurrence ?? 0)) && <label>{translate('signingV2.authoring.condition.inactive')}
                            <SigningSelect dir={direction} value={field.inactiveTreatment || ''} onChange={event => onUpdate({ inactiveTreatment: event.target.value || undefined })}>
                                <option value="">{translate('signingV2.authoring.condition.chooseTreatment')}</option>
                                {['exclude_document', 'authored_inactive'].map(value => <option key={value} value={value}>{translate(`signingV2.authoring.condition.${value}`)}</option>)}
                            </SigningSelect></label>;
                    })()}
                    <label>{t('label')}<SimpleInput timeToWaitInMilli={0} value={field.fieldLabel || ''} maxLength={120} onChange={e => onUpdate({ fieldLabel: e.target.value })} /></label>
                    {!['data', 'completionMark'].includes(field.fieldType) && <SimpleCheckbox checked={field.isRequired} onChange={e => onUpdate({ isRequired: e.target.checked })} title={t('required')}/>}
                    {onMove&&<p tabIndex={0} role="group" aria-label={translate('documentPackages.moveSignatureKeyboard')} onKeyDown={event=>{
                        if(busy||!canMoveField||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
                        event.preventDefault();const step=event.shiftKey?8:1;
                        onMove(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0);
                    }}>{translate('documentPackages.moveSignatureKeyboard')}</p>}
                    {native && <details className="lw-templates__fieldSize"><summary>{t('fieldSize')}</summary>
                        <p>{t('fieldSizeHelp')}</p>
                        <div role="group" aria-label={t('fieldSize')} className="lw-templates__fieldSizeButtons">
                            {[['fieldNarrower', -FIELD_MOVE_STEP, 0], ['fieldWider', FIELD_MOVE_STEP, 0], ['fieldShorter', 0, -FIELD_MOVE_STEP], ['fieldTaller', 0, FIELD_MOVE_STEP]].map(([label, dw, dh]) => <SecondaryButton key={label}
                                disabled={busy || !canMoveField} onPress={() => onResize(dw, dh)}>{t(label)}</SecondaryButton>)}
                        </div>
                    </details>}
                    <TertiaryButton onPress={onRemove}>{t('deleteField')}</TertiaryButton>
                </fieldset>
                <SecondaryButton onPress={onClose}>{translate('common.close')}</SecondaryButton>
            </div>
        </SimplePopUp>;
}
