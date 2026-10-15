import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import he from '../../../../i18n/locales/he.json';
import TeamActivityPanel from './TeamActivityPanel';
import SummaryStrip from './SummaryStrip';
import AiBriefSection from './AiBriefSection';

const i18n = i18next.createInstance();
i18n.init({ lng: 'he', resources: { he: { translation: he } }, interpolation: { escapeValue: false } });
const show = component => render(<I18nextProvider i18n={i18n}>{component}</I18nextProvider>);
const leader = (managerId, points, rank = 1) => ({managerId, managerName: `מנהל ${managerId}`, points, rank, caseUpdates: points, casesClosed: 0});
const activity = { periods: {
    today: { startsOn: '2026-10-15', casesOpened: 0, casesClosed: 0, leaders: [] },
    week: { startsOn: '2026-10-11', casesOpened: 3, casesClosed: 1, leaders: [leader(1,7),leader(2,7)] },
    month: { startsOn: '2026-10-01', casesOpened: 6, casesClosed: 4, leaders: [leader(2,14)] },
} };

test('starts with the week; selecting month or day changes actual ranking and handles empty periods', () => {
    show(<TeamActivityPanel activity={activity} />);
    expect(screen.getByRole('radio', { name: 'השבוע' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByLabelText('מקום 1')).toHaveLength(2);
    fireEvent.click(screen.getByRole('radio', { name: 'החודש' }));
    expect(screen.getByRole('radio', { name: 'החודש' })).toHaveAttribute('aria-checked', 'true');
    const ranking = screen.getByRole('list', { name: 'דירוג הפעילות בצוות' });
    expect(within(ranking).getByText('14')).toBeInTheDocument();
    expect(within(ranking).queryByText('מנהל 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'היום' }));
    expect(screen.getByText(he.managerHome.team.empty)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

test('missing data is not presented as zero activity', () => {
    show(<TeamActivityPanel />);
    expect(screen.getByText(he.managerHome.team.unavailable)).toBeInTheDocument();
    expect(screen.queryByText(he.managerHome.team.empty)).not.toBeInTheDocument();
});

test('summary keeps keyboard actions and hides signing when not permitted', () => {
    const onNavigate = jest.fn();
    show(<SummaryStrip firmStats={{ activeCases: 12, closedCases: 4 }} summary={{ needsAttentionCount: 3 }} showSigning={false} onNavigate={onNavigate} />);
    expect(screen.getAllByRole('button')).toHaveLength(7);
    fireEvent.keyDown(screen.getByRole('button', { name: /תיקים פתוחים/ }), { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('activeCases');
    fireEvent.click(screen.getByRole('button', { name: /דורשים טיפול/ }));
    expect(onNavigate).toHaveBeenCalledWith('attention');
});

test('business adviser shows grounded content or an honest unavailable state, and respects its setting', () => {
    const { rerender } = show(<AiBriefSection aiBriefEnabled />);
    expect(screen.getByText(he.managerHome.business.insightsUnavailable)).toBeInTheDocument();
    rerender(<I18nextProvider i18n={i18n}><AiBriefSection aiBriefEnabled aiBrief={{lines:['השבוע נפתחו 3 תיקים ונסגר תיק אחד.'], recommendations:['כדאי לבדוק את קצב סגירת התיקים.']}} /></I18nextProvider>);
    expect(screen.getByText('השבוע נפתחו 3 תיקים ונסגר תיק אחד.')).toBeInTheDocument();
    expect(screen.queryByText(he.managerHome.business.insightsUnavailable)).not.toBeInTheDocument();
    rerender(<I18nextProvider i18n={i18n}><AiBriefSection aiBriefEnabled={false} /></I18nextProvider>);
    expect(screen.queryByText(he.managerHome.business.insightsTitle)).not.toBeInTheDocument();
});
