import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import CaseDocumentRequests from './CaseDocumentRequests';
import api from '../../../api/documentRequestsApi';
let mockConfirmation;const mockOpen=jest.fn(element=>{mockConfirmation=element;});
jest.mock('../../../api/documentRequestsApi',()=>({__esModule:true,default:{list:jest.fn(),save:jest.fn(),action:jest.fn()}}));
jest.mock('react-i18next',()=>({useTranslation:()=>({t:key=>key})}));
jest.mock('../../../providers/FirmPermissionsProvider',()=>({useFirmPermissions:()=>({canAction:()=>true})}));
jest.mock('../../../providers/PopUpProvider',()=>({usePopup:()=>({openPopup:mockOpen,closePopup:jest.fn()})}));
async function openDocuments() { fireEvent.click(await screen.findByRole('button',{name:'documentRequests.title'})); }
const row={id:'request',description_id:101,version:3,items:[{id:'item',title:'Identity',status:'missing'}],channels:['sms'],state:'paused',deliveries:[],history:[]};
beforeEach(()=>{jest.clearAllMocks();mockOpen.mockImplementation(element=>{mockConfirmation=element;});api.list.mockResolvedValue({requests:[row],policy:{available:['sms','email'],defaults:['email']}});api.save.mockResolvedValue({});api.action.mockResolvedValue({});});
test('client sees shared completion status with no write or send controls',async()=>{
 render(<CaseDocumentRequests caseId={10} descriptionId={101} active isClient/>);
 await openDocuments();
 expect(await screen.findByRole('checkbox',{name:'Identity'})).toBeDisabled();
 expect(screen.getByRole('checkbox',{name:'Identity'})).not.toBeChecked();
 expect(screen.queryByRole('textbox')).toBeNull();expect(screen.queryByText('documentRequests.send')).toBeNull();expect(api.save).not.toHaveBeenCalled();
});
test('received status can be saved without requiring a file and uses the shared version',async()=>{
 render(<CaseDocumentRequests caseId={10} descriptionId={101} active/>);
 await openDocuments();
 fireEvent.click(await screen.findByRole('checkbox',{name:'Identity'}));
 expect(screen.queryByRole('combobox')).toBeNull();
 await waitFor(()=>expect(api.save).toHaveBeenCalledWith(10,{descriptionId:101,version:3,items:[{...row.items[0],status:'received'}]}));
 expect(api.action).not.toHaveBeenCalled();
});
test('manual delivery requires explicit confirmation and sends selected channels only',async()=>{
 render(<CaseDocumentRequests caseId={10} descriptionId={101} active/>);
 await openDocuments();
 fireEvent.click(await screen.findByRole('button',{name:'documentRequests.send'}));expect(api.action).not.toHaveBeenCalled();expect(mockOpen).toHaveBeenCalled();
 await act(async()=>mockConfirmation.props.onConfirm());
 await waitFor(()=>expect(api.action).toHaveBeenCalledWith(10,'request',{version:3,action:'send',channels:['sms'],confirmUnknown:false}));
});

test('list editing keeps not-required distinct from received',async()=>{
 render(<CaseDocumentRequests caseId={10} descriptionId={101} active/>);
 await openDocuments();
 fireEvent.click(await screen.findByRole('button',{name:'documentRequests.editList'}));
 fireEvent.click(screen.getByRole('checkbox',{name:'Identity — documentRequests.not_required'}));
 expect(api.save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'common.save'}));
 await waitFor(()=>expect(api.save).toHaveBeenCalledWith(10,{descriptionId:101,version:3,items:[{...row.items[0],status:'not_required'}]}));
});
test('failed status save does not claim the document was received',async()=>{
 api.save.mockRejectedValueOnce(new Error('offline'));
 render(<CaseDocumentRequests caseId={10} descriptionId={101} active/>);
 await openDocuments();
 fireEvent.click(await screen.findByRole('checkbox',{name:'Identity'}));
 await screen.findByText('documentRequests.saveFailed');
 expect(screen.getByRole('checkbox',{name:'Identity'})).not.toBeChecked();
});

test('empty stage reveals the list only after adding a document request and cancels cleanly',async()=>{
 api.list.mockResolvedValue({requests:[],policy:{available:['sms'],defaults:['sms']}});
 render(<CaseDocumentRequests caseId={10} descriptionId={101} active/>);
 const add=await screen.findByRole('button',{name:'documentRequests.addRequest'});
 expect(screen.queryByText('documentRequests.title')).toBeNull();
 expect(screen.queryByRole('textbox')).toBeNull();
 fireEvent.click(add);
 expect(screen.getByRole('textbox',{name:'documentRequests.documentTitle'})).toBeVisible();
 expect(screen.getByRole('button',{name:'documentRequests.add'})).toBeVisible();
 expect(api.save).not.toHaveBeenCalled();expect(api.action).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'common.cancel'}));
 expect(screen.getByRole('button',{name:'documentRequests.addRequest'})).toBeVisible();
 expect(screen.queryByText('documentRequests.title')).toBeNull();
});
test('empty saved request remains hidden for clients',async()=>{
 api.list.mockResolvedValue({requests:[{...row,items:[]}],policy:{}});
 render(<CaseDocumentRequests caseId={10} descriptionId={101} active isClient/>);
 await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
 expect(screen.queryByText('documentRequests.title')).toBeNull();
 expect(screen.queryByRole('button')).toBeNull();
});

test('existing document section starts collapsed and toggling never writes or refetches',async()=>{
 render(<CaseDocumentRequests caseId={10} descriptionId={101} active/>);
 const toggle=await screen.findByRole('button',{name:'documentRequests.title'});
 expect(toggle).toHaveAttribute('aria-expanded','false');
 expect(screen.queryByRole('checkbox',{name:'Identity'})).toBeNull();
 expect(screen.queryByRole('button',{name:'documentRequests.add'})).toBeNull();
 fireEvent.click(toggle);
 expect(toggle).toHaveAttribute('aria-expanded','true');
 expect(screen.getByRole('checkbox',{name:'Identity'})).toBeVisible();
 expect(screen.getByRole('button',{name:'documentRequests.add'})).toBeEnabled();
 fireEvent.click(toggle);
 expect(screen.queryByRole('checkbox',{name:'Identity'})).toBeNull();
 expect(api.list).toHaveBeenCalledTimes(1);
 expect(api.save).not.toHaveBeenCalled();expect(api.action).not.toHaveBeenCalled();
});
test('collapsing and reopening preserves an unsaved added document',async()=>{
 render(<CaseDocumentRequests caseId={10} descriptionId={101} active/>);
 await openDocuments();
 fireEvent.click(screen.getByRole('button',{name:'documentRequests.add'}));
 const inputs=screen.getAllByRole('textbox',{name:'documentRequests.documentTitle'});
 fireEvent.change(inputs[1],{target:{value:'Lease'}});
 fireEvent.click(screen.getByRole('button',{name:'documentRequests.title'}));
 expect(screen.queryByRole('textbox')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'documentRequests.title'}));
 expect(screen.getAllByRole('textbox',{name:'documentRequests.documentTitle'})[1]).toHaveValue('Lease');
 expect(api.save).not.toHaveBeenCalled();expect(api.action).not.toHaveBeenCalled();
});
