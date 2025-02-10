import React, { useState, useRef } from 'react';
import SimpleInput from '../../simpleComponents/SimpleInput';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import HoverContainer from './HoverContainer';
import { useScreenSize } from '../../../providers/ScreenSizeProvider';

const SearchInput = ({ leftIcon, value, rightIcon, onSearch, tintColor, IconStyle, textStyle, queryResult, isPerforming, getButtonTextFunction, buttonPressFunction, title, style, ...props }) => {
    const [query, setQuery] = useState(value);
    const [showResults, setShowResults] = useState(false);
    const targetRef = useRef(null);

    const handleInputChange = (event) => {
        setQuery(event.target.value);
        onSearch(event.target.value); // Trigger search
        setShowResults(true); // Show results
    };

    const handleFocus = () => {
        if (query) {
            setShowResults(true);
        }
    };

    const handleBlur = (event) => {
        if (!event.relatedTarget || !targetRef.current.contains(event.relatedTarget)) {
            setShowResults(false);
        }
    };

    function hoverButtonPressed(text, result) {
        buttonPressFunction?.(text, result);
        setShowResults(false)
        setQuery(text);
    }

    return (
        <SimpleContainer style={style}>
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
                // onBlur={handleBlur}
                {...props}
            />
            {showResults && (
                <HoverContainer
                    targetRef={targetRef}
                    style={{
                        position: 'absolute',
                        zIndex: 1005,
                    }}
                    queryResult={queryResult}
                    getButtonTextFunction={getButtonTextFunction}
                    onPressButtonFunction={hoverButtonPressed}
                    onClose={() => { setShowResults(false) }}

                />
            )}
        </SimpleContainer>
    );
};

export default SearchInput;
