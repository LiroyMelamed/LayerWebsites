import React,{useRef,useState,useMemo,useEffect} from 'react';
import api from '../../../api/packageRecipesApi';
import wordApi from '../../../api/wordTemplatesApi';
import signingApi from '../../../api/signingPackagesApi';
import {uploadFileToR2} from '../../../utils/fileUploadUtils';
import SimplePopUp from '../../../components/simpleComponents/SimplePopUp';
import SimpleInput from '../../../components/simpleComponents/SimpleInput';
import SimpleCheckbox from '../../../components/simpleComponents/SimpleCheckbox';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import TertiaryButton from '../../../components/styledComponents/buttons/TertiaryButton';
import FileUploadBox from '../../../components/styledComponents/fileUpload/FileUploadBox';
import StatusNotice from '../../../components/ui/StatusNotice';
import {buttonSizes} from '../../../styles/buttons/buttonSizes';
import SigningBackButton from '../templates/SigningBackButton';
import SigningSelect from '../templates/SigningSelect';
import TemplateBuilder from '../templates/TemplateBuilder';
import TemplateRoles from '../templates/TemplateRoles';
import TemplateFieldDialog from '../templates/TemplateFieldDialog';
import PackageFieldDefinitions from './PackageFieldDefinitions';
import {toEditor,fromEditor} from '../templates/nativeTemplateAdapter';
import WordTemplatesWorkspace from '../word/WordTemplatesWorkspace';
import useSigningLocale from '../templates/useSigningLocale';
import {newKey,emptyRecipe,mergeWordSource,pdfNative,pdfRecipeFields} from './recipeEditorModel';
import './packages.scss';

export default function PackageRecipeEditor({recipe,resumeDraft,onBack,onSaved}) {
    const {t,language,direction,errorMessage}=useSigningLocale();const text=key=>t(`documentPackages.${key}`);
    const [definition,setDefinition]=useState(()=>resumeDraft?.definition||recipe?.definition||emptyRecipe(language,text('firstSigner')));
    const [visibility,setVisibility]=useState(resumeDraft?.visibility||recipe?.visibility||'office');
    const [step,setStep]=useState(0),[active,setActive]=useState(0),[wordEditing,setWordEditing]=useState(false);
    const [leaving,setLeaving]=useState(false),[editingSignature,setEditingSignature]=useState(null);
    const [busy,setBusy]=useState(false),[error,setError]=useState(null),[reviewed,setReviewed]=useState(false);
    const [sourceModels,setSourceModels]=useState({}); const files=useRef({});const lock=useRef(false);const workingCopies=useRef({});const copyIds=useRef({});
    const [id]=useState(()=>recipe?.id||resumeDraft?.recipeId||crypto.randomUUID());const [version,setVersion]=useState(resumeDraft?.baseVersion??recipe?.version??0);
    const draftId=useRef(resumeDraft?.id||crypto.randomUUID()),draftVersion=useRef(resumeDraft?.version||0);
    const [draftSaved,setDraftSaved]=useState(false);
    const baseline=useRef(JSON.stringify(definition));
    const baselineVisibility=useRef(visibility);
    const wordController=useRef(null);const [wordDirty,setWordDirty]=useState(false),[wordBusy,setWordBusy]=useState(false);
    const blocked=busy||wordBusy;
    const dirty=wordDirty||baseline.current!==JSON.stringify(definition)||visibility!==baselineVisibility.current;
    useEffect(()=>{setReviewed(false);},[definition,visibility]);
    useEffect(()=>{const warn=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
    const doc=definition.documents[active];
    async function run(action){if(lock.current)return;lock.current=true;setBusy(true);setError(null);try{await action();}catch(e){setError(e);}finally{lock.current=false;setBusy(false);}}
    async function synchronizedDefinition() {
        if(wordEditing&&wordController.current?.busy)return null;
        if(!wordEditing||!wordController.current?.dirty)return definition;
        const source=await wordController.current.save();
        if(!source)return null;
        return mergeWordSource(definition,doc.key,source,sourceModels[doc.key]);
    }
    function navigate(action){return run(async()=>{if(await synchronizedDefinition()){setWordDirty(false);setWordBusy(false);action();}});}
    function updateDocument(key,patch){setDefinition(prev=>({...prev,documents:prev.documents.map(d=>d.key===key?{...d,...patch}:d)}));}
    function upload(file,replaceKey){return run(async()=>{
        if(!await synchronizedDefinition())return;
        if(!file||file.size<=0||file.size>20*1024*1024||!(/\.(pdf|docx)$/i.test(file.name))||(!replaceKey&&definition.documents.length>=10))throw new Error(text('fileInvalid'));
        const result=await uploadFileToR2(file);if(!result?.success||!result.data?.key)throw new Error(text('uploadFailed'));
        const key=replaceKey||newKey('doc'),name=file.name.replace(/\.(pdf|docx)$/i,'');
        let document;
        if(/\.docx$/i.test(file.name)){
            const {source}=await wordApi.create({fileKey:result.data.key,name});
            setSourceModels(prev=>({...prev,[key]:source}));
            document={key,name,source:{kind:'word',id:source.id,version:source.version,hash:source.sourceHash},mappings:[],signatureFields:[]};
            setDefinition(prev=>mergeWordSource({...prev,documents:replaceKey?prev.documents.map(doc=>doc.key===replaceKey?document:doc):[...prev.documents,document]},key,source));
        }else{
            const {source}=await signingApi.registerTemplateSource(result.data.key);files.current[key]=file;
            document={key,name,source:{kind:'pdf',id:source.id,version:1,hash:source.hash},mappings:[],signatureFields:[]};
            setDefinition(prev=>({...prev,documents:replaceKey?prev.documents.map(doc=>doc.key===replaceKey?document:doc):[...prev.documents,document]}));
        }
        delete workingCopies.current[key];delete copyIds.current[key];setWordEditing(false);
        if(!replaceKey)setActive(definition.documents.length);
    });}
    function sourceRequest(document) {
        const saved=recipe?.definition.documents.find(item=>item.key===document.key);
        const retained=saved&&JSON.stringify(saved.source)===JSON.stringify(document.source);
        return {source:document.source,...(retained?{recipeId:id,expectedVersion:version,documentKey:document.key}:{})};
    }
    async function editWord(){await run(async()=>{
        if(!workingCopies.current[doc.key]) {
            const copyId=copyIds.current[doc.key]||(copyIds.current[doc.key]=crypto.randomUUID());
            const {source}=await api.wordWorkingCopy({...sourceRequest(doc),copyId});
            workingCopies.current[doc.key]=true;
            setSourceModels(prev=>({...prev,[doc.key]:source}));
            setDefinition(prev=>mergeWordSource(prev,doc.key,source));
        }
        setWordEditing(true);
    });}
    function moved(offset){const next=active+offset;if(next<0||next>=definition.documents.length)return;
        setDefinition(prev=>{const documents=[...prev.documents];[documents[active],documents[next]]=[documents[next],documents[active]];return {...prev,documents};});setActive(next);}
    const native=doc?.source.kind==='pdf'?pdfNative(definition,doc):null;
    const sourceRequestRef=useRef(sourceRequest);sourceRequestRef.current=sourceRequest;
    const documentsRef=useRef(definition.documents);documentsRef.current=definition.documents;
    const pdfAdapter=useMemo(()=>({pdf:async(_id,key)=>{
        if(files.current[key])return files.current[key];
        const current=documentsRef.current.find(item=>item.key===key);
        const blob=await api.sourcePdf(sourceRequestRef.current(current));files.current[key]=blob;return blob;
    }}),[]);
    const pdfTemplate=useMemo(()=>native?{id,definition:toEditor(native)}:null,[doc?.key,doc?.source.hash,definition.signing,definition.fields]); // eslint-disable-line react-hooks/exhaustive-deps
    function saveDraft(){return run(async()=>{
        const current=await synchronizedDefinition();if(!current)return;
        const result=await api.saveDraft(draftId.current,{expectedVersion:draftVersion.current,recipeId:version?id:null,baseVersion:version,definition:current,visibility});
        draftVersion.current=result.draft.version;baseline.current=JSON.stringify(current);baselineVisibility.current=visibility;setWordDirty(false);setDraftSaved(true);
    });}
    function save(){return run(async()=>{
        const current=await synchronizedDefinition();if(!current)return;
        const review=await api.review(id,{definition:current,expectedVersion:version});
        const result=await api.save(id,{definition:review.definition,expectedVersion:version,visibility,
            ...(visibility==='office'?{sharingReviewHash:review.definitionHash}:{})});
        setVersion(result.recipe.version);baseline.current=JSON.stringify(result.recipe.definition);
        if(draftVersion.current)await api.removeDraft(draftId.current,draftVersion.current).catch(()=>{});
        onSaved(result.recipe);
    });}
    const wordEditor=wordEditing&&doc&&sourceModels[doc.key]?<WordTemplatesWorkspace key={doc.key} authoringOnly authoringControllerRef={wordController} onDraftChange={draft=>{setWordDirty(draft.dirty);setWordBusy(!!draft.busy);}}
        resumeDraft={{source:sourceModels[doc.key],mode:'manage'}} onBack={()=>{setWordEditing(false);setWordDirty(false);setWordBusy(false);}}
        signatureAnchors={doc.signatureFields.map(field=>({...field.placement.anchor,id:`signature-${field.key}`,placement:field.placement,required:field.required,signerIndex:definition.signing.roles.findIndex(role=>role.key===field.roleKey),field:'manual.signature',fieldLabel:field.label||definition.signing.roles.find(role=>role.key===field.roleKey)?.label||text('signature')}))}
        onEditSignature={key=>setEditingSignature(key.replace(/^signature-/,''))}
        onUpdateSignature={(id,placement)=>updateDocument(doc.key,{signatureFields:doc.signatureFields.map(field=>`signature-${field.key}`===id?{...field,placement}:field)})}
        onRemoveSignature={id=>updateDocument(doc.key,{signatureFields:doc.signatureFields.filter(field=>`signature-${field.key}`!==id)})}
        onSourceSaved={source=>{setSourceModels(prev=>({...prev,[doc.key]:source}));setDefinition(prev=>mergeWordSource(prev,doc.key,source,sourceModels[doc.key]));}}
        onSignatureAnchor={anchor=>{const key=newKey('sign');updateDocument(doc.key,{signatureFields:[...doc.signatureFields,{key,type:'signature',roleKey:definition.signing.roles[0].key,occurrence:0,required:true,
            placement:{kind:'word-anchor',anchor:Object.fromEntries(['part','paragraphId','paragraphHash','start','end','selectedTextHash','sourceHash'].map(key=>[key,anchor[key]])),offsetX:0,offsetY:24,width:120,height:48}}]});setEditingSignature(key);}} />:null;
    const signingDraft=toEditor({schemaVersion:2,name:definition.name,locale:language,...definition.signing,
        dataKeys:definition.fields.map(field=>({key:field.key,label:field.label,type:'text',required:field.required})),
        documents:definition.documents.map(doc=>({key:doc.key,name:doc.name,fields:doc.signatureFields.map(field=>({id:field.key,type:field.type,roleKey:field.roleKey,occurrence:field.occurrence}))}))});
    const signature=doc?.signatureFields.find(field=>field.key===editingSignature);
    function changeSignature(patch){updateDocument(doc.key,{signatureFields:doc.signatureFields.map(field=>field.key===signature.key?{...field,...patch}:field)});}
    return <section className="lw-packages lw-templates" dir={direction}>
        <SigningBackButton onPress={()=>dirty?setLeaving(true):onBack()} disabled={blocked}>{text('backLibrary')}</SigningBackButton>
        <header className="lw-packages__header"><h1>{text(recipe?'editPackage':'newPackage')}</h1>
            <SimpleInput title={text('name')} value={definition.name} maxLength={200} timeToWaitInMilli={0} onChange={e=>setDefinition(prev=>({...prev,name:e.target.value}))}/></header>
        <nav className="lw-packages__steps" aria-label={text('steps')}>{['documents','signers','review'].map((key,index)=>{const Button=step===index?PrimaryButton:SecondaryButton;return <Button key={key} size={buttonSizes.MEDIUM} aria-current={step===index?'step':undefined} disabled={blocked} onPress={()=>navigate(()=>setStep(index))}>{`${index+1} · ${text(key)}`}</Button>;})}</nav>
        {error&&<StatusNotice><p>{error.code||error.errorCode?errorMessage(error):error.message}</p></StatusNotice>}
        {draftSaved&&!dirty&&<p role="status">{text('draftSaved')}</p>}
        {busy&&<p role="status">{text('working')}</p>}
        {step===0&&<>
            <FileUploadBox className={definition.documents.length?'lw-packages__compactUpload':''} label={text('addDocument')} hint={text('formats')} accept=".pdf,.docx" disabled={blocked||definition.documents.length>=10} onFileSelected={upload}/>
            {definition.documents.length>1&&<nav className="lw-packages__documents" aria-label={text('documents')}>{definition.documents.map((item,index)=><SecondaryButton key={item.key} size={buttonSizes.MEDIUM} aria-pressed={active===index} disabled={blocked} onPress={()=>navigate(()=>setActive(index))}>{item.name}</SecondaryButton>)}</nav>}
            <PackageFieldDefinitions definition={definition} onChange={setDefinition} disabled={blocked}/>
            {doc&&<><div className="lw-packages__documentHeading"><h2>{doc.name}</h2><div className="lw-packages__actions">
                {definition.documents.length>1&&<><TertiaryButton size={buttonSizes.MEDIUM} disabled={blocked||active===0} onPress={()=>navigate(()=>moved(-1))}>{text('moveEarlier')}</TertiaryButton><TertiaryButton size={buttonSizes.MEDIUM} disabled={blocked||active===definition.documents.length-1} onPress={()=>navigate(()=>moved(1))}>{text('moveLater')}</TertiaryButton></>}
                <TertiaryButton size={buttonSizes.MEDIUM} disabled={blocked} onPress={()=>{setDefinition(prev=>({...prev,documents:prev.documents.filter(d=>d.key!==doc.key)}));setActive(0);setWordDirty(false);setWordBusy(false);setWordEditing(false);}}>{text('removeDocument')}</TertiaryButton>
            </div></div>
            {doc.source.kind==='word'?(wordEditor||<div className="lw-packages__wordSummary"><p>{text('wordHint')}</p><PrimaryButton size={buttonSizes.MEDIUM} disabled={blocked} onPress={editWord}>{text('editDocument')}</PrimaryButton>
                <ul>{doc.signatureFields.map(field=><li key={field.key}>{text('signature')} · {definition.signing.roles.find(role=>role.key===field.roleKey)?.label}<TertiaryButton size={buttonSizes.MEDIUM} onPress={()=>updateDocument(doc.key,{signatureFields:doc.signatureFields.filter(f=>f.key!==field.key)})}>{text('remove')}</TertiaryButton></li>)}</ul>
            </div>):<TemplateBuilder key={`${doc.key}-${doc.source.hash}-${JSON.stringify(definition.signing)}-${JSON.stringify(definition.fields)}`} documentOnly template={pdfTemplate} adapter={pdfAdapter} onDefinitionChange={draft=>updateDocument(doc.key,{signatureFields:pdfRecipeFields(fromEditor(draft,language))})}/>}
            <details><summary>{text('replaceSource')}</summary><p>{text('replaceSourceHint')}</p><FileUploadBox label={text('replaceSource')} hint={text('formats')} accept=".pdf,.docx" disabled={blocked} onFileSelected={file=>upload(file,doc.key)}/></details>
            {doc.mappings.length>0&&<details><summary>{text('sharedFields')}</summary>{doc.mappings.map(mapping=><label key={mapping.bindingId}>{definition.fields.find(f=>f.key===mapping.fieldKey)?.label}<SigningSelect value={mapping.fieldKey} onChange={e=>updateDocument(doc.key,{mappings:doc.mappings.map(m=>m.bindingId===mapping.bindingId?{...m,fieldKey:e.target.value}:m)})}>{definition.fields.map(field=><option key={field.key} value={field.key}>{field.label} · {text(field.source.kind==='manual'?'manual':'linked')}</option>)}</SigningSelect></label>)}</details>}
            </>}
        </>}
        {step===1&&<><h2>{text('signers')}</h2><p>{text('dataPeopleNotSigners')}</p>
            <details><summary>{text('moreOptions')}</summary><TemplateRoles draft={signingDraft} native roleId={definition.signing.roles[0]?.key} onRoleId={()=>{}} onChange={patch=>{
                const next=fromEditor({...signingDraft,...patch},language);setDefinition(prev=>({...prev,signing:{roles:next.roles,stages:next.stages,policy:next.policy,signingRules:next.signingRules}}));
            }}/></details>
            {definition.signing.roles.map(role=><SimpleInput key={role.key} title={text('roleName')} value={role.label} timeToWaitInMilli={0} onChange={e=>setDefinition(prev=>({...prev,signing:{...prev.signing,roles:prev.signing.roles.map(r=>r.key===role.key?{...r,label:e.target.value}:r)}}))}/>)}
        </>}
        {step===2&&<><h2>{definition.name}</h2><ul>{definition.documents.map(item=><li key={item.key}>{item.name} · {item.source.kind.toUpperCase()} · {item.signatureFields.length+item.mappings.length} {text('documentFields')}</li>)}</ul>
            <label>{text('sharing')}<SigningSelect value={visibility} onChange={e=>setVisibility(e.target.value)}><option value="office">{text('office')}</option><option value="private">{text('private')}</option></SigningSelect></label>
            <SimpleCheckbox checked={reviewed} onChange={e=>setReviewed(e.target.checked)} title={text(visibility==='office'?'reviewSource':'reviewPrivateSource')}/>
        </>}
        <footer className="lw-packages__footer"><SecondaryButton size={buttonSizes.MEDIUM} disabled={blocked} onPress={saveDraft}>{text('saveDraft')}</SecondaryButton><SecondaryButton size={buttonSizes.MEDIUM} disabled={blocked||step===0} onPress={()=>navigate(()=>setStep(step-1))}>{text('back')}</SecondaryButton>
            {step<2?<PrimaryButton size={buttonSizes.MEDIUM} disabled={blocked||!definition.name.trim()||definition.fields.some(field=>!field.label.trim())||!definition.documents.length} onPress={()=>navigate(()=>setStep(step+1))}>{text('continue')}</PrimaryButton>
                :<PrimaryButton size={buttonSizes.MEDIUM} disabled={blocked||!reviewed||!definition.documents.length||!definition.name.trim()||definition.fields.some(field=>!field.label.trim())} onPress={save}>{text('savePackage')}</PrimaryButton>}
        </footer>
        {signature&&<TemplateFieldDialog field={{id:signature.key,fieldType:signature.type,roleId:signature.roleKey,occurrence:signature.occurrence,isRequired:signature.required,fieldLabel:signature.label||'',inactiveTreatment:signature.inactiveTreatment}}
            roles={signingDraft.roles} busy={busy} canMoveField
            renderSlot={(role,value,onChange)=>(role?.nativeRole?.max||1)>1?<SigningSelect value={value} onChange={event=>onChange(Number(event.target.value))}>{Array.from({length:role.nativeRole.max},(_,index)=><option key={index} value={index}>{index+1}</option>)}</SigningSelect>:null}
            onUpdate={patch=>changeSignature({...(patch.roleId!==undefined?{roleKey:patch.roleId}:{}),...(patch.occurrence!==undefined?{occurrence:patch.occurrence}:{}),...(patch.isRequired!==undefined?{required:patch.isRequired}:{}),...(patch.fieldLabel!==undefined?{label:patch.fieldLabel}:{}),...('inactiveTreatment' in patch?{inactiveTreatment:patch.inactiveTreatment}:{})})}
            onMove={(x,y)=>changeSignature({placement:{...signature.placement,offsetX:signature.placement.offsetX+x,offsetY:signature.placement.offsetY+y}})}
            onResize={(width,height)=>changeSignature({placement:{...signature.placement,width:Math.max(24,Math.min(600,signature.placement.width+width)),height:Math.max(24,Math.min(200,signature.placement.height+height))}})}
            onRemove={()=>{updateDocument(doc.key,{signatureFields:doc.signatureFields.filter(field=>field.key!==signature.key)});setEditingSignature(null);}} onClose={()=>setEditingSignature(null)}/>}
        {leaving&&<SimplePopUp isOpen onClose={()=>setLeaving(false)} role="dialog" aria-modal="true" aria-label={text('unsaved')}>
            <p>{text('unsaved')}</p><div className="lw-packages__actions"><SecondaryButton size={buttonSizes.MEDIUM} onPress={()=>setLeaving(false)}>{text('stay')}</SecondaryButton><PrimaryButton size={buttonSizes.MEDIUM} onPress={onBack}>{text('discard')}</PrimaryButton></div>
        </SimplePopUp>}
    </section>;
}
