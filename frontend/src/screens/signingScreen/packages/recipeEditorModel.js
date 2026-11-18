export const newKey = prefix => `${prefix}_${crypto.randomUUID().replace(/-/g,'')}`;
export const emptyRecipe = (locale,label) => ({schemaVersion:3,name:'',locale,dataRoles:[],fields:[],documents:[],
    signing:{roles:[{key:'first',label,capacity:'personal',audience:'each',stage:0,min:1,max:1}],
        stages:[{key:'first',label,after:null}],policy:{otpRequired:true,deliveryMode:'invite'}}});
const fieldSource = value => {
    const [kind,group,...rest]=value.split('.');
    return kind==='manual'?{kind:'manual'}:kind==='role'?{kind,roleKey:group,property:rest.join('.')}:{kind,property:[group,...rest].join('.')};
};
// Preserve identity by local source key, not by a translated display title.
export function mergeWordSource(recipe,documentKey,source,previousSource) {
    const document=recipe.documents.find(doc=>doc.key===documentKey);
    const fields=[...recipe.fields];
    const bindings=new Map((document?.mappings||[]).map(mapping=>[mapping.bindingId,mapping.fieldKey]));
    const local=new Map();
    const roleKeys=new Map(source.roles.map(role=>{
        const existing=document?.mappings.map(mapping=>recipe.fields.find(field=>field.key===mapping.fieldKey)).find(field=>field?.source.kind==='role'
            && source.bindings.some(binding=>binding.field.startsWith(`role.${role.key}.`) && bindings.get(binding.id)===field.key));
        return [role.key,existing?.source.roleKey||newKey('person')];
    }));
    const mappings=source.bindings.map(binding=>{
        let key=local.get(binding.field)||bindings.get(binding.id);
        const valueSource=fieldSource(binding.field);
        if(valueSource.kind==='role') valueSource.roleKey=roleKeys.get(valueSource.roleKey);
        const existing=fields.find(field=>field.key===key);
        const oldBinding=previousSource?.bindings.find(item=>item.id===binding.id);
        const changed=oldBinding&&(oldBinding.field!==binding.field||oldBinding.fieldLabel!==binding.fieldLabel||oldBinding.required!==binding.required);
        const sourceChanged=changed&&existing&&JSON.stringify(existing.source)!==JSON.stringify(valueSource);
        const shared=key&&recipe.documents.some(doc=>doc.key!==documentKey&&(doc.mappings.some(m=>m.fieldKey===key)||doc.signatureFields.some(f=>f.dataKey===key)));
        if(!existing||(sourceChanged&&shared)) {key=newKey('value');fields.push({key,label:binding.fieldLabel||binding.field,source:valueSource,required:binding.required!==false});}
        else if(changed&&!shared) {const index=fields.findIndex(field=>field.key===key);fields[index]={...existing,label:binding.fieldLabel||existing.label,source:valueSource,required:binding.required!==false};}
        local.set(binding.field,key);return {bindingId:binding.id,fieldKey:key};
    });
    const dataRoles=[...recipe.dataRoles];
    for(const role of source.roles) if(!dataRoles.some(item=>item.key===roleKeys.get(role.key))) dataRoles.push({key:roleKeys.get(role.key),label:role.label});
    const documents=recipe.documents.map(doc=>doc.key!==documentKey?doc:{...doc,source:{kind:'word',id:source.id,version:source.version,hash:source.sourceHash},mappings,
        // A changed text source invalidates all old signature positions. Mapping
        // revisions alone preserve anchors to unchanged source text.
        signatureFields:doc.source.hash===source.sourceHash?doc.signatureFields:[]});
    const used=new Set(documents.flatMap(doc=>[...doc.mappings.map(m=>m.fieldKey),...doc.signatureFields.filter(f=>f.type==='data').map(f=>f.dataKey)]));
    return {...recipe,fields:fields.filter(field=>used.has(field.key)||recipe.fields.some(old=>old.key===field.key)),dataRoles,documents};
}
export function pdfNative(recipe,doc) {
    return {schemaVersion:2,name:recipe.name||doc.name,locale:recipe.locale,...recipe.signing,
        dataKeys:recipe.fields.map(field=>({key:field.key,label:field.label,type:'text',required:field.required})),
        documents:[{key:doc.key,name:doc.name,sourceArtifactId:doc.source.id,sourceHash:doc.source.hash,
            fields:doc.signatureFields.map(field=>({id:field.key,type:field.type,label:field.label||'',roleKey:field.roleKey,occurrence:field.occurrence||0,required:field.required,
                pageNum:field.placement.page,x:field.placement.x,y:field.placement.y,width:field.placement.width,height:field.placement.height,
                ...(field.type==='data'?{dataKey:field.dataKey,fontSize:field.fontSize||12,align:field.align||'start',overflow:'block'}:(field.inactiveTreatment?{inactiveTreatment:field.inactiveTreatment}:{}))}))}]};
}
export function pdfRecipeFields(native) {
    return native.documents[0].fields.map(field=>({key:field.id,type:field.type,label:field.label||'',required:field.required,
        ...(field.type==='data'?{dataKey:field.dataKey,fontSize:field.fontSize,align:field.align}:{roleKey:field.roleKey,occurrence:field.occurrence}),
        ...(field.inactiveTreatment?{inactiveTreatment:field.inactiveTreatment}:{}),
        placement:{kind:'pdf',page:field.pageNum,x:field.x,y:field.y,width:field.width,height:field.height}}));
}

export function referencedFieldKeys(definition) {
    if(!definition.documents)return new Set(definition.fields.map(field=>field.key));
    const keys=new Set(definition.documents.flatMap(doc=>[...doc.mappings.map(mapping=>mapping.fieldKey),...doc.signatureFields.filter(field=>field.type==='data').map(field=>field.dataKey)]));
    const visit=condition=>{if(!condition)return;if(condition.key)keys.add(condition.key);(condition.conditions||[]).forEach(visit);};
    (definition.signing?.roles||[]).forEach(role=>visit(role.when));return keys;
}
