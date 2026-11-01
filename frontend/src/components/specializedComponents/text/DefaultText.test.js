import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DefaultText from './DefaultText';

for (const count of [1, 2, 3]) test(`numberOfLines=${count} activates the promised text clamp`, () => {
    render(<DefaultText numberOfLines={count} size={14}>Long text</DefaultText>);
    const text = screen.getByText('Long text');
    expect(text.style.display).toBe('-webkit-box');
    expect(String(text.style.WebkitLineClamp)).toBe(String(count));
    expect(text.style.overflow).toBe('hidden');
});

for (const count of [undefined, null, 0, -1]) test(`line count ${count} does not clamp ordinary text`, () => {
    render(<DefaultText numberOfLines={count}>Ordinary text</DefaultText>);
    expect(screen.getByText('Ordinary text').style.display).toBe('');
});

test('explicit clamping keeps caller styles, behavior and accessibility props', () => {
    const pressed = jest.fn();
    render(<DefaultText shouldApplyClamping numberOfLines={2} size={16} style={{ color: 'red', marginTop: 4 }}
        aria-label="Document title" onClick={pressed}>Accessible text</DefaultText>);
    const text = screen.getByLabelText('Document title');
    expect(text).toHaveStyle({ color: 'red', marginTop: '4px', overflow: 'hidden' });
    fireEvent.click(text);
    expect(pressed).toHaveBeenCalledTimes(1);
});

test('zero-valued content is retained without requiring a clamp', () => {
    render(<DefaultText>{0}</DefaultText>);
    expect(screen.getByText('0')).toBeInTheDocument();
});
