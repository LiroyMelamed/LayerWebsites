import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TaggedCasesScreen from './TaggedCasesScreen';
import mockCasesApi from '../../api/casesApi';

let mockRows;
let mockTypes;
const mockRefresh = jest.fn();
jest.mock('../../api/casesApi', () => ({ __esModule: true,
    default: { getAllTaggedCases: jest.fn() }, casesTypeApi: { getAllCasesTypeForFilter: jest.fn() },
}));
jest.mock('../../hooks/useAutoHttpRequest', () => ({ __esModule: true, default: request => request === mockCasesApi.getAllTaggedCases
    ? { result: mockRows, isPerforming: !Array.isArray(mockRows), performRequest: mockRefresh }
    : { result: mockTypes } }));
jest.mock('../../providers/ScreenSizeProvider', () => ({ useScreenSize: () => ({ isSmallScreen: false }) }));
jest.mock('../../providers/PopUpProvider', () => ({ usePopup: () => ({ openPopup: jest.fn(), closePopup: jest.fn() }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../../assets/images/images', () => ({ images: { Backgrounds: {} } }));
jest.mock('../mainScreen/MainScreen', () => ({ MainScreenName: '/MainScreen' }));
jest.mock('../../navigation/AdminStack', () => ({ AdminStackName: '/AdminStack' }));
jest.mock('./components/TagCasePopup', () => () => null);
jest.mock('../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen', () => () => null);
jest.mock('../../components/styledComponents/buttons/ChooseButton', () => ({ buttonText, items, OnPressChoiceFunction, defaultValue = '' }) =>
    <select aria-label={buttonText} defaultValue={defaultValue} onChange={event => OnPressChoiceFunction(event.target.value)}>
        <option value="">All</option>{items.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>);
jest.mock('../../components/specializedComponents/containers/FilterSearchInput', () => ({ placeholder, onSelect }) =>
    <input aria-label={placeholder} onChange={event => onSelect(event.target.value)} />);
jest.mock('./components/PinnedCasesCard', () => ({ taggedCases, rePerformFunction }) => <section aria-label="Pinned results">
    <ul>{taggedCases.map(row => <li key={row.CaseId}>{row.CaseName}</li>)}</ul>
    <button onClick={rePerformFunction}>Refresh pins</button>
</section>);

const rows = [
    { CaseId: 1, CaseName: 'Open Alpha', IsClosed: false, CaseTypeName: 'Civil', CaseManager: 'Manager A', CompanyName: 'Company A', Users: [{ Name: 'First Client' }, { Name: 'Second Client' }] },
    { CaseId: 2, CaseName: 'Closed Alpha', IsClosed: true, CaseTypeName: 'Civil', CaseManager: 'Manager A', CompanyName: 'Company A', CustomerName: 'Legacy Client' },
    { CaseId: 3, CaseName: 'Open Beta', IsClosed: false, CaseTypeName: 'Tax', CaseManager: 'Manager B', CompanyName: 'Company B', CustomerName: 'Other Client' },
];
const choose = (label, value) => fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } });
const search = (label, value) => fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });
const shown = () => screen.queryAllByRole('listitem').map(item => item.textContent);
beforeEach(() => { mockRows = rows; mockTypes = ['Civil', 'Tax']; mockRefresh.mockClear(); });

test('filters can be selected before data arrives and apply to the eventual response', () => {
    mockRows = undefined;
    const view = render(<TaggedCasesScreen />);
    choose('cases.statusFilter', 'closed');
    choose('cases.caseType', 'Civil');
    expect(shown()).toEqual([]);
    mockRows = rows;
    view.rerender(<TaggedCasesScreen />);
    expect(shown()).toEqual(['Closed Alpha']);
    expect(screen.getByRole('combobox', { name: 'cases.statusFilter' })).toHaveValue('closed');
});

test('refreshing rows preserves the selected closed status and updates matching results', () => {
    const view = render(<TaggedCasesScreen />);
    expect(shown()).toEqual(['Open Alpha', 'Open Beta']);
    choose('cases.statusFilter', 'closed');
    expect(shown()).toEqual(['Closed Alpha']);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh pins' }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    mockRows = [...rows, { ...rows[1], CaseId: 4, CaseName: 'Closed newly refreshed' }];
    view.rerender(<TaggedCasesScreen />);
    expect(shown()).toEqual(['Closed Alpha', 'Closed newly refreshed']);
    expect(screen.getByRole('combobox', { name: 'cases.statusFilter' })).toHaveValue('closed');
});

test('combined filters retain multi-client and legacy-client matching while clearing independently', () => {
    render(<TaggedCasesScreen />);
    choose('cases.caseType', 'Civil');
    choose('cases.caseManager', 'Manager A');
    search('cases.customerName', 'second client');
    search('cases.companyName', 'company a');
    search('taggedCases.searchPinnedCaseTitle', 'alpha');
    expect(shown()).toEqual(['Open Alpha']);
    choose('cases.statusFilter', 'closed');
    expect(shown()).toEqual([]);
    search('cases.customerName', 'legacy');
    expect(shown()).toEqual(['Closed Alpha']);
    search('taggedCases.searchPinnedCaseTitle', 'no match');
    expect(shown()).toEqual([]);
    search('taggedCases.searchPinnedCaseTitle', '');
    expect(shown()).toEqual(['Closed Alpha']);
});

test('truthy non-array results remain empty and recover without resetting the selected filter', () => {
    mockRows = { message: 'Loading failed' }; mockTypes = { message: 'Unavailable' };
    const view = render(<TaggedCasesScreen />);
    choose('cases.statusFilter', 'closed');
    expect(shown()).toEqual([]);
    mockRows = rows; mockTypes = ['Civil', 'Tax'];
    view.rerender(<TaggedCasesScreen />);
    expect(shown()).toEqual(['Closed Alpha']);
});
