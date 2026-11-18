import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CaseMenuItemOpen from './CaseMenuItemOpen';
import CaseTimeline from '../../cases/CaseTimeline';

jest.mock('react-i18next', () => ({ ...jest.requireActual('react-i18next'), useTranslation: () => ({ t: (key) => key }) }));
jest.mock('../../../../providers/FirmPermissionsProvider', () => ({ useFirmPermissions: () => null }));
jest.mock('../../../../providers/PopUpProvider', () => ({ usePopup: () => ({ openPopup: jest.fn(), closePopup: jest.fn() }) }));
jest.mock('../../../../hooks/useHttpRequest', () => () => ({ isPerforming: false, performRequest: jest.fn() }));
jest.mock('../../../../services/firmSettings', () => ({ useFirmPhone: () => '0500000000' }));
jest.mock('../../../../api/filesApi', () => ({ getStageFiles: jest.fn(async () => ({ data: [] })) }));
jest.mock('../../cases/CaseTimeline', () => jest.fn(() => <button type="button">קובץ הדגמה</button>));

const fullCase = { CaseId: 1, CaseName: 'תיק הדגמה', Descriptions: [], CurrentStage: 0, IsClosed: false };

beforeEach(() => {
    jest.clearAllMocks();
    CaseTimeline.mockImplementation(() => <button type="button">קובץ הדגמה</button>);
});

test('a large collapsed case list never mounts timelines or their network effects', () => {
    const { rerender } = render(<>{Array.from({ length: 240 }, (_, i) =>
        <CaseMenuItemOpen key={i} fullCase={{ ...fullCase, CaseId: i + 1 }} isOpen={false} isClient />)}</>);
    expect(CaseTimeline).not.toHaveBeenCalled();
    rerender(<CaseMenuItemOpen fullCase={fullCase} isOpen isClient />);
    expect(CaseTimeline).toHaveBeenCalledTimes(1);
    CaseTimeline.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'סגירת שלבי התיק: תיק הדגמה' }));
    expect(CaseTimeline).not.toHaveBeenCalled();
});

test('collapsed case actions leave the accessibility tree and return when expanded', () => {
    const { rerender, container } = render(<CaseMenuItemOpen fullCase={fullCase} isOpen={false} isClient />);
    expect(screen.queryByRole('button', { name: 'קובץ הדגמה' })).toBeNull();
    expect(container.firstChild.hasAttribute('inert')).toBe(true);
    rerender(<CaseMenuItemOpen fullCase={fullCase} isOpen isClient />);
    expect(screen.getByRole('button', { name: 'קובץ הדגמה' })).toBeTruthy();
    expect(container.firstChild.hasAttribute('inert')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'סגירת שלבי התיק: תיק הדגמה' }));
    expect(screen.queryByRole('button', { name: 'קובץ הדגמה' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת שלבי התיק: תיק הדגמה' }));
    expect(screen.getByRole('button', { name: 'קובץ הדגמה' })).toBeTruthy();
});

test('always-expanded case content remains available', () => {
    render(<CaseMenuItemOpen fullCase={fullCase} isOpen={false} alwaysExpanded isClient />);
    expect(screen.getByRole('button', { name: 'קובץ הדגמה' })).toBeTruthy();
});
