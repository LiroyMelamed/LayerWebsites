import React,{useState} from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import StageDocumentDefaults from './StageDocumentDefaults';
jest.mock('react-i18next',()=>({useTranslation:()=>({t:key=>key})}));
function Form({initial,disabled}) {const [value,setValue]=useState(initial);return <StageDocumentDefaults value={value} onChange={setValue} disabled={disabled}/>;}
test('defaults start with a single request button and reveal shared fields on demand',()=>{
 render(<Form/>);
 expect(screen.queryByRole('textbox')).toBeNull();expect(screen.queryByRole('checkbox')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'documentRequests.addRequest'}));
 expect(screen.getByRole('textbox')).toBeVisible();
 expect(screen.getByRole('checkbox',{name:'documentRequests.sendOnEntry'})).not.toBeChecked();
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Identity'}});
 fireEvent.click(screen.getByRole('button',{name:'documentRequests.add'}));
 expect(screen.getAllByRole('textbox')).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'documentRequests.remove: Identity'}));
 fireEvent.click(screen.getByRole('button',{name:'documentRequests.remove:'}));
 expect(screen.queryByRole('textbox')).toBeNull();
 expect(screen.getByRole('button',{name:'documentRequests.addRequest'})).toBeVisible();
});
test('existing requirements remain visible and readonly permissions are honored',()=>{
 render(<Form initial={{items:['Identity'],sendOnEntry:false}} disabled/>);
 expect(screen.getByRole('textbox')).toHaveValue('Identity');expect(screen.getByRole('textbox')).toBeDisabled();
 expect(screen.getByRole('checkbox')).toBeDisabled();expect(screen.queryByRole('button')).toBeNull();
});
