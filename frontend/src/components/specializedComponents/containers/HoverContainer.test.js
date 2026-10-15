import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import HoverContainer from './HoverContainer';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));

test('search suggestions select once by pointer and are also operable by keyboard activation', () => {
    const person = { name: 'Synthetic suggestion' }, select = jest.fn();
    render(<HoverContainer usePortal={false} queryResult={[person]} isPerforming={false}
        getButtonTextFunction={item => item.name} onPressButtonFunction={select} />);
    const option = screen.getByRole('button', { name: 'Synthetic suggestion' });
    fireEvent.pointerDown(option);
    fireEvent.click(option, { detail: 1 });
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenLastCalledWith(person.name, person);
    select.mockClear();
    // Native button activation by Enter/Space or assistive technology has detail=0.
    fireEvent.click(option, { detail: 0 });
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenLastCalledWith(person.name, person);
});
