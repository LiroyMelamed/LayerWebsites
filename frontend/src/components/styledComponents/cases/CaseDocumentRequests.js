import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../api/documentRequestsApi';
import SimpleInput from '../../simpleComponents/SimpleInput';
import SimpleCheckbox from '../../simpleComponents/SimpleCheckbox';
import StatusNotice from '../../ui/StatusNotice';
import PrimaryButton from '../buttons/PrimaryButton';
import SecondaryButton from '../buttons/SecondaryButton';
import TertiaryButton from '../buttons/TertiaryButton';
import SigningSelect from '../../../screens/signingScreen/templates/SigningSelect';
import { buttonSizes } from '../../../styles/buttons/buttonSizes';
import { useFirmPermissions } from '../../../providers/FirmPermissionsProvider';
import { usePopup } from '../../../providers/PopUpProvider';
import ConfirmationDialog from '../popups/ConfirmationDialog';
import './CaseDocumentRequests.scss';

export default function CaseDocumentRequests({ caseId, descriptionId, active, isClient, stageFiles = [] }) {
    const {t}=useTranslation(); const text=(key,values)=>t(`documentRequests.${key}`,values);
    const permissions=useFirmPermissions(); const {openPopup,closePopup}=usePopup();
    const canEdit=!isClient && Boolean(permissions?.canAction('cases','edit'));
    const [data,setData]=useState(null);const [items,setItems]=useState([]);const [selected,setSelected]=useState([]);
    const [policy,setPolicy]=useState(null);const [dirty,setDirty]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
    const [loading,setLoading]=useState(true);const [editing,setEditing]=useState(false);const [historyOpen,setHistoryOpen]=useState(false);
    const load=useCallback(async()=>{
        const result=await api.list(caseId); const row=result.requests.find(item=>Number(item.description_id)===Number(descriptionId)) || null;
        return {row,policy:result.policy};
    },[caseId,descriptionId]);
    const apply=useCallback(result=>{setData(result.row);setItems(result.row?.items || []);setPolicy(result.policy);setSelected(result.row?.channels || result.policy?.defaults || []);setDirty(false);},[]);
    useEffect(()=>{let cancelled=false;setLoading(true);load().then(result=>{if(!cancelled)apply(result);}).catch(()=>{if(!cancelled)setError('loadFailed');}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[load,apply]);
    async function run(action) {if(busy)return;setBusy(true);setError('');try {await action();apply(await load());return true;}catch(err){setError(err?.response?.data?.errorCode==='DOCUMENT_REQUEST_CHANGED'?'changed':'saveFailed');}finally{setBusy(false);}}
    const patch=(index,value)=>{setItems(previous=>previous.map((item,i)=>i===index?{...item,...value}:item));setDirty(true);};
    const save=async()=>{if(await run(()=>api.save(caseId,{descriptionId,version:data?.version,items})))setEditing(false);};
    const toggleReceived=(index,checked)=>run(()=>api.save(caseId,{descriptionId,version:data?.version,items:items.map((item,i)=>i===index?{...item,status:checked?'received':'missing'}:item)}));
    function send(){
        const unknown=data.deliveries?.some(job=>job.status==='UNKNOWN');
        openPopup(<ConfirmationDialog title={text('send')} message={text(unknown?'unknownConfirm':'sendConfirm')}
            confirmText={text('send')} cancelText={t('common.cancel')} onCancel={closePopup}
            onConfirm={()=>{closePopup();run(()=>api.action(caseId,data.id,{version:data.version,action:'send',channels:selected,confirmUnknown:!!unknown}));}}/>);
    }
    if(loading)return <p role="status">{text('loading')}</p>;
    if(!data && !canEdit && !error)return null;
    const missing=items.filter(item=>item.status==='missing').length;
    return <section className="lw-documentRequests" aria-label={text('title')}>
        <header><strong>{text('title')}</strong><span>{text('progress',{received:items.length-missing,total:items.length})}</span></header>
        {error && <StatusNotice embedded><p>{text(error)}</p><TertiaryButton size={buttonSizes.MEDIUM} onPress={()=>run(async()=>{})}>{t('common.retry')}</TertiaryButton></StatusNotice>}
        <div className="lw-documentRequests__list" aria-busy={busy}>
        {items.map((item,index)=><div className={`lw-documentRequests__item${editing?' is-editing':''}`} key={item.id || `new-${index}`}>
            {editing && canEdit ? <>
                <SimpleInput title={text('documentTitle')} aria-label={text('documentTitle')} value={item.title} maxLength={120} timeToWaitInMilli={0} disabled={busy} onChange={event=>patch(index,{title:event.target.value})}/>
                <TertiaryButton size={buttonSizes.MEDIUM} disabled={busy} aria-label={`${text('remove')}: ${item.title}`} onPress={()=>{setItems(previous=>previous.filter((_,i)=>i!==index));setDirty(true);}}>{text('remove')}</TertiaryButton>
                <SimpleCheckbox className="lw-documentRequests__optional" title={text('not_required')} aria-label={`${item.title} — ${text('not_required')}`} checked={item.status==='not_required'} disabled={busy} onChange={event=>patch(index,{status:event.target.checked?'not_required':'missing'})}/>
            </> : <>
                <SimpleCheckbox className="lw-documentRequests__check" title={item.title} aria-label={item.title} checked={item.status==='received'} disabled={!canEdit || busy || item.status==='not_required'} onChange={event=>toggleReceived(index,event.target.checked)}/>
                {item.status==='not_required' && <span className="lw-documentRequests__muted">{text('not_required')}</span>}
            </>}
            {canEdit && item.status==='received' && stageFiles.length>0 && <SigningSelect className="lw-documentRequests__file" aria-label={text('file')} value={item.fileId || ''} disabled={busy} onChange={event=>{
                const next=items.map((entry,i)=>i===index?{...entry,fileId:event.target.value?Number(event.target.value):null}:entry);
                if(editing){setItems(next);setDirty(true);}else run(()=>api.save(caseId,{descriptionId,version:data?.version,items:next}));
            }}><option value="">{text('noFile')}</option>{stageFiles.map(file=><option key={file.id} value={file.id}>{file.file_name}</option>)}</SigningSelect>}
        </div>)}
        </div>
        {canEdit && <div className="lw-documentRequests__actions">
            <SecondaryButton size={buttonSizes.MEDIUM} disabled={busy || items.length>=40} onPress={()=>{setEditing(true);setItems(previous=>[...previous,{title:'',status:'missing'}]);setDirty(true);}}>{text('add')}</SecondaryButton>
            {!editing && items.length>0 && <TertiaryButton size={buttonSizes.MEDIUM} disabled={busy} onPress={()=>setEditing(true)}>{text('editList')}</TertiaryButton>}
            {editing && <>
                <PrimaryButton size={buttonSizes.MEDIUM} disabled={busy || !dirty || items.some(item=>!item.title.trim())} onPress={save}>{t('common.save')}</PrimaryButton>
                <TertiaryButton size={buttonSizes.MEDIUM} disabled={busy} onPress={()=>{setItems(data?.items || []);setDirty(false);setEditing(false);}}>{t('common.cancel')}</TertiaryButton>
            </>}
            {busy && <span role="status">{t('common.saving')}</span>}
        </div>}
        {canEdit && data && <>
            {active && missing>0 && <div className="lw-documentRequests__actions">
                <div className="lw-documentRequests__channels" role="group" aria-label={text('channels')}>{(policy?.available || []).map(channel=><SimpleCheckbox key={channel} title={text(channel)} checked={selected.includes(channel)} disabled={busy} onChange={event=>setSelected(previous=>event.target.checked?[...previous,channel]:previous.filter(value=>value!==channel))}/>)}</div>
                <SecondaryButton size={buttonSizes.MEDIUM} disabled={busy || editing || dirty || !selected.length || data.deliveries?.some(job=>['PENDING','SENDING'].includes(job.status))} onPress={send}>{text(data.first_sent_at?'sendAgain':'send')}</SecondaryButton>
                {data.state==='active' && <TertiaryButton size={buttonSizes.MEDIUM} disabled={busy} onPress={()=>run(()=>api.action(caseId,data.id,{version:data.version,action:'cancel'}))}>{text('stop')}</TertiaryButton>}
            </div>}
            {data.next_due && <p>{text('next')} {new Date(data.next_due).toLocaleString('he-IL')}</p>}
            {data.history?.length>0 && <div className="lw-documentRequests__history"><TertiaryButton size={buttonSizes.MEDIUM} aria-expanded={historyOpen} onPress={()=>setHistoryOpen(value=>!value)}>{text('history')}</TertiaryButton><div hidden={!historyOpen}>
                {data.deliveries?.map(job=><p key={job.id}>{job.client_name} · {text(job.channel)} · {text(`delivery.${job.status}`)} · {new Date(job.sent_at || job.scheduled_for).toLocaleString('he-IL')}</p>)}
                {data.history.map(event=><p key={event.id}>{text(`actions.${event.action}`)} {event.actor_name || ''} · {new Date(event.created_at).toLocaleString('he-IL')}</p>)}
            </div></div>}
        </>}
    </section>;
}
