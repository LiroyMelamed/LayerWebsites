import React, {useEffect,useRef,useState} from 'react';
import SimpleInput from '../../../components/simpleComponents/SimpleInput';
import SimpleTextArea from '../../../components/simpleComponents/SimpleTextArea';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import {newKey} from './ParticipantActionDialog';
import useSigningLocale from './useSigningLocale';

export default function ParticipantContactDialog({api,packageId,personId,canSend,onClose,onSend}) {
 const {t,direction,errorMessage}=useSigningLocale(),dialog=useRef(null),pending=useRef(false),intent=useRef(null);
 const [contact,setContact]=useState(null),[email,setEmail]=useState(''),[phone,setPhone]=useState(''),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(null),[saved,setSaved]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{const previous=document.activeElement,element=dialog.current;if(element.showModal)element.showModal();else element.setAttribute('open','');return()=>{if(previous?.isConnected)previous.focus?.();};},[]);
 useEffect(()=>{let current=true;setContact(null);setError(null);intent.current=null;
  api.contact(packageId,personId).then(value=>{if(current){setContact(value);setEmail(value.endpoints.email||'');setPhone(value.endpoints.phone||'');setReason('');}}).catch(e=>{if(current)setError(e);});return()=>{current=false;};
 },[api,packageId,personId,reload]);
 const save=async send=>{
  if(pending.current||!contact?.editable||!reason.trim())return;
  pending.current=true;setBusy(true);setError(null);
  const body={revisionId:contact.revisionId,expectedVersion:contact.version,reason:reason.trim(),endpoints:{...(email.trim()?{email:email.trim()}:{}),...(phone.trim()?{phone:phone.trim()}: {})}};
  const fingerprint=JSON.stringify(body);if(intent.current?.fingerprint!==fingerprint)intent.current={fingerprint,key:newKey()};
  try{await api.correctContact(packageId,personId,body,intent.current.key);setSaved(true);if(send)onSend();}
  catch(e){setError(e);if(['FORBIDDEN','NOT_FOUND'].includes(e.code))setContact(null);}
  finally{pending.current=false;setBusy(false);}
 };
 const dismiss=event=>{event?.preventDefault();event?.stopPropagation();if(!pending.current)onClose(saved);};
 return <dialog ref={dialog} className="lw-signingPackages__actionDialog" dir={direction} aria-labelledby="signing-contact-title" onCancel={dismiss} onKeyDown={event=>{if(event.key==='Escape')dismiss(event);}}>
  <h2 id="signing-contact-title">{t('signingV2.contact.title')}</h2>
  {saved?<p role="status">{t('signingV2.contact.saved')}</p>:<>
   {!contact&&!error&&<p role="status">{t('common.loading')}</p>}
   {contact&&<div className="lw-signingPackages__contactFields">
    <strong><bdi>{contact.name}</bdi></strong><p>{t('signingV2.contact.help')}</p>
    <SimpleInput title={t('signingV2.contact.email')} aria-label={t('signingV2.contact.email')} type="email" dir="ltr" containerDir={direction} textStyle={{textAlign:'start'}} value={email} onChange={e=>setEmail(e.target.value)} timeToWaitInMilli={0} disabled={busy||!contact.editable}/>
    <SimpleInput title={t('signingV2.contact.phone')} aria-label={t('signingV2.contact.phone')} type="tel" dir="ltr" containerDir={direction} textStyle={{textAlign:'start'}} value={phone} onChange={e=>setPhone(e.target.value)} timeToWaitInMilli={0} disabled={busy||!contact.editable}/>
    <SimpleTextArea style={{direction}} textStyle={{textAlign:'start'}} title={t('signingV2.contact.reason')} aria-label={t('signingV2.contact.reason')} value={reason} onChange={setReason} maxLength={1000} disabled={busy||!contact.editable}/>
   </div>}
  </>}
  {error&&<StatusNotice embedded><p>{errorMessage(error)}</p></StatusNotice>}
  <div className="lw-signingPackages__actionButtons">
   {!saved&&contact?.editable&&<><PrimaryButton onPress={()=>save(false)} disabled={busy||!reason.trim()||error?.code==='VERSION_CHANGED'}>{t(busy?'common.loading':'signingV2.contact.save')}</PrimaryButton>
    {canSend&&<SecondaryButton onPress={()=>save(true)} disabled={busy||!reason.trim()||error?.code==='VERSION_CHANGED'}>{t('signingV2.contact.saveAndReview')}</SecondaryButton>}</>}
   {error?.code==='VERSION_CHANGED'&&<SecondaryButton onPress={()=>setReload(value=>value+1)}>{t('signingV2.refresh')}</SecondaryButton>}
   <SecondaryButton onPress={dismiss} disabled={busy}>{t('common.close')}</SecondaryButton>
  </div>
 </dialog>;
}
