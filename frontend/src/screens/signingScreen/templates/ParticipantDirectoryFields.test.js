import React,{useState} from 'react';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import {createInstance} from 'i18next';
import {I18nextProvider,initReactI18next} from 'react-i18next';
import ParticipantDirectoryFields from './ParticipantDirectoryFields';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';
import {uploadFileToR2} from '../../../utils/fileUploadUtils';
jest.mock('../../../utils/fileUploadUtils',()=>({uploadFileToR2:jest.fn()}));
jest.mock('../../../utils/downloadBlobAsFile',()=>({downloadBlobAsFile:jest.fn()}));

// Drive the real platform picker; DOM change on its combobox button is inert.
async function choose(control, name) {
    fireEvent.click(control);
    const option = await screen.findByRole('option', { name });
    expect(option).toBeEnabled();
    fireEvent.pointerDown(option);
}
if(!window.crypto?.getRandomValues)Object.defineProperty(window,'crypto',{value:require('crypto').webcrypto});
const person={id:'person-1',name:'Synthetic signer',version:1,endpoints:{email:'signer@example.invalid'},identityVerified:false};
const party={id:'party-1',name:'Synthetic Company',kind:'legal_entity'};
const authority={id:'authority-1',personId:person.id,partyId:party.id,evidenceArtifactId:'proof-1',scope:{roleKeys:['buyer']},validFrom:'2020-01-01T00:00:00Z',validUntil:null,status:'pending',version:1};
const service=()=>({directory:jest.fn(async()=>({people:[person],parties:[party],canManageAuthority:true})),personAuthorities:jest.fn(async()=>({authorities:[authority]})),
    changeAuthority:jest.fn(async(id,body)=>({authority:{...authority,status:body.action==='approve'?'approved':'revoked',version:2}})),
    createDirectoryEntry:jest.fn(async()=>({person})),registerAuthorityEvidence:jest.fn(async()=>({evidence:{id:'proof-2'}})),
    verifyPersonIdentity:jest.fn(async()=>({person:{...person,identityVerified:true,version:2}}))});
async function setup(lang,api=service(),initial={name:person.name,email:person.endpoints.email,personId:person.id,partyId:party.id,authorityId:authority.id},capacity='representative'){
    const i18n=createInstance();await i18n.use(initReactI18next).init({resources:{he:{translation:he},ar:{translation:ar},en:{translation:en}},lng:lang,fallbackLng:false,interpolation:{escapeValue:false}});
    const changes=jest.fn();function Harness(){const [value,setValue]=useState(initial);return <ParticipantDirectoryFields person={value} roleKey="buyer" capacity={capacity} service={api} onChange={next=>{changes(next);setValue(next);}}/>;}
    render(<I18nextProvider i18n={i18n}><Harness/></I18nextProvider>);return {api,changes,tr:key=>i18n.t(`signingV2.authority.${key}`)};
}
for(const language of ['he','ar','en'])test(`explicit representative approval/revocation, canonical references and identity review in ${language}`,async()=>{
    const {api,tr,changes}=await setup(language);
    await screen.findByText(tr('notReady'));
    await waitFor(()=>expect(api.directory).toHaveBeenCalled());
    fireEvent.click(screen.getByText(tr('reviewEvidence')));
    const approve=screen.getByRole('button',{name:tr('approve')});expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText(tr('reason')),{target:{value:'Synthetic evidence checked'}});
    fireEvent.click(approve);await screen.findByText(tr('ready'));
    expect(api.changeAuthority).toHaveBeenCalledWith(authority.id,{action:'approve',expectedVersion:1,reason:'Synthetic evidence checked'});
    fireEvent.click(screen.getByRole('button',{name:tr('revoke')}));await screen.findByText(tr('notReady'));
    expect(api.changeAuthority).toHaveBeenLastCalledWith(authority.id,{action:'revoke',expectedVersion:2,reason:'Synthetic evidence checked'});
    uploadFileToR2.mockResolvedValue({success:true,data:{key:'users/1/synthetic.pdf'}});
    fireEvent.change(screen.getByLabelText(tr('uploadEvidence')),{target:{files:[new File(['synthetic'],'evidence.pdf',{type:'application/pdf'})]}});
    await screen.findByText(tr('evidenceSaved'));
    fireEvent.click(screen.getByText(tr('verifyIdentity')));
    fireEvent.change(screen.getByLabelText(tr('identityValue')),{target:{value:'000000001'}});
    fireEvent.click(screen.getByRole('button',{name:tr('confirmIdentity')}));
    await waitFor(()=>expect(api.verifyPersonIdentity).toHaveBeenCalledWith(person.id,expect.objectContaining({expectedVersion:1,identity:{country:'IL',type:'id',value:'000000001'},evidenceArtifactId:'proof-2'})));
    await screen.findByText(tr('identityVerified'),{exact:false});
    expect(screen.getByLabelText(tr('identityValue'))).toHaveValue('');
    expect(changes).not.toHaveBeenCalled();
});
test('simple personal entry does not query the directory until opened; creation retry reuses its exact key',async()=>{
    const api=service();api.createDirectoryEntry.mockRejectedValueOnce(new Error('Interrupted')).mockResolvedValueOnce({person});
    const {tr,changes}=await setup('en',api,{name:person.name,email:person.endpoints.email},'personal');
    expect(api.directory).not.toHaveBeenCalled();fireEvent.click(screen.getByText(tr('directoryTitle')));
    const save=screen.getByRole('button',{name:tr('savePerson')});fireEvent.click(save);await screen.findByText('Interrupted');
    fireEvent.click(save);await screen.findByText(tr('changePerson'));
    expect(api.createDirectoryEntry.mock.calls[0][2]).toEqual(api.createDirectoryEntry.mock.calls[1][2]);
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({personId:person.id,name:person.name}));
});
test('view/send access never shows authority approval or identity-review controls',async()=>{
    const api=service();api.directory.mockResolvedValue({people:[person],parties:[party],canManageAuthority:false});
    const {tr}=await setup('en',api);await screen.findByText(tr('needsApprover'));
    expect(screen.queryByText(tr('reviewEvidence'))).not.toBeInTheDocument();expect(api.changeAuthority).not.toHaveBeenCalled();
});

test('a late search response cannot erase the selected person represented parties',async()=>{
    const api=service();let finishSearch;
    api.directory.mockImplementation(()=>new Promise(resolve=>{finishSearch=resolve;}));
    api.personAuthorities.mockResolvedValue({person,parties:[party],authorities:[authority]});
    const {tr,changes}=await setup('en',api);
    const control = await screen.findByRole('combobox',{name:tr('party')});
    fireEvent.click(control);
    await screen.findByRole('option',{name:party.name});
    await waitFor(()=>expect(finishSearch).toBeDefined());
    await act(async()=>finishSearch({people:[person],parties:[],canManageAuthority:true}));
    expect(screen.getByRole('option',{name:party.name})).toBeInTheDocument();
    expect(screen.getByRole('option',{name:party.name})).toHaveAttribute('aria-selected','true');
    expect(changes).not.toHaveBeenCalled();
});
test('a new represented person uses the returned personal party without a truncated search',async()=>{
    const api=service(),represented={id:'represented-party',name:'Same frequent name',kind:'person',personId:'different-person'};
    api.createDirectoryEntry.mockResolvedValue({person:{...person,id:'different-person'},party:represented});
    const {tr,changes}=await setup('en',api);
    await screen.findByText(tr('notReady'));await waitFor(()=>expect(api.directory).toHaveBeenCalled());
    fireEvent.click(screen.getByText(tr('newParty')));
    await choose(screen.getByLabelText(tr('partyKind')), tr('person'));
    fireEvent.change(screen.getByLabelText(tr('partyName')),{target:{value:represented.name}});
    fireEvent.click(screen.getByRole('button',{name:tr('addParty')}));
    await waitFor(()=>expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({partyId:represented.id,authorityId:undefined})));
    expect(api.directory).toHaveBeenCalledTimes(1);
});
