import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleInput from '../../simpleComponents/SimpleInput';
import React, { useState, useRef, useEffect } from 'react';
import HoverContainer from './HoverContainer';

import './SearchInput.scss';

const SearchInput = ({
    leftIcon,
    value,
    rightIcon,
    onSearch,
    tintColor,
    IconStyle,
    textStyle,
    queryResult,
    isPerforming,
    getButtonTextFunction,
    buttonPressFunction,
    emptyActionText,
    onEmptyAction,
    clearOnSelect,
    title,
    error,
    style: _style,
    className,
    ...props
}) => {

    const [query, setQuery] = useState(value);
    const [showResults, setShowResults] = useState(false);
    const [isOpening, setIsOpening] = useState(false);
    const targetRef = useRef(null);

    const hasDropdown =
        queryResult !== undefined ||
        isPerforming !== undefined ||
        Boolean(getButtonTextFunction) ||
        Boolean(buttonPressFunction) ||
        (Boolean(emptyActionText) && Boolean(onEmptyAction));

    useEffect(() => {
        setQuery(String(value ?? '').trimEnd());
    }, [value]);

    const handleInputChange = (event) => {
        setQuery(event.target.value);
        onSearch(event.target.value);
        if (hasDropdown) {
            setShowResults(true);
        }
    };

    const handleFocus = () => {
        if (!hasDropdown) return;

        setShowResults(true);
        setIsOpening(true);

        const q = String(query ?? '');
        onSearch?.(q.trim() ? q : '');
    };

    const handleBlur = (event) => {
        const nextFocusTarget = event?.relatedTarget;
        if (!nextFocusTarget || !targetRef.current?.contains(nextFocusTarget)) {
            setShowResults(false);
            setIsOpening(false);
        }
    };

    useEffect(() => {
        if (!hasDropdown || !showResults || !isOpening) return;

        if (isPerforming) {
            setIsOpening(false);
            return;
        }
        if (Array.isArray(queryResult) && queryResult.length > 0) {
            setIsOpening(false);
            return;
        }

        const id = setTimeout(() => setIsOpening(false), 250);
        return () => clearTimeout(id);
    }, [hasDropdown, showResults, isOpening, isPerforming, queryResult]);

    function hoverButtonPressed(text, result) {
        const cleanedText = String(text ?? '').trimEnd();
        buttonPressFunction?.(cleanedText, result);
        setShowResults(false);
        if (clearOnSelect) {
            setQuery('');
            onSearch?.('');
        } else {
            setQuery(cleanedText);
        }
    }

    return (
        <SimpleContainer className={['lw-searchInput', className].filter(Boolean).join(' ')}>
            <SimpleInput
                title={title}
                ref={targetRef}
                value={query}
                leftIcon={leftIcon}
                rightIcon={rightIcon}
                tintColor={tintColor}
                IconStyle={IconStyle}
                textStyle={textStyle}
                onChange={handleInputChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                error={error}
                {...props}
            />
            {hasDropdown && showResults && (
                <HoverContainer
                    targetRef={targetRef}
                    className="lw-searchInput__hover"
                    queryResult={queryResult}
                    isPerforming={Boolean(isPerforming) || isOpening}
                    getButtonTextFunction={getButtonTextFunction}
                    onPressButtonFunction={hoverButtonPressed}
                    query={query}
                    emptyActionText={emptyActionText}
                    onEmptyAction={onEmptyAction}
                    onClose={() => { setShowResults(false) }}

                />
            )}
        </SimpleContainer>
    );
};

export default SearchInput;
