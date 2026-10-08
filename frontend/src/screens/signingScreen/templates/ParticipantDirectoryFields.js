import React, { useEffect, useRef, useState } from 'react';
import api from '../../../api/signingPackagesApi';
import SearchInput from '../../../components/specializedComponents/containers/SearchInput';
import BlockDateInput from '../../../components/simpleComponents/BlockDateInput';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import { uploadFileToR2 } from '../../../utils/fileUploadUtils';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';
import { newKey } from './ParticipantActionDialog';
import useSigningLocale from './useSigningLocale';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
// Date-only validity uses the reviewer's currently displayed local day. The API
// receives explicit UTC instants; an end date includes that entire local day.
const instant = (value, end = false) => value ? new Date(`${value}T${end ? '23:59:59.999' : '00:00:00'}`).toISOString() : null;

export default function ParticipantDirectoryFields({ person = {}, capacity = 'personal', roleKey, onChange, service = api }) {
    const { t, direction, date, errorMessage } = useSigningLocale();
    const tr = key => t(`signingV2.authority.${key}`);
    const [open, setOpen] = useState(capacity === 'representative');
    const [directory, setDirectory] = useState({ people: [], parties: [], canManageAuthority: false });
    const [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(null);
    const [savedPerson, setSavedPerson] = useState(null), [authorities, setAuthorities] = useState([]), [personParties,setPersonParties] = useState([]);
    const [partyName, setPartyName] = useState(''), [partyKind, setPartyKind] = useState('company'), [registration, setRegistration] = useState(''), [registrationCountry,setRegistrationCountry] = useState('IL');
    const [evidence, setEvidence] = useState(null), [from, setFrom] = useState(today), [until, setUntil] = useState(''), [reason, setReason] = useState('');
    const [identity, setIdentity] = useState({country:'IL',type:'id',value:''});
    const request = useRef(0), pending = useRef(new Map()), locked = useRef(false);
    useEffect(() => {
        if (!open) return undefined;
        const generation = ++request.current;
        const timer = setTimeout(() => service.directory(query).then(value => { if (generation === request.current) setDirectory(value); })
            .catch(e => { if (generation === request.current) setError(e); }), 150);
        return () => { request.current += 1; clearTimeout(timer); };
    }, [open, query, service]);
    useEffect(() => {
        setSavedPerson(current => current?.id === person.personId ? current : null); setAuthorities([]); setPersonParties([]);
        if (!person.personId || !open) return undefined;
        let current = true;
        service.personAuthorities(person.personId).then(value => { if (current) { setAuthorities(value.authorities); if(value.person)setSavedPerson(value.person); if(value.parties)setPersonParties(value.parties); } }).catch(e => { if (current) setError(e); });
        return () => { current = false; };
    }, [person.personId, open, service]);
    const run = async action => {
        if (locked.current) return; locked.current = true; setBusy(true); setError(null);
        try { await action(); } catch (e) { setError(e); } finally { locked.current = false; setBusy(false); }
    };
    const create = async (kind, body) => {
        const fingerprint = JSON.stringify([kind,body]);
        if (!pending.current.has(fingerprint)) pending.current.set(fingerprint,newKey());
        return service.createDirectoryEntry(kind,body,pending.current.get(fingerprint));
    };
    const pickPerson = next => {
        setSavedPerson(next); setAuthorities([]); setReason(''); setEvidence(null);
        onChange({...person,personId:next.id,name:next.name,email:next.endpoints?.email || '',phone:next.endpoints?.phone || '',partyId:undefined,authorityId:undefined});
    };
    const selected = authorities.find(item => item.id === person.authorityId);
    const currentPerson = savedPerson || directory.people.find(item => item.id === person.personId);
    const availableParties=[...new Map([...directory.parties,...personParties].map(item=>[item.id,item])).values()];
    const selectedParty = availableParties.find(item => item.id === person.partyId);
    const activeAuthority = item => item.status === 'approved' && new Date(item.validFrom) <= new Date() && (!item.validUntil || new Date(item.validUntil) > new Date()) && (item.scope.allSigning || item.scope.roleKeys?.includes(roleKey));
    const text = (key,value,change,extra={}) => <label className="lw-signingCompose__field">{tr(key)}<input dir={direction} value={value} onChange={event=>change(event.target.value)} disabled={busy} {...extra}/></label>;
    const upload = file => run(async()=>{
        if (!file || !/\.pdf$/i.test(file.name) || file.size > 20*1024*1024) throw new Error(tr('pdfOnly'));
        const result=await uploadFileToR2(file);if(!result.success)throw new Error(tr('uploadFailed'));
        setEvidence((await service.registerAuthorityEvidence(result.data.key)).evidence);
    });
    return <details className="lw-signingCompose__directory" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
        <summary>{tr(capacity === 'representative' ? 'representativeTitle' : 'directoryTitle')}</summary>
        <fieldset disabled={busy} className="lw-signingCompose__directoryBody">
            <p>{tr(capacity === 'representative' ? 'representativeHelp' : 'directoryHelp')}</p>
            {error && <StatusNotice variant="error" role="alert">{error.code ? errorMessage(error) : error.message || tr('requestFailed')}</StatusNotice>}
            {person.personId ? <div><p><strong>{person.name}</strong> · {tr(currentPerson?.identityVerified ? 'identityVerified' : 'identityUnverified')}</p>
                <SecondaryButton onPress={()=>onChange({...person,personId:undefined,partyId:undefined,authorityId:undefined})}>{tr('changePerson')}</SecondaryButton></div> : <>
                <SearchInput title={tr('searchPerson')} aria-label={tr('searchPerson')} dir={direction} containerDir={direction} value={query} timeToWaitInMilli={0}
                    acceptExternalValueWhileFocused queryResult={directory.people} onSearch={setQuery}
                    getButtonTextFunction={item=>[item.name,item.endpoints?.email||item.endpoints?.phone].filter(Boolean).join(' · ')}
                    getSelectValueFunction={item=>item.name} buttonPressFunction={(_text,item)=>pickPerson(item)}/>
                <SecondaryButton disabled={!person.name?.trim() || busy} onPress={()=>run(async()=>pickPerson((await create('people',{name:person.name.trim(),endpoints:{...(person.email?{email:person.email.trim()}:{}),...(person.phone?{phone:person.phone.trim()}: {})}})).person))}>{tr('savePerson')}</SecondaryButton>
            </>}
            {person.personId && capacity === 'representative' && <>
                <label className="lw-signingCompose__field">{tr('party')}<select dir={direction} value={person.partyId||''} onChange={event=>onChange({...person,partyId:event.target.value,authorityId:undefined})}>
                    <option value="">{tr('chooseParty')}</option>
                    {person.partyId && !selectedParty && <option value={person.partyId}>{tr('savedParty')}</option>}
                    {availableParties.filter(item=>item.personId!==person.personId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
                </select></label>
                <details><summary>{tr('newParty')}</summary>
                    <label className="lw-signingCompose__field">{tr('partyKind')}<select dir={direction} value={partyKind} onChange={event=>setPartyKind(event.target.value)}><option value="company">{tr('company')}</option><option value="person">{tr('person')}</option></select></label>
                    {text('partyName',partyName,setPartyName,{maxLength:300})}
                    {partyKind === 'company' && <>{text('registration',registration,setRegistration,{maxLength:80,dir:'ltr'})}{registration && text('country',registrationCountry,value=>setRegistrationCountry(value.toUpperCase()),{maxLength:2,dir:'ltr'})}</>}
                    <SecondaryButton disabled={!partyName.trim()||busy} onPress={()=>run(async()=>{
                        let next;
                        if(partyKind==='company') next=(await create('parties',{name:partyName.trim(),...(registration?{registration:{country:registrationCountry,type:'company',value:registration}}:{})})).party;
                        else next=(await create('people',{name:partyName.trim()})).party;
                        if(!next)throw new Error(tr('requestFailed'));
                        setDirectory(old=>({...old,parties:[...old.parties.filter(item=>item.id!==next.id),next]}));onChange({...person,partyId:next.id,authorityId:undefined});setPartyName('');
                    })}>{tr('addParty')}</SecondaryButton>
                </details>
                {!!person.partyId && <label className="lw-signingCompose__field">{tr('authority')}<select dir={direction} value={person.authorityId||''} onChange={event=>onChange({...person,authorityId:event.target.value})}>
                    <option value="">{tr('chooseAuthority')}</option>
                    {authorities.filter(item=>item.partyId===person.partyId).map(item=><option key={item.id} value={item.id}>{tr(`states.${item.status}`)} · {date(item.validFrom)}{item.validUntil?` – ${date(item.validUntil)}`:''}</option>)}
                </select></label>}
                {selected && <StatusNotice variant={activeAuthority(selected)?'info':'warning'}>{tr(activeAuthority(selected)?'ready':'notReady')}</StatusNotice>}
            </>}
            {person.personId && directory.canManageAuthority && <details>
                <summary>{tr('reviewEvidence')}</summary>
                <p>{tr('reviewHelp')}</p>
                <label className="lw-signingCompose__file">{tr('uploadEvidence')}<input type="file" accept=".pdf,application/pdf" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)upload(file);}}/></label>
                {evidence && <p role="status">{tr('evidenceSaved')}</p>}
                {(evidence || selected) && <SecondaryButton onPress={()=>run(async()=>downloadBlobAsFile(await service.authorityEvidence(selected?.evidenceArtifactId||evidence.id),'authority.pdf'))}>{tr('viewEvidence')}</SecondaryButton>}
                {text('reason',reason,setReason,{maxLength:1000})}
                {capacity==='representative' && person.partyId && <>
                    <BlockDateInput title={tr('validFrom')} value={from} containerDir={direction} onChange={event=>setFrom(event.target.value)}/>
                    <BlockDateInput title={tr('validUntil')} value={until} containerDir={direction} onChange={event=>setUntil(event.target.value)}/>
                    <SecondaryButton disabled={!evidence||!from||busy} onPress={()=>run(async()=>{
                        const body={personId:person.personId,partyId:person.partyId,evidenceArtifactId:evidence.id,scope:{roleKeys:[roleKey]},validFrom:instant(from),validUntil:instant(until,true)};
                        const result=await create('authorities',body);setAuthorities(old=>[...old.filter(item=>item.id!==result.authority.id),result.authority]);onChange({...person,authorityId:result.authority.id});
                    })}>{tr('createAuthority')}</SecondaryButton>
                    {selected?.status==='pending' && <SecondaryButton disabled={!reason.trim()||busy} onPress={()=>run(async()=>{
                        const result=await service.changeAuthority(selected.id,{action:'approve',expectedVersion:selected.version,reason:reason.trim()});setAuthorities(old=>old.map(item=>item.id===selected.id?result.authority:item));
                    })}>{tr('approve')}</SecondaryButton>}
                    {selected && selected.status!=='revoked' && <SecondaryButton disabled={!reason.trim()||busy} onPress={()=>run(async()=>{
                        const result=await service.changeAuthority(selected.id,{action:'revoke',expectedVersion:selected.version,reason:reason.trim()});setAuthorities(old=>old.map(item=>item.id===selected.id?result.authority:item));
                    })}>{tr('revoke')}</SecondaryButton>}
                </>}
                <details><summary>{tr('verifyIdentity')}</summary>
                    <p>{tr('identityHelp')}</p>
                    {text('country',identity.country,value=>setIdentity(old=>({...old,country:value.toUpperCase()})),{maxLength:2,dir:'ltr'})}
                    <label className="lw-signingCompose__field">{tr('identityType')}<select dir={direction} value={identity.type} onChange={event=>setIdentity(old=>({...old,type:event.target.value}))}>{['id','passport','other'].map(type=><option key={type} value={type}>{tr(`identityTypes.${type}`)}</option>)}</select></label>
                    {text('identityValue',identity.value,value=>setIdentity(old=>({...old,value})),{maxLength:100,dir:'ltr',autoComplete:'off'})}
                    <SecondaryButton disabled={!currentPerson||!evidence||!identity.value.trim()||!reason.trim()||busy} onPress={()=>run(async()=>{
                        const result=await service.verifyPersonIdentity(person.personId,{expectedVersion:currentPerson.version,identity,evidenceArtifactId:evidence.id,reason:reason.trim()});setSavedPerson(result.person);setIdentity(old=>({...old,value:''}));
                    })}>{tr('confirmIdentity')}</SecondaryButton>
                </details>
            </details>}
            {person.personId && capacity==='representative' && !directory.canManageAuthority && <p>{tr('needsApprover')}</p>}
        </fieldset>
    </details>;
}
