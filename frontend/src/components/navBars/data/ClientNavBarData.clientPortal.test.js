import { getClientNavBarData } from './ClientNavBarData';
import { openExternalUrl } from '../../../utils/externalNavigation';

jest.mock('../../../navigation/ClientStack', () => ({ ClientStackName: '/ClientStack' }));
jest.mock('../../termsAndConditions/TermsOfConditons', () => () => null);
jest.mock('../../../utils/externalNavigation', () => ({ openExternalUrl: jest.fn() }));
jest.mock('../../../services/firmSettings', () => ({ getFirmPhone: () => '15550000000' }));
const t = key => key;
beforeEach(() => { jest.clearAllMocks(); window.history.replaceState({}, '', '/office/ClientStack/ClientMainScreen'); });

test('provides one documents entry in the web menu while retaining notifications and support', () => {
    const navigate = jest.fn();
    const { NavBarLinks } = getClientNavBarData(navigate, jest.fn(), jest.fn(), false, t);
    expect(NavBarLinks.map(item => item.navKey)).toEqual([
        'clientHome', 'clientDocuments', 'clientCases',
        'notifications', 'supportTicket', 'myProfile', 'terms', 'contact',
    ]);
    for (const item of NavBarLinks.filter(item => item.routeMatch)) {
        item.onClick();
        expect(navigate).toHaveBeenLastCalledWith('/office/ClientStack' + item.routeMatch);
    }
});

test('native mode has the same unified documents entry without duplicating native footer destinations', () => {
    const { NavBarLinks } = getClientNavBarData(jest.fn(), jest.fn(), jest.fn(), true, t);
    expect(NavBarLinks.map(item => item.navKey)).toEqual([
        'clientHome', 'clientDocuments', 'clientCases', 'supportTicket', 'terms',
    ]);
});

test('existing terms popup and contact behavior remain available without changing navigation', () => {
    const navigate = jest.fn(); const openPopup = jest.fn(); const closePopup = jest.fn();
    const { NavBarLinks } = getClientNavBarData(navigate, openPopup, closePopup, false, t);
    NavBarLinks.find(item => item.navKey === 'terms').onClick();
    expect(openPopup.mock.calls[0][0].props.closePopUpFunction).toBe(closePopup);
    NavBarLinks.find(item => item.navKey === 'contact').onClick();
    expect(openExternalUrl).toHaveBeenCalledWith('https://wa.me/15550000000?text=nav.contactMessage', { newTab: true });
    expect(navigate).not.toHaveBeenCalled();
});
