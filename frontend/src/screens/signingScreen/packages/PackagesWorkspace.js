import React,{useState,useEffect} from 'react';
import api from '../../../api/packageRecipesApi';
import PackageRecipeEditor from './PackageRecipeEditor';
import PackageRecipeUse from './PackageRecipeUse';
import useSigningLocale from '../templates/useSigningLocale';
import SigningBackButton from '../templates/SigningBackButton';
import SimpleInput from '../../../components/simpleComponents/SimpleInput';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import {buttonSizes} from '../../../styles/buttons/buttonSizes';
import './packages.scss';
export default function PackagesWorkspace({initialRecipes,canUpload,onClose,onCreated,legacy}) {
    const {t,direction,errorMessage}=useSigningLocale(),text=key=>t(`documentPackages.${key}`);
    const [recipes,setRecipes]=useState(initialRecipes),[query,setQuery]=useState(''),[mode,setMode]=useState('library');
    const [drafts,setDrafts]=useState([]),[resumeDraft,setResumeDraft]=useState(null);
    useEffect(()=>{if(mode!=='library')return undefined;let live=true;api.drafts().then(result=>{if(live)setDrafts(result.drafts);}).catch(error=>{if(live)setError(error);});return()=>{live=false;};},[mode]);
    const [selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null);
    async function open(recipe,next){if(busy)return;setBusy(true);setError(null);try{const result=await api.get(recipe.id);setSelected(result.recipe);setMode(next);}catch(e){setError(e);}finally{setBusy(false);}}
    const back=()=>{setMode('library');setSelected(null);setResumeDraft(null);};
    if(mode==='edit')return <PackageRecipeEditor recipe={selected} resumeDraft={resumeDraft} onBack={back} onSaved={recipe=>{setRecipes(previous=>[recipe,...previous.filter(item=>item.id!==recipe.id)]);back();}}/>;
    if(mode==='use')return <PackageRecipeUse recipe={selected} onBack={back} onCreated={onCreated}/>;
    return <section className="lw-packages" dir={direction}>
        <SigningBackButton onPress={onClose}>{t('signingV2.backToDocuments')}</SigningBackButton>
        <header className="lw-packages__header"><h1>{text('library')}</h1>{canUpload&&<PrimaryButton size={buttonSizes.MEDIUM} onPress={()=>{setSelected(null);setResumeDraft(null);setMode('edit');}}>{text('newPackage')}</PrimaryButton>}</header>
        <SimpleInput title={text('search')} value={query} timeToWaitInMilli={0} onChange={e=>setQuery(e.target.value)}/>
        {error&&<StatusNotice><p>{errorMessage(error)}</p></StatusNotice>}
        {canUpload&&!!drafts.length&&<details><summary>{text('drafts')}</summary><ul className="lw-packages__library">{drafts.map(draft=><li key={draft.id}><strong>{draft.definition.name||text('unnamedDraft')}</strong><SecondaryButton size={buttonSizes.MEDIUM} disabled={busy} onPress={async()=>{
            if(busy)return;setBusy(true);setError(null);try{const recipe=draft.recipeId?(await api.get(draft.recipeId)).recipe:null;setSelected(recipe);setResumeDraft(draft);setMode('edit');}catch(error){setError(error);}finally{setBusy(false);}
        }}>{text('resume')}</SecondaryButton></li>)}</ul></details>}
        <ul className="lw-packages__library">{recipes.filter(recipe=>recipe.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(recipe=><li key={recipe.id}>
            <div><strong>{recipe.name}</strong><p>{recipe.definition.documents.map(doc=>doc.source.kind.toUpperCase()).join(' · ')} · {text(recipe.visibility)}</p></div>
            <div className="lw-packages__actions">{canUpload&&<PrimaryButton size={buttonSizes.MEDIUM} disabled={busy} onPress={()=>open(recipe,'use')}>{text('usePackage')}</PrimaryButton>}
                {recipe.canEdit&&<SecondaryButton size={buttonSizes.MEDIUM} disabled={busy} onPress={()=>open(recipe,'edit')}>{text('edit')}</SecondaryButton>}</div>
        </li>)}</ul>
        {!recipes.length&&<p>{text('empty')}</p>}
        <details><summary>{text('existingPackages')}</summary>{legacy}</details>
    </section>;
}
