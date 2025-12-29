import React, { forwardRef, useState } from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleIcon from './SimpleIcon';
import { colors } from '../../constant/colors';

import './SimpleTextArea.scss';

const SimpleTextArea = forwardRef(
    ({
        title,
        leftIcon,
        rightIcon,
        tintColor,
        IconStyle,
        textStyle,
        style,
        className,
        value,
        onChange,
        disabled = false,
        error = '',
        ...props
    }, ref) => {
        const [isFocused, setIsFocused] = useState(false);

        // Dynamic styles for text area
        function getBorderColor() {
            if (disabled) return colors.disabledHighlighted;
            if (error) return colors.error;
            return isFocused ? colors.primaryHighlighted : colors.secondaryHighlighted;
        }

        function getBackgroundColor() {
            return disabled ? colors.disabled : colors.white;
        }

        const containerCssVars = {
            '--lw-simpleTextArea-borderColor': getBorderColor(),
            '--lw-simpleTextArea-bgColor': getBackgroundColor(),
            '--lw-simpleTextArea-shadow': isFocused ? '0 0 0.25rem rgba(0, 0, 0, 0.2)' : 'none',

            '--lw-simpleTextArea-labelTransform': isFocused || value ? 'translateY(-1.25rem) scale(0.8)' : 'translateY(0.625rem) scale(1)',
            '--lw-simpleTextArea-labelOpacity': isFocused || value ? 1 : 0.6,
            '--lw-simpleTextArea-labelColor': error ? colors.error : colors.primaryHighlighted,
        };

        const mergedContainerStyle = style ? { ...containerCssVars, ...style } : containerCssVars;

        return (
            <SimpleContainer
                ref={ref}
                className={['lw-simpleTextArea', className].filter(Boolean).join(' ')}
                style={mergedContainerStyle}
            >
                {/* Floating Label */}
                {title && (
                    <span className="lw-simpleTextArea__label">
                        {title}
                    </span>
                )}

                {rightIcon && (
                    <div className="lw-simpleTextArea__icon lw-simpleTextArea__icon--right">
                        <SimpleIcon
                            tintColor={tintColor || getBorderColor()}
                            src={rightIcon}
                            style={IconStyle}
                        />
                    </div>
                )}

                <textarea
                    className="lw-simpleTextArea__field"
                    style={textStyle}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    disabled={disabled}
                    {...props}
                />

                {leftIcon && (
                    <div className="lw-simpleTextArea__icon lw-simpleTextArea__icon--left">
                        <SimpleIcon
                            tintColor={tintColor || getBorderColor()}
                            src={leftIcon}
                            style={IconStyle}
                        />
                    </div>
                )}
            </SimpleContainer>
        );
    }
);

export default SimpleTextArea;
