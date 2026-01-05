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
    title,
    error,
    style: _style,
    className,
    ...props
}) => {

    const [query, setQuery] = useState(value);
    const [showResults, setShowResults] = useState(false);
    const targetRef = useRef(null);

    useEffect(() => { setQuery(value) }, [value])

    const handleInputChange = (event) => {
        setQuery(event.target.value);
        onSearch(event.target.value);
        setShowResults(true);
    };

    const handleFocus = () => {
        if (query) {
            setShowResults(true);
        }
    };

    const handleBlur = (event) => {
        const nextFocusTarget = event?.relatedTarget;
        if (!nextFocusTarget || !targetRef.current?.contains(nextFocusTarget)) {
            setShowResults(false);
        }
    };

    function hoverButtonPressed(text, result) {
        buttonPressFunction?.(text, result);
        setShowResults(false)
        setQuery(text);
    }

    return (
        <SimpleContainer className={['lw-searchInput', className].filter(Boolean).join(' ')}>
            <SimpleInput
                title={title}
                ref={targetRef}
                value={query} // Add the value prop here
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
            {showResults && (
                <HoverContainer
                    targetRef={targetRef}
                    className="lw-searchInput__hover"
                    queryResult={queryResult}
                    isPerforming={isPerforming}
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
