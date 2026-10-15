import React, { forwardRef } from 'react';
import SimpleContainer from './SimpleContainer';
import { colors } from '../../constant/colors';

import './SimpleCheckbox.scss';

const SimpleCheckbox = forwardRef(
    ({
        title,
        className,
        style,
        checked = false,
        onChange,
        disabled = false,
        error,
        checkboxSize = 'Medium',
        variant = 'checkbox', // 'checkbox' | 'toggle'
        children,
        ...props
    }, ref) => {

        function getBorderColor() {
            if (disabled) return colors.disabledHighlighted;
            if (error) return colors.error;
            return checked ? colors.primaryHighlighted : colors.secondaryHighlighted;
        }

        const handleChange = (e) => {
            if (!disabled) {
                onChange?.(e);
            }
        };

        const sizeKey = String(checkboxSize || 'Medium').toLowerCase();
        const sizeClass =
            sizeKey === 'small'
                ? 'lw-simpleCheckbox--small'
                : sizeKey === 'big'
                    ? 'lw-simpleCheckbox--big'
                    : 'lw-simpleCheckbox--medium';

        const resolvedClassName = [
            'lw-simpleCheckbox',
            sizeClass,
            variant === 'toggle' ? 'lw-simpleCheckbox--toggle' : '',
            checked ? 'is-checked' : '',
            error ? 'has-error' : '',
            disabled ? 'is-disabled' : '',
            className,
        ]
            .filter(Boolean)
            .join(' ');

        return (
            <SimpleContainer
                ref={ref}
                className={resolvedClassName}
                style={style}
            >
                <label className="lw-simpleCheckbox__label">
                    <input
                        type="checkbox"
                        className={`lw-simpleCheckbox__input ${variant === 'toggle' ? 'lw-simpleCheckbox__input--toggle' : ''}`}
                        checked={checked}
                        onChange={handleChange}
                        disabled={disabled}
                        {...props}
                    />
                    {(title || children) && (
                        <span className="lw-simpleCheckbox__text">
                            {title || children}
                        </span>
                    )}
                </label>
                {error && typeof error === 'string' && (
                    <span className="lw-simpleCheckbox__error">{error}</span>
                )}
            </SimpleContainer>
        );
    }
);

export default SimpleCheckbox;

export const checkboxSizes = {
    SMALL: "Small",
    MEDIUM: "Medium",
    BIG: "Big",
};
