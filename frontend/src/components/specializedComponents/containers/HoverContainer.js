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
    style: _style,
    className,
}) => {
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const hoverRef = useRef(null);

    useEffect(() => {
        const adjustPosition = () => {
            if (targetRef.current && hoverRef.current) {
                const targetRect = targetRef.current.getBoundingClientRect();
                const hoverRect = hoverRef.current.getBoundingClientRect();

                const viewportWidth = window.innerWidth;

                // Use viewport-relative coordinates (pairs with `position: fixed`).
                const desiredLeft = targetRect.left + targetRect.width / 2 - hoverRect.width / 2;
                const margin = 8;
                const left = Math.max(margin, Math.min(desiredLeft, viewportWidth - hoverRect.width - margin));

                setPosition({
                    top: targetRect.bottom + 4,
                    left,
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
        // Capture scroll events from scrollable parents (e.g., popups/modals).
        window.addEventListener('scroll', adjustPosition, true);
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            window.removeEventListener('resize', adjustPosition);
            window.removeEventListener('scroll', adjustPosition, true);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [targetRef, onClose]);

    useEffect(() => {
        if (!hoverRef.current) return;

        // runtime dynamic: positioned relative to the target element
        hoverRef.current.style.setProperty('--lw-hoverContainer-top', `${position.top}px`);
        hoverRef.current.style.setProperty('--lw-hoverContainer-left', `${position.left}px`);
    }, [position]);

    return (
        <SimpleContainer
            ref={hoverRef}
            className={['lw-hoverContainer', className].filter(Boolean).join(' ')}
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

                                        e.preventDefault();
                                    }}
                                    onPress={() => onPressButtonFunction(getButtonTextFunction?.(result), result)}
                                >
                                    <Text20 className="lw-hoverContainer__optionText">{getButtonTextFunction?.(result)}</Text20>
                                </SimpleButton>

                            ))}
                        </SimpleContainer>
                    ) : (
                        (query?.trim?.() && emptyActionText && onEmptyAction) ? (
                            <SimpleContainer className="lw-hoverContainer__list">
                                <SimpleButton
                                    className="lw-hoverContainer__option"
                                    onPressIn={(e) => {
                                        e.preventDefault();
                                    }}
                                    onPress={() => {
                                        onEmptyAction(query);
                                        onClose?.();
                                    }}
                                >
                                    <Text20 className="lw-hoverContainer__optionText">{emptyActionText}</Text20>
                                </SimpleButton>
                            </SimpleContainer>
                        ) : (
                            <SimpleContainer className="lw-hoverContainer__noResults">
                                <Text20 className="lw-hoverContainer__optionText">לא נמצאו תוצאות</Text20>
                            </SimpleContainer>
                        )
                    )
                )}
            </SimpleScrollView>
        </SimpleContainer>
    );
};

export default HoverContainer;
