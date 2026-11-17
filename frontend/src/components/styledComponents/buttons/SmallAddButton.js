import React from 'react';
import './SmallAddButton.scss';

// Shared compact add control, originally used beside the case client field.
export default function SmallAddButton({ label, onPress, className = '', ...props }) {
    return <button type="button" className={`lw-smallAddButton ${className}`} title={label} aria-label={label} onClick={onPress} {...props}>+</button>;
}
