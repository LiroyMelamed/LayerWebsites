import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SimpleInput from './SimpleInput';

test('a floating title names the OTP field while a validation error is announced separately', () => {
    const props = { title: 'קוד אימות', name: 'otp', type: 'tel', value: '', onChange: jest.fn(), timeToWaitInMilli: 0 };
    const { rerender } = render(<SimpleInput {...props} />);
    const field = screen.getByRole('textbox', { name: 'קוד אימות' });
    expect(field.getAttribute('aria-invalid')).toBe('false');
    rerender(<SimpleInput {...props} error="הקוד חייב להכיל שש ספרות" />);
    expect(screen.getByRole('textbox', { name: 'קוד אימות' })).toBe(field);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(field.getAttribute('aria-errormessage'))).toBe(screen.getByRole('alert'));
    expect(screen.getByRole('alert').textContent).toContain('שש ספרות');
    rerender(<SimpleInput {...props} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(field.getAttribute('aria-errormessage')).toBeNull();
});

test('an explicit field name is retained and typing still reaches the caller', () => {
    const change = jest.fn();
    render(<SimpleInput title="טלפון" aria-label="מספר טלפון ליצירת קשר" value="" onChange={change} timeToWaitInMilli={0} />);
    const field = screen.getByRole('textbox', { name: 'מספר טלפון ליצירת קשר' });
    fireEvent.change(field, { target: { value: '0501234567' } });
    fireEvent.blur(field);
    expect(change).toHaveBeenCalled();
    expect(change.mock.calls.at(-1)[0].target.value).toBe('0501234567');
});
