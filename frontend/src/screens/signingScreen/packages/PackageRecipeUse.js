import React,{useEffect,useRef,useState} from 'react';
import api from '../../../api/packageRecipesApi';
import signingApi from '../../../api/signingPackagesApi';
import WordRecordPicker from '../word/WordRecordPicker';
import PackageComposer from '../templates/PackageComposer';
import SigningBackButton from '../templates/SigningBackButton';
import useSigningLocale from '../templates/useSigningLocale';
import SimpleInput from '../../../components/simpleComponents/SimpleInput';
import SimpleCheckbox from '../../../components/simpleComponents/SimpleCheckbox';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import PdfViewer from '../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer';
import {buttonSizes} from '../../../styles/buttons/buttonSizes';
import './packages.scss';
import {referencedFieldKeys} from './recipeEditorModel';
import PackageUseSteps from './PackageUseSteps';

export default function PackageRecipeUse({recipe,onBack,onCreated}) {
    const {t,direction,errorMessage}=useSigningLocale(),text=key=>t(`documentPackages.${key}`);
    const [people,setPeople]=useState({}),[values,setValues]=useState({}),[fields,setFields]=useState([]);
    const [busy,setBusy]=useState(false),[resolving,setResolving]=useState(true),[resolveFailed,setResolveFailed]=useState(false),[error,setError]=useState(null);
    const [prepared,setPrepared]=useState(null),[published,setPublished]=useState(null),[active,setActive]=useState(0);
    const [pdf,setPdf]=useState(null),[ready,setReady]=useState(false),[reviewed,setReviewed]=useState({});
    const resolveGeneration=useRef(0),lock=useRef(false),preparationKey=useRef(null),draftKey=useRef(null),version=useRef(null);
    const definition=recipe.definition;
    const referenced=referencedFieldKeys(definition),activeFields=definition.fields.filter(field=>referenced.has(field.key));
    const inputs=()=>({clientId:people.client?.id||null,caseId:people.case?.id||null,
        roleClientIds:Object.fromEntries(definition.dataRoles.filter(role=>people[role.key]).map(role=>[role.key,people[role.key].id])),values});
    // Resolve on person changes only. User input is kept locally and validated
    // again by the server before immutable PDFs are generated.
    useEffect(()=>{
        const generation=++resolveGeneration.current;setResolving(true);setResolveFailed(false);setError(null);
        api.inputs(recipe.id,{expectedVersion:recipe.version,inputs:inputs()}).then(result=>{
            if(generation===resolveGeneration.current)setFields(result.fields);
        }).catch(e=>{if(generation===resolveGeneration.current){setError(e);setResolveFailed(true);setFields([]);}})
            .finally(()=>{if(generation===resolveGeneration.current)setResolving(false);});
        return()=>{resolveGeneration.current+=1;};
    },[people,recipe.id,recipe.version]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(()=>{
        setPdf(null);setReady(false);if(!prepared)return undefined;
        let live=true;
        api.pdf(prepared.id,prepared.definition.documents[active].key).then(blob=>{if(live)setPdf(blob);})
            .catch(e=>{if(live)setError(e);});
        return()=>{live=false;};
    },[prepared,active]);
    function changePerson(key,value){
        setValues(previous=>Object.fromEntries(Object.entries(previous).filter(([fieldKey])=>{
            const field=definition.fields.find(item=>item.key===fieldKey);
            return !(field?.source.kind==='role'?field.source.roleKey===key:field?.source.kind===key);
        })));
        setPeople(previous=>({...previous,[key]:value}));invalidate();
    }
    function invalidate(){setPrepared(null);setReviewed({});setPublished(null);preparationKey.current=null;draftKey.current=null;version.current=null;}
    function changeValue(field,value){setValues(previous=>({...previous,[field.key]:{value,...(field.linked?{recordId:field.recordId}:{})}}));invalidate();}
    async function run(action){if(lock.current)return;lock.current=true;setBusy(true);setError(null);try{await action();}catch(e){setError(e);}finally{lock.current=false;setBusy(false);}}
    function prepare(){return run(async()=>{
        const key=preparationKey.current||(preparationKey.current=crypto.randomUUID());
        const result=await api.prepare(recipe.id,{expectedVersion:recipe.version,definitionHash:recipe.definitionHash,inputs:inputs()},key);
        setPrepared(result.preparation);setReviewed({});setActive(0);
    });}
    function continueSigning(){return run(async()=>{
        if(!prepared||!prepared.definition.documents.every(doc=>reviewed[doc.key]))return;
        if(!version.current){
            const result=await api.nativeDraft(prepared.id,{expectedHash:prepared.definitionHash},draftKey.current||(draftKey.current=crypto.randomUUID()));
            version.current=result.version;
        }
        const saved=version.current;
        const result=await signingApi.publishTemplateDraft(saved.id,{expectedVersion:saved.editVersion,definitionHash:saved.definitionHash});
        setPublished(result.version);
    });}
    if(published)return <PackageComposer initialTemplateId={published.id} initialTemplateVersion={published.version}
        initialClientId={prepared.accessRefs.clientId} initialCaseId={prepared.accessRefs.caseId} preparedData={prepared.data}
        lockedDocumentContext onBack={()=>setPublished(null)} onCreated={onCreated}/>;
    const missing=fields.some(field=>field.required&&!(values[field.key]?.value??field.value).trim());
    const shown=fields.filter(field=>!field.linked||field.missing||field.overridden);
    const filled=fields.filter(field=>field.linked&&!field.missing&&!field.overridden);
    const reviewRoles=prepared?.definition.roles||[];
    const reviewSpots=(prepared?.definition.documents[active]?.fields||[]).map(field=>({...field,
        fieldType:field.type,isRequired:field.required,fieldLabel:field.label||'',
        signerIndex:reviewRoles.findIndex(role=>role.key===field.roleKey),signerName:reviewRoles.find(role=>role.key===field.roleKey)?.label}));
    function input(field){return <div key={field.key}><SimpleInput title={field.label} aria-label={field.label} value={values[field.key]?.value??field.value}
        required={field.required} maxLength={field.maxLength||10000} timeToWaitInMilli={0} disabled={busy||resolving} onChange={event=>changeValue(field,event.target.value)}/>
        {field.linked&&field.missing&&<small>{text('missingValue')} · {field.source.kind==='role'?definition.dataRoles.find(role=>role.key===field.source.roleKey)?.label:text(field.source.kind==='office'?'officeSource':field.source.kind)}</small>}</div>;}
    return <section className="lw-packages" dir={direction}>
        <SigningBackButton onPress={prepared?()=>{setPrepared(null);setReviewed({});}:onBack} disabled={busy}>{text(prepared?'backToDetails':'backLibrary')}</SigningBackButton>
        <header className="lw-packages__header"><h1>{recipe.name}</h1><p>{text(prepared?'reviewDocuments':'peopleAndDetails')}</p></header>
        <PackageUseSteps current={prepared?1:0}/>
        {error&&<StatusNotice><p>{errorMessage(error)}</p></StatusNotice>}
        {!prepared?<>
            <div className="lw-packages__fields">
                {activeFields.some(field=>field.source.kind==='client')&&<WordRecordPicker kind="client" label={text('client')} value={people.client} disabled={busy} onChange={value=>changePerson('client',value)}/>}
                {activeFields.some(field=>field.source.kind==='case')&&<WordRecordPicker kind="case" label={text('case')} value={people.case} disabled={busy} onChange={value=>changePerson('case',value)}/>}
                {definition.dataRoles.filter(role=>activeFields.some(field=>field.source.roleKey===role.key)).map(role=><WordRecordPicker key={role.key} label={role.label} value={people[role.key]} disabled={busy} onChange={value=>changePerson(role.key,value)}/>)}
            </div>
            {resolving?<p role="status">{text('working')}</p>:<>
                <div className="lw-packages__fields">{shown.map(input)}</div>
                {!!filled.length&&<details><summary>{text('filledValues')}</summary><div className="lw-packages__fields">{filled.map(input)}</div></details>}
            </>}
            <footer className="lw-packages__footer"><PrimaryButton size={buttonSizes.MEDIUM} disabled={busy||resolving||resolveFailed||missing} onPress={prepare}>{text(busy?'working':'prepareDocuments')}</PrimaryButton></footer>
        </>:<>
            {prepared.definition.documents.length>1&&<nav className="lw-packages__documents">{prepared.definition.documents.map((doc,index)=><SecondaryButton size={buttonSizes.MEDIUM} key={doc.key} aria-pressed={active===index} onPress={()=>setActive(index)}>{doc.name}{reviewed[doc.key]?' ✓':''}</SecondaryButton>)}</nav>}
            {pdf?<PdfViewer key={`${prepared.id}-${active}`} pdfFile={pdf} spots={reviewSpots} signers={reviewRoles.map((role,index)=>({UserId:index+1,Name:role.label}))} onDocumentReady={setReady}/>:<p role="status">{text('working')}</p>}
            <SimpleCheckbox title={text('reviewedDocument')} checked={!!reviewed[prepared.definition.documents[active].key]} disabled={!ready||busy}
                onChange={e=>setReviewed(previous=>({...previous,[prepared.definition.documents[active].key]:e.target.checked}))}/>
            <footer className="lw-packages__footer"><PrimaryButton size={buttonSizes.MEDIUM} disabled={busy||!prepared.definition.documents.every(doc=>reviewed[doc.key])} onPress={continueSigning}>{text(busy?'working':'chooseSigners')}</PrimaryButton></footer>
        </>}
    </section>;
}
