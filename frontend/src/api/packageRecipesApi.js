import { signingRequest } from './signingTemplatesApi';
const root='signing-v2/recipes';
const at=id=>`${root}/${encodeURIComponent(id)}`;
const api={
    wordWorkingCopy:body=>signingRequest('post',`${root}/sources/word-working-copy`,body),
    sourcePdf:body=>signingRequest('post',`${root}/sources/pdf`,body,{responseType:'blob'}),
    drafts:()=>signingRequest('get',`${root}/drafts`),
    saveDraft:(id,body)=>signingRequest('put',`${root}/drafts/${encodeURIComponent(id)}`,body),
    removeDraft:(id,version)=>signingRequest('delete',`${root}/drafts/${encodeURIComponent(id)}?version=${version}`),
    list:()=>signingRequest('get',root),
    get:id=>signingRequest('get',at(id)),
    review:(id,payload)=>signingRequest('post',`${at(id)}/review`,payload),
    save:(id,payload)=>signingRequest('put',at(id),payload),
    inputs:(id,payload)=>signingRequest('post',`${at(id)}/inputs`,payload),
    prepare:(id,payload,key)=>signingRequest('post',`${at(id)}/preparations`,payload,{headers:{'Idempotency-Key':key}}),
    pdf:(id,key)=>signingRequest('get',`${root}/preparations/${encodeURIComponent(id)}/documents/${encodeURIComponent(key)}`,null,{responseType:'blob'}),
    nativeDraft:(id,payload,key)=>signingRequest('post',`${root}/preparations/${encodeURIComponent(id)}/native-draft`,payload,{headers:{'Idempotency-Key':key}}),
};
export default api;
