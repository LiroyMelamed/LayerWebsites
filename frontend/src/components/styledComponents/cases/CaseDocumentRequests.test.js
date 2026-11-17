import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import CaseDocumentRequests from './CaseDocumentRequests';
import api from '../../../api/documentRequestsApi';
let mockConfirmation;const mockOpen=jest.fn(element=>{mockConfirmation=element;});
jest.mock('../../../api/documentRequestsApi',()=>({__esModule:true,default:{list:jest.fn(),save:jest.fn(),action:jest.fn()}}));
jest.mock('react-i18next',()=>({useTranslation:()=>({t:key=>key})}));
jest.mock('../../../providers/FirmPermissionsProvider',()=>({useFirmPermissions:()=>({canAction:()=>true})}));
jest.mock('../../../providers/PopUpProvider',()=>({usePopup:()=>({openPopup:mockOpen,closePopup:jest.fn()})}));
const row={id:'request',description_id:101,version:3,items:[{id:'item',title:'Identity',status:'missing'}],channels:['sms'],state:'paused',deliveries:[],history:[]};
beforeEach(()=>{jest.clearAllMocks();mockOpen.mockImplementation(element=>{mockConfirmation=element;});api.list.mockResolvedValue({requests:[row],policy:{available:['sms','email'],defaults:['email']}});api.save.mockResolvedValue({});api.action.mockResolvedValue({});});
test('client sees shared completion status with no write or send controls',async()=>{
 render(<CaseDocumentRequests caseId={10} descriptionId={101} active isClient/>);
 await screen.findByText('Identity');expect(screen.getByText('documentRequests.missing')).toBeInTheDocument();
 expect(screen.queryByRole('textbox')).toBeNull();expect(screen.queryByText('documentRequests.send')).toBeNull();expect(api.save).not.toHaveBeenCalled();
});
test('received status can be saved without requiring a file and uses the shared version',async()=>{
 render(<CaseDocumentRequests caseId={10} descriptionId={101} active/>);
 const select=await screen.findByLabelText('Identity — documentRequests.status');fireEvent.click(select);fireEvent.pointerDown(screen.getByRole('option',{name:'documentRequests.received'}));
 fireEvent.click(screen.getByRole('button',{name:'common.save'}));
 await waitFor(()=>expect(api.save).toHaveBeenCalledWith(10,{descriptionId:101,version:3,items:[{...row.items[0],status:'received'}]}));
 expect(api.action).not.toHaveBeenCalled();
});
test('manual delivery requires explicit confirmation and sends selected channels only',async()=>{
 render(<CaseDocumentRequests caseId={10} descriptionId={101} active/>);
 fireEvent.click(await screen.findByRole('button',{name:'documentRequests.send'}));expect(api.action).not.toHaveBeenCalled();expect(mockOpen).toHaveBeenCalled();
 await act(async()=>mockConfirmation.props.onConfirm());
 await waitFor(()=>expect(api.action).toHaveBeenCalledWith(10,'request',{version:3,action:'send',channels:['sms'],confirmUnknown:false}));
});
