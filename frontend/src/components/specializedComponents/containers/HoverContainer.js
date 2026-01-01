import React, { useEffect, useState, useRef } from 'react';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleLoader from '../../simpleComponents/SimpleLoader';
import { Text20 } from '../text/AllTextKindFile';
import SimpleButton from '../../simpleComponents/SimpleButton';
import SimpleScrollView from '../../simpleComponents/SimpleScrollView';

import './HoverContainer.scss';

const HoverContainer = ({
    queryResult = [],
    isPerforming,
    getButtonTextFunction,
    onPressButtonFunction,
    query,
    emptyActionText,
    onEmptyAction,
    targetRef,
    onClose,
    style,
    className,
}) => {
    const [position, setPosition] = useState({ top: 0, inlineStart: 0 });
    const hoverRef = useRef(null);

    useEffect(() => {
        const adjustPosition = () => {
            if (targetRef.current && hoverRef.current) {
                const targetRect = targetRef.current.getBoundingClientRect();
                const hoverRect = hoverRef.current.getBoundingClientRect();

                const direction = window.getComputedStyle(document.documentElement).direction;
                const isRtl = direction === 'rtl';

                const physicalLeft = targetRect.left + targetRect.width / 2 - hoverRect.width / 2 + window.scrollX;
                const viewportWidth = window.innerWidth;

                const inlineStart = isRtl
                    ? Math.max(0, viewportWidth - physicalLeft - hoverRect.width)
                    : Math.max(0, physicalLeft);

                setPosition({
                    top: targetRect.bottom + window.scrollY + 4,
                    inlineStart,
                });
            }
        };

        const handleClickOutside = (event) => {
            if (hoverRef.current && !hoverRef.current.contains(event.target)) {
                onClose();
            }
        };

        adjustPosition();
        window.addEventListener('resize', adjustPosition);
        window.addEventListener('scroll', adjustPosition);
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            window.removeEventListener('resize', adjustPosition);
            window.removeEventListener('scroll', adjustPosition);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [targetRef, onClose]);

    const cssVars = {
        '--lw-hoverContainer-top': `${position.top}px`,
        '--lw-hoverContainer-inlineStart': `${position.inlineStart}px`,
    };

    const mergedStyle = style ? { ...cssVars, ...style } : cssVars;

    return (
        <SimpleContainer
            ref={hoverRef}
            className={['lw-hoverContainer', className].filter(Boolean).join(' ')}
            style={mergedStyle}
        >
            <SimpleScrollView className="lw-hoverContainer__scroll">
                {isPerforming ? (
                    <SimpleContainer className="lw-hoverContainer__loading">
                        <SimpleLoader />
                    </SimpleContainer>
                ) : (
                    queryResult?.length > 0 ? (
                        <SimpleContainer className="lw-hoverContainer__list">
                            {queryResult.map((result, index) => (
                                <SimpleButton
                                    key={`choiceNumber${index}`}
                                    className="lw-hoverContainer__option"
                                    onPressIn={(e) => {
                                        // Keep input focused so SearchInput's onBlur doesn't
                                        // close the results before the click handler runs.
                                        e.preventDefault();
                                    }}
                                    onPress={() => onPressButtonFunction(getButtonTextFunction?.(result), result)}
                                >
                                    <Text20>{getButtonTextFunction?.(result)}</Text20>
                                </SimpleButton>

                            ))}
                        </SimpleContainer>
                    ) : (
                        (query?.trim?.() && emptyActionText && onEmptyAction) ? (
                            <SimpleContainer className="lw-hoverContainer__list">
                                <SimpleButton
                                    className="lw-hoverContainer__option"
                                    onPressIn={(e) => {
                                        // Keep input focused so SearchInput's onBlur doesn't
                                        // close the results before the click handler runs.
                                        e.preventDefault();
                                    }}
                                    onPress={() => {
                                        onEmptyAction(query);
                                        onClose?.();
                                    }}
                                >
                                    <Text20>{emptyActionText}</Text20>
                                </SimpleButton>
                            </SimpleContainer>
                        ) : (
                            <SimpleContainer className="lw-hoverContainer__noResults">
                                <Text20>לא נמצאו תוצאות</Text20>
                            </SimpleContainer>
                        )
                    )
                )}
            </SimpleScrollView>
        </SimpleContainer>
    );
};

export default HoverContainer;
