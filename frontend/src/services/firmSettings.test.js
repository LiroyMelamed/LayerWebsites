import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ApiUtils from '../api/apiUtils';
import { loadFirmSettings, useAiChatbotEnabled, useCalendarModuleEnabled } from './firmSettings';
jest.mock('../api/apiUtils',()=>({__esModule:true,default:{get:jest.fn()}}));
function Flags(){const chat=useAiChatbotEnabled(),calendar=useCalendarModuleEnabled();return <p data-testid="flags">{String(chat)}:{String(calendar)}</p>;}
test('already mounted and newly mounted consumers update after save and remote refresh',async()=>{
 ApiUtils.get.mockResolvedValue({status:200,data:{AI_CHATBOT_ENABLED:true,ENABLE_CALENDAR_MODULE:true}});
 await act(async()=>{await loadFirmSettings({force:true});});
 const view=render(<Flags/>);expect(screen.getByTestId('flags').textContent).toBe('true:true');
 ApiUtils.get.mockResolvedValue({status:200,data:{AI_CHATBOT_ENABLED:'false',ENABLE_CALENDAR_MODULE:'false'}});
 await act(async()=>{await loadFirmSettings({force:true});});
 expect(screen.getByTestId('flags').textContent).toBe('false:false');
 ApiUtils.get.mockResolvedValue({status:500,data:{}});
 const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
 await act(async()=>{await loadFirmSettings({force:true});});expect(screen.getByTestId('flags').textContent).toBe('false:false');warn.mockRestore();
 ApiUtils.get.mockResolvedValue({status:200,data:{AI_CHATBOT_ENABLED:'1',ENABLE_CALENDAR_MODULE:true}});
 await act(async()=>{window.dispatchEvent(new Event('focus'));});
 expect(screen.getByTestId('flags').textContent).toBe('true:true');view.unmount();
});
