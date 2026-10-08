import React, { Children, forwardRef, isValidElement, useId, useRef, useState } from 'react';
import ChooseButton from '../../../components/styledComponents/buttons/ChooseButton';
import './signingSelect.scss';

function optionItems(children) {
    return Children.toArray(children).flatMap(child => {
        if (!isValidElement(child)) return [];
        if (child.type === React.Fragment || child.type === 'optgroup') return optionItems(child.props.children);
        if (child.type !== 'option') return [];
        return [{ value: String(child.props.value ?? child.props.children ?? ''), label: child.props.children,
            disabled: Boolean(child.props.disabled) }];
    });
}

// Preserve the feature's existing string-valued change contract, while using
// the platform's dropdown instead of the mobile browser's native picker.
const SigningSelect = forwardRef(({ children, value, defaultValue, onChange, id, name, dir, className = '', disabled, ...props }, ref) => {
    const generatedId = useId();
    const control = useRef(null);
    const setControl = node => {
        control.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
    };
    const controlId = id || `signing-choice-${generatedId}`;
    const listId = `${controlId}-choices`;
    const [localValue, setLocalValue] = useState(String(defaultValue ?? ''));
    const current = value !== undefined ? String(value ?? '') : localValue;
    const options = optionItems(children);
    // A native controlled select displays no value when its value is absent.
    // Keep that state rather than silently displaying a different business value.
    const items = options.some(item => item.value === current) ? options : [{ value: current, label: '', disabled: true }, ...options];
    return <span className={`lw-signingSelect ${className}`.trim()} dir={dir}>
        <ChooseButton items={items} showAll={false} defaultValue={current} controlledValue={current} controlRef={setControl}
            props={{ ...props, id: controlId, name, dir, disabled, type: 'button', role: 'combobox',
                'aria-haspopup': 'listbox', 'aria-controls': listId }}
            dropdownProps={{ id: listId, role: 'listbox', ariaLabelledBy: controlId, dir,
                keyboardNavigation: true, withinDialog: true, className: 'lw-signingSelect__choices',
                getOptionProps: item => ({ role: 'option', disabled: item.disabled, 'aria-selected': item.value === current }) }}
            OnPressChoiceFunction={next => {
                if (next === current || disabled || control.current?.matches(':disabled') || options.find(item => item.value === next)?.disabled) return;
                if (value === undefined) setLocalValue(next);
                const target = { value: next, id: controlId, name };
                onChange?.({ target, currentTarget: target, type: 'change' });
            }} />
    </span>;
});

export default SigningSelect;
