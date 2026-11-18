import React,{useEffect,useState} from 'react';
import wordApi from '../../../api/wordTemplatesApi';
import SimpleInput from '../../../components/simpleComponents/SimpleInput';
import SimpleCheckbox from '../../../components/simpleComponents/SimpleCheckbox';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import TertiaryButton from '../../../components/styledComponents/buttons/TertiaryButton';
import SigningSelect from '../templates/SigningSelect';
import useSigningLocale from '../templates/useSigningLocale';
import {buttonSizes} from '../../../styles/buttons/buttonSizes';
import {newKey} from './recipeEditorModel';
// Titles are presentation; only opaque field keys establish reuse.
export default function PackageFieldDefinitions({definition,onChange,disabled}) {
    const {t}=useSigningLocale(),text=key=>t(`documentPackages.${key}`);
    const [catalog,setCatalog]=useState(null);
    useEffect(()=>{let live=true;wordApi.list().then(result=>{if(live)setCatalog(result.catalog);}).catch(()=>{});return()=>{live=false;};},[]);
    const update=(key,patch)=>onChange({...definition,fields:definition.fields.map(field=>field.key===key?{...field,...patch}:field)});
    const used=key=>definition.documents.some(doc=>doc.mappings.some(m=>m.fieldKey===key)||doc.signatureFields.some(f=>f.dataKey===key))
        ||JSON.stringify(definition.signing.roles.map(role=>role.when)).includes(`"${key}"`);
    return <details><summary>{text('packageFields')}</summary>
        {definition.fields.map(field=><div className="lw-packages__fieldDefinition" key={field.key}>
            <SimpleInput title={text('fieldTitle')} value={field.label} timeToWaitInMilli={0} maxLength={120} disabled={disabled} onChange={event=>update(field.key,{label:event.target.value})}/>
            <label>{text('valueSource')}<SigningSelect disabled={disabled} value={field.source.kind==='role'?`role:${field.source.roleKey}`:field.source.kind}
                onChange={event=>{const [kind,roleKey]=event.target.value.split(':');update(field.key,{source:kind==='manual'?{kind}:{kind,...(roleKey?{roleKey}:{}),property:kind==='case'?'reference':kind==='office'?'name':'fullName'}});}}>
                <option value="manual">{text('manual')}</option>
                {catalog&&['client','case','office'].map(kind=><option key={kind} value={kind}>{text(kind==='office'?'officeSource':kind)}</option>)}
                {definition.dataRoles.map(role=><option key={role.key} value={`role:${role.key}`}>{role.label}</option>)}
            </SigningSelect></label>
            {field.source.kind!=='manual'&&<SigningSelect disabled={disabled||!catalog} value={field.source.property} onChange={event=>update(field.key,{source:{...field.source,property:event.target.value}})}>
                {(field.source.kind==='role'?catalog?.roleFields:catalog?.fields?.filter(item=>item.key.startsWith(`${field.source.kind}.`)))?.map(item=><option key={item.key||item.property} value={item.property||item.key.slice(field.source.kind.length+1)}>{item.label}</option>)}
            </SigningSelect>}
            <SimpleCheckbox title={text('required')} checked={field.required} disabled={disabled} onChange={event=>update(field.key,{required:event.target.checked})}/>
            <TertiaryButton size={buttonSizes.MEDIUM} disabled={disabled||used(field.key)} onPress={()=>onChange({...definition,fields:definition.fields.filter(item=>item.key!==field.key)})}>{text('remove')}</TertiaryButton>
        </div>)}
        <SecondaryButton size={buttonSizes.MEDIUM} disabled={disabled||definition.fields.length>=150} onPress={()=>onChange({...definition,fields:[...definition.fields,{key:newKey('value'),label:'',source:{kind:'manual'},required:true}]})}>{text('newDataField')}</SecondaryButton>
        {definition.dataRoles.map(role=><SimpleInput key={role.key} title={text('dataRole')} value={role.label} maxLength={120} disabled={disabled} timeToWaitInMilli={0} onChange={event=>onChange({...definition,dataRoles:definition.dataRoles.map(item=>item.key===role.key?{...item,label:event.target.value}:item)})}/>)}
        <SecondaryButton size={buttonSizes.MEDIUM} disabled={disabled||definition.dataRoles.length>=40} onPress={()=>onChange({...definition,dataRoles:[...definition.dataRoles,{key:newKey('person'),label:text('dataRole')}]})}>{text('addDataRole')}</SecondaryButton>
    </details>;
}
