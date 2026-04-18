import React, { useLayoutEffect, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleLoader from '../../simpleComponents/SimpleLoader';
import { Text20 } from '../text/AllTextKindFile';
import SimpleButton from '../../simpleComponents/SimpleButton';
import SimpleScrollView from '../../simpleComponents/SimpleScrollView';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation();
    const hoverRef = useRef(null);

    // useLayoutEffect: runs after DOM commit but BEFORE browser paint.
    // This guarantees hoverRef.current is set and getBoundingClientRect() is valid,
    // and positions the element before the first visible frame (no flash at 0,0).
    useLayoutEffect(() => {
        const el = hoverRef.current;
        if (!el) return;

        const adjustPosition = () => {
            const target = targetRef?.current;
            const hover = hoverRef.current;
            if (!target || !hover) return;

            const targetRect = target.getBoundingClientRect();
            const hoverRect = hover.getBoundingClientRect();
            const viewportWidth = window.innerWidth;

            const desiredLeft = targetRect.left + targetRect.width / 2 - hoverRect.width / 2;
            const margin = 8;
            const left = Math.max(margin, Math.min(desiredLeft, viewportWidth - hoverRect.width - margin));

            hover.style.top = `${targetRect.bottom + 4}px`;
            hover.style.left = `${left}px`;
        };

        adjustPosition();

        window.addEventListener('resize', adjustPosition);
        // Capture scroll from scrollable parents (e.g. inside a popup)
        window.addEventListener('scroll', adjustPosition, true);

        return () => {
            window.removeEventListener('resize', adjustPosition);
            window.removeEventListener('scroll', adjustPosition, true);
        };
    }, [targetRef]);

    // Separate effect for click-outside so it doesn't re-run just because onClose changes reference
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (hoverRef.current && !hoverRef.current.contains(event.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return createPortal(
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
                                <Text20 className="lw-hoverContainer__optionText">{t('common.noResultsFound')}</Text20>
                            </SimpleContainer>
                        )
                    )
                )}
            </SimpleScrollView>
        </SimpleContainer>,
        document.body
    );
};

export default HoverContainer;
