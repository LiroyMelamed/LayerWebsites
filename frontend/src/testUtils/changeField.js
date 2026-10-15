import { fireEvent, within } from '@testing-library/react';

export function openChoices(control) {
    if (control.getAttribute('aria-expanded') !== 'true') fireEvent.click(control);
    return within(document.getElementById(control.getAttribute('aria-controls')));
}

// Exercise the platform picker through its visible list, while ordinary inputs
// retain their native change event. Never call a component handler directly.
export function changeField(control, event) {
    if (control.tagName === 'BUTTON' && control.getAttribute('role') === 'combobox') {
        const option = openChoices(control).getAllByRole('option').find(item => item.value === String(event.target.value));
        if (!option) throw new Error(`Picker option ${event.target.value} is unavailable`);
        fireEvent.pointerDown(option);
        return;
    }
    fireEvent.change(control, event);
}
