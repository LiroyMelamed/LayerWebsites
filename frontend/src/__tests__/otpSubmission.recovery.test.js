import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginOtpScreen from '../screens/otpScreen/OtpScreen.js/LoginOtpScreen';
import loginApi from '../api/loginApi';
import { useLoginVerifyOtpCodeFieldsProvider } from '../providers/LoginVerifyOtpCodeFieldsProvider';
const mockNavigate=jest.fn();
jest.mock('react-router-dom',()=>({useNavigate:()=>mockNavigate}));
jest.mock('react-i18next',()=>({useTranslation:()=>({t:key=>key})}));
jest.mock('../api/loginApi',()=>({__esModule:true,default:{verifyOtp:jest.fn()}}));
jest.mock('../providers/LoginVerifyOtpCodeFieldsProvider',()=>({useLoginVerifyOtpCodeFieldsProvider:jest.fn()}));
jest.mock('../lib/resolvePostLoginNavigation',()=>({resolvePostLoginPath:async()=>'/AdminStack/MainScreen'}));
jest.mock('../lib/tenantSlug',()=>({getActiveTenantSlug:()=>null}));
jest.mock('../assets/images/images',()=>({images:{Backgrounds:{AppBackground:''}}}));
jest.mock('../components/ui/showAppToast',()=>({toastFromApiError:jest.fn()}));
jest.mock('../screens/loginScreen/components/LoginSimpleScreen',()=>({__esModule:true,default:({children,unScrollableBottomComponent})=><div>{children}{unScrollableBottomComponent}</div>}));
jest.mock('../screens/otpScreen/components/TopCenteredLogoOtp',()=>()=>null);
jest.mock('../components/simpleComponents/SimpleContainer',()=>({__esModule:true,default:({children})=><div>{children}</div>}));
jest.mock('../components/simpleComponents/SimpleInput',()=>({__esModule:true,default:({value,onChange,onKeyDown})=><input aria-label="otp" value={value} onChange={onChange} onKeyDown={onKeyDown}/> }));
jest.mock('../screens/loginScreen/components/NextLoginButton',()=>({__esModule:true,default:({onPress,disabled})=><button disabled={disabled} onClick={onPress}>Send</button>}));
function Harness(){const [otpNumber,setOtpNumber]=useState('');useLoginVerifyOtpCodeFieldsProvider.mockReturnValue({otpNumber,setOtpNumber,otpError:null,phoneNumber:'0509999999',loginChannel:'phone'});return <LoginOtpScreen/>;}
beforeEach(()=>{jest.clearAllMocks();localStorage.clear();});
test('automatic submission, manual click and Enter consume the code only once through navigation',async()=>{
 let finish;loginApi.verifyOtp.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));render(<Harness/>);
 fireEvent.change(screen.getByLabelText('otp'),{target:{value:'123456'}});
 fireEvent.click(screen.getByText('Send'));fireEvent.keyDown(screen.getByLabelText('otp'),{key:'Enter'});
 expect(loginApi.verifyOtp).toHaveBeenCalledTimes(1);
 await act(async()=>finish({status:200,data:{token:'synthetic',role:'Staff',refreshToken:'synthetic'}}));
 await waitFor(()=>expect(mockNavigate).toHaveBeenCalledWith('/AdminStack/MainScreen',{replace:true}));
 expect(loginApi.verifyOtp).toHaveBeenCalledTimes(1);
});
test('failed verification does not auto-loop and allows an explicit retry',async()=>{
 loginApi.verifyOtp.mockResolvedValue({status:401,success:false});render(<Harness/>);
 fireEvent.change(screen.getByLabelText('otp'),{target:{value:'123456'}});
 await waitFor(()=>expect(screen.getByText('Send').disabled).toBe(false));
 expect(loginApi.verifyOtp).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByText('Send'));
 await waitFor(()=>expect(loginApi.verifyOtp).toHaveBeenCalledTimes(2));
});
