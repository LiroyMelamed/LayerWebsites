import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ShowDataCard from './ShowDataCard';

test('interactive summary cards support keyboard navigation and activation', () => {
    const openCases = jest.fn();
    render(<ShowDataCard title="תיקים פתוחים" numberText={12} optionalOnClick={openCases} />);
    const card = screen.getByRole('button', { name: /תיקים פתוחים/ });
    expect(card.tabIndex).toBe(0);
    card.focus();
    expect(document.activeElement).toBe(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    fireEvent.keyDown(card, { key: 'Enter', repeat: true });
    fireEvent.keyDown(card, { key: 'ArrowDown' });
    expect(openCases).toHaveBeenCalledTimes(2);
    fireEvent.click(card);
    expect(openCases).toHaveBeenCalledTimes(3);
});

test('informational cards do not become keyboard actions', () => {
    render(<ShowDataCard title="סיכום" numberText={16} />);
    expect(screen.queryByRole('button')).toBeNull();
});
