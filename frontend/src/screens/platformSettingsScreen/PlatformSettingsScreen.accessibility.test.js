import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PlatformSettingsScreen from './PlatformSettingsScreen';
import platformSettingsApi from '../../api/platformSettingsApi';
import { useScreenSize } from '../../providers/ScreenSizeProvider';

jest.mock('react-i18next', () => ({ ...jest.requireActual('react-i18next'), useTranslation: () => ({ t: key => ({
    'platformSettings.cat_contractor_monitor': 'מעקב קבלנים',
    'platformSettings.saveChanges': 'שמור שינויים',
}[key] || key) }) }));
jest.mock('../../providers/ScreenSizeProvider', () => ({ useScreenSize: jest.fn() }));
jest.mock('../../providers/PopUpProvider', () => ({ usePopup: () => ({ openPopup: jest.fn(), closePopup: jest.fn() }) }));
jest.mock('../../navigation/AdminStack', () => ({ AdminStackName: '/AdminStack' }));
jest.mock('../mainScreen/MainScreen', () => ({ MainScreenName: '/MainScreen' }));
jest.mock('../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen', () => () => null);
jest.mock('../../services/firmSettings', () => ({ loadFirmSettings: jest.fn().mockResolvedValue({}), getFirmName: () => 'משרד סינתטי' }));
jest.mock('../../api/platformSettingsApi', () => ({ __esModule: true, default: {
    getAll: jest.fn(), getAdmins: jest.fn(), getEmailTemplates: jest.fn(), updateSettings: jest.fn(),
} }));

const activeKeys = ['CM_ACTIVE_SITES_ENABLED', 'CM_ACTIVE_SITES_EMAIL_RECIPIENTS', 'CM_ACTIVE_SITES_SMS_RECIPIENTS', 'CM_ACTIVE_SITES_INCLUDE_IN_GLOBAL_SUMMARY'];
const values = {
    CM_ACTIVE_SITES_ENABLED: false,
    CM_ACTIVE_SITES_INCLUDE_IN_GLOBAL_SUMMARY: false,
    CM_ACTIVE_SITES_EMAIL_RECIPIENTS: '',
    CM_ACTIVE_SITES_SMS_RECIPIENTS: '',
    CM_GLOBAL_EMAIL_RECIPIENTS: 'global@example.invalid',
    CM_GLOBAL_SMS_RECIPIENTS: '0500000999',
};
beforeEach(() => {
    jest.clearAllMocks();
    useScreenSize.mockReturnValue({ isSmallScreen: false });
    platformSettingsApi.getAll.mockResolvedValue({ status: 200, data: {
        settings: { contractor_monitor: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { effectiveValue: value }])) }, channels: [],
    } });
    platformSettingsApi.getAdmins.mockResolvedValue({ status: 200, data: { admins: [] } });
    platformSettingsApi.getEmailTemplates.mockResolvedValue({ status: 200, data: { templates: [] } });
    platformSettingsApi.updateSettings.mockResolvedValue({ status: 200, data: { count: 4 } });
});
async function openContractorTab() {
    render(<PlatformSettingsScreen />);
    await waitFor(() => expect(platformSettingsApi.getAll).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /מעקב קבלנים/ }));
    return screen.findByRole('checkbox', { name: 'אתרי בנייה פעילים מעקב פעיל' });
}

test('four real active-sites controls have visible-label names and recipient/summary descriptions', async () => {
    const active = await openContractorTab();
    expect(active).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'אתרי בנייה פעילים כלול בסיכום הכללי' })).toHaveAccessibleDescription(/הסיכום נשלח לנמעני האימייל הגלובליים/);
    expect(screen.getByRole('textbox', { name: 'אתרי בנייה פעילים נמעני אימייל לדוח הישיר' })).toHaveAccessibleDescription(/ריק = ללא דוח ישיר/);
    expect(screen.getByRole('textbox', { name: 'אתרי בנייה פעילים נמעני SMS (ריק = ללא SMS)' })).toHaveAccessibleDescription(/אין ירושה/);
    expect(screen.getAllByRole('checkbox', { name: /^אתרי בנייה פעילים / })).toHaveLength(2);
    expect(screen.getAllByRole('textbox', { name: /^אתרי בנייה פעילים / })).toHaveLength(2);
});

test('contractor mobile button retains its category name when the visual text is hidden', async () => {
    useScreenSize.mockReturnValue({ isSmallScreen: true });
    render(<PlatformSettingsScreen />);
    await waitFor(() => expect(platformSettingsApi.getAll).toHaveBeenCalled());
    const tab = screen.getByRole('button', { name: /מעקב קבלנים/ });
    fireEvent.click(tab);
    screen.getByText('מעקב קבלנים', { selector: '.lw-platformSettings__tabLabel' }).style.display = 'none';
    expect(screen.getByRole('button', { name: 'מעקב קבלנים' })).toBe(tab);
    expect(tab).toHaveAccessibleName('מעקב קבלנים');
    expect(screen.queryByRole('button', { name: '🏗️' })).toBeNull();
});

test('real named controls still save only the four active-sites edits with unchanged values', async () => {
    const active = await openContractorTab();
    fireEvent.click(active);
    fireEvent.click(screen.getByRole('checkbox', { name: 'אתרי בנייה פעילים כלול בסיכום הכללי' }));
    const email = screen.getByRole('textbox', { name: 'אתרי בנייה פעילים נמעני אימייל לדוח הישיר' });
    const sms = screen.getByRole('textbox', { name: 'אתרי בנייה פעילים נמעני SMS (ריק = ללא SMS)' });
    fireEvent.change(email, { target: { value: 'one@example.invalid,two@example.invalid' } });
    fireEvent.blur(email);
    fireEvent.change(sms, { target: { value: '0500000998,0500000997' } });
    fireEvent.blur(sms);
    fireEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    await waitFor(() => expect(platformSettingsApi.updateSettings).toHaveBeenCalledTimes(1));
    const edits = platformSettingsApi.updateSettings.mock.calls[0][0];
    expect(edits.map(e => e.key).sort()).toEqual([...activeKeys].sort());
    expect(edits).toEqual(expect.arrayContaining([
        { category: 'contractor_monitor', key: activeKeys[0], value: 'true' },
        { category: 'contractor_monitor', key: activeKeys[1], value: 'one@example.invalid,two@example.invalid' },
        { category: 'contractor_monitor', key: activeKeys[2], value: '0500000998,0500000997' },
        { category: 'contractor_monitor', key: activeKeys[3], value: 'true' },
    ]));
});
