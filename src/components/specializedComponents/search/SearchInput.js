import React, { useState, useRef } from 'react';
import SimpleInput from '../../simpleComponents/SimpleInput';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import HoverContainer from '../containers/HoverContainer';
import { useScreenSize } from '../../../providers/ScreenSizeProvider';

const SearchInput = ({ leftIcon, rightIcon, onSearch, tintColor, IconStyle, textStyle, style, ...props }) => {
    const [query, setQuery] = useState('');
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

    const containerStyle = {
        width: '100%',
        ...style
    }

    return (
        <SimpleContainer style={containerStyle}>
            <SimpleInput
                ref={targetRef}
                leftIcon={leftIcon}
                rightIcon={rightIcon}
                tintColor={tintColor}
                IconStyle={IconStyle}
                textStyle={textStyle}
                onChange={handleInputChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                {...props}
            />
            {showResults && (
                <HoverContainer
                    query={query}
                    targetRef={targetRef}
                    style={{
                        position: 'absolute',
                        width: '100%', // Align with input
                        zIndex: 1000,
                    }}
                />
            )}
        </SimpleContainer>
    );
};

export default SearchInput;
