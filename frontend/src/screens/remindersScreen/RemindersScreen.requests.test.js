import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RemindersScreen from './RemindersScreen';
import remindersApi from '../../api/remindersApi';

jest.mock('../../api/remindersApi', () => ({ listReminders: jest.fn(), getTemplates: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../../providers/PopUpProvider', () => ({ usePopup: () => ({ openPopup: jest.fn(), closePopup: jest.fn() }) }));
jest.mock('../../providers/ScreenSizeProvider', () => ({ useScreenSize: () => ({ isSmallScreen: false }) }));
jest.mock('../../providers/FirmPermissionsProvider', () => ({ useFirmPermissions: () => ({ canAction: () => true }) }));
jest.mock('../../components/simpleComponents/SimpleScreen', () => ({ children }) => <main>{children}</main>);
jest.mock('../../components/simpleComponents/SimpleScrollView', () => ({ children }) => <div>{children}</div>);
jest.mock('../../components/simpleComponents/SimpleTable', () => () => null);
jest.mock('../../components/styledComponents/buttons/ChooseButton', () => ({ OnPressChoiceFunction }) => <button onClick={() => OnPressChoiceFunction('SENT')}>Sent filter</button>);
jest.mock('../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen', () => () => null);
jest.mock('../../components/navBars/data/NavBarData', () => ({ getNavBarData: () => [] }));
jest.mock('../../navigation/AdminStack', () => ({ AdminStackName: '/AdminStack' }));
jest.mock('../mainScreen/MainScreen', () => ({ MainScreenName: '/MainScreen' }));
jest.mock('../../components/specializedComponents/menuItems/ReminderMenuItem', () => () => null);
jest.mock('./components/ImportRemindersModal', () => () => null);
jest.mock('./components/AddReminderModal', () => () => null);
jest.mock('./components/ReminderDetailPopup', () => () => null);
jest.mock('../../components/ui/showAppToast', () => ({ toastFromApiError: jest.fn() }));

beforeEach(() => {
 remindersApi.getTemplates.mockResolvedValue({ status: 200, data: { templates: [] } });
 remindersApi.listReminders.mockResolvedValue({ status: 200, data: { reminders: [], total: 60 } });
});
test('entry, page change and filter change each perform exactly one list read', async () => {
 render(<RemindersScreen />);
 await screen.findByRole('button', { name: 'reminders.next' });
 expect(remindersApi.listReminders).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button', { name: 'reminders.next' }));
 await waitFor(() => expect(remindersApi.listReminders).toHaveBeenCalledWith({status: undefined, page: 2, limit: 25}));
 expect(remindersApi.listReminders).toHaveBeenCalledTimes(2);
 fireEvent.click(screen.getByRole('button', { name: 'Sent filter' }));
 await waitFor(() => expect(remindersApi.listReminders).toHaveBeenCalledWith({status: 'SENT', page: 1, limit: 25}));
 expect(remindersApi.listReminders).toHaveBeenCalledTimes(3);
});
