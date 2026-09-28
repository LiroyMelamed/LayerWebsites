import React, { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProfileScreen from './ProfileScreen';
import { customersApi } from '../../../api/customersApi';

jest.mock('../../../api/customersApi', () => ({ customersApi: { getCurrentCustomer: jest.fn(), updateCurrentCustomer: jest.fn() } }));
jest.mock('../../../components/ui/showAppToast', () => ({ toastFromApiError: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('../../../providers/ScreenSizeProvider', () => ({ useScreenSize: () => ({ isSmallScreen: false }) }));
jest.mock('../../../navigation/ClientStack', () => ({ ClientStackName: '/client' }));
jest.mock('../clientMainScreen/ClientMainScreen', () => ({ ClientMainScreenName: '/home' }));
jest.mock('../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen', () => () => null);
jest.mock('../../../components/navBars/data/ClientNavBarData', () => ({ getClientNavBarData: jest.fn() }));
jest.mock('../../../components/simpleComponents/SimpleScreen', () => ({ children }) => <div>{children}</div>);
jest.mock('../../../components/simpleComponents/SimpleScrollView', () => ({ children }) => <div>{children}</div>);
jest.mock('../../../components/styledComponents/buttons/SecondaryButton', () => ({ onPress, children }) => <button onClick={onPress}>{children}</button>);

jest.mock('../../../utils/fileUploadUtils', () => ({ uploadFileToR2: jest.fn(), getFileReadUrl: jest.fn() }));
jest.mock('../../../components/ui/toast', () => ({ toastSuccess: jest.fn() }));
jest.mock('../../../components/simpleComponents/SimpleInput', () => ({ title, value, onChange }) => <label>{title}<input value={value} onChange={onChange} /></label>);
jest.mock('../../../components/styledComponents/buttons/PrimaryButton', () => ({ onPress, children, disabled }) => <button onClick={onPress} disabled={disabled}>{children}</button>);

test('failed profile loading cannot save blank fields; retry restores the original profile before saving', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    customersApi.getCurrentCustomer.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ status: 200, data: {
        Name: 'QA Client', Email: 'qa@example.invalid', PhoneNumber: '0500000000', CompanyName: 'QA',
    } });
    customersApi.updateCurrentCustomer.mockResolvedValue({ status: 200, data: {} });
    try {
        render(<ProfileScreen />);
        expect(await screen.findByRole('alert')).toHaveTextContent('errors.loadFailed');
        expect(screen.queryByRole('button', { name: 'common.save' })).toBeNull();
        expect(customersApi.updateCurrentCustomer).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
        expect(await screen.findByLabelText('cases.customerName')).toHaveValue('QA Client');
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'common.save' })); });
        await waitFor(() => expect(customersApi.updateCurrentCustomer).toHaveBeenCalledWith(expect.objectContaining({
            Name: 'QA Client', Email: 'qa@example.invalid', PhoneNumber: '0500000000', CompanyName: 'QA',
        })));
    } finally { jest.restoreAllMocks(); }
});
