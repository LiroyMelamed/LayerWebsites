import {emptyRecipe,mergeWordSource,referencedFieldKeys} from './recipeEditorModel';
if(!window.crypto?.randomUUID)Object.defineProperty(window,'crypto',{value:require('crypto').webcrypto});
function source(id,field='manual.a',label='גוש'){return {id,version:1,sourceHash:'a'.repeat(64),roles:[],bindings:[{id:'binding',field,fieldLabel:label,required:true}]};}
function withDoc(recipe,key){return {...recipe,documents:[...recipe.documents,{key,name:key,source:{kind:'word',hash:'a'.repeat(64)},mappings:[],signatureFields:[]}]};}
test('equal titles do not merge across documents; explicit reuse remains one value after reopening',()=>{
    let recipe=mergeWordSource(withDoc(emptyRecipe('he','Signer'),'first'),'first',source('1'));
    recipe=mergeWordSource(withDoc(recipe,'second'),'second',source('2'));
    expect(recipe.fields).toHaveLength(2);expect(recipe.documents[0].mappings[0].fieldKey).not.toBe(recipe.documents[1].mappings[0].fieldKey);
    recipe.documents[1].mappings[0].fieldKey=recipe.documents[0].mappings[0].fieldKey;
    recipe=mergeWordSource(recipe,'second',source('2'));
    expect(referencedFieldKeys(recipe).size).toBe(1);expect(recipe.documents[0].mappings[0].fieldKey).toBe(recipe.documents[1].mappings[0].fieldKey);
});
test('source text revisions require new signature anchors while mapping edits preserve them',()=>{
    let recipe=mergeWordSource(withDoc(emptyRecipe('he','Signer'),'first'),'first',source('1'));
    recipe.documents[0].signatureFields=[{key:'sign',type:'signature'}];
    recipe=mergeWordSource(recipe,'first',{...source('1'),version:2});expect(recipe.documents[0].signatureFields).toHaveLength(1);
    recipe=mergeWordSource(recipe,'first',{...source('2'),sourceHash:'b'.repeat(64)});expect(recipe.documents[0].signatureFields).toEqual([]);
});
test('different data roles stay distinct even with long identical prefixes and remain stable on save',()=>{
    const roles=[{key:'a'.repeat(63)+'b',label:'שוכר'},{key:'a'.repeat(63)+'c',label:'משכיר'}];
    const doc={...source('1'),roles,bindings:roles.map((role,index)=>({id:`binding${index}`,field:`role.${role.key}.fullName`,fieldLabel:role.label,required:true}))};
    let recipe=mergeWordSource(withDoc(emptyRecipe('he','Signer'),'document'),'document',doc);
    expect(new Set(recipe.fields.map(f=>f.source.roleKey)).size).toBe(2);
    const keys=recipe.fields.map(f=>f.source.roleKey);recipe=mergeWordSource(recipe,'document',doc);
    expect(recipe.fields.map(f=>f.source.roleKey)).toEqual(keys);expect(recipe.signing.roles).toHaveLength(1);
});
