import React, { useEffect, useState, useRef } from 'react';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleLoader from '../../simpleComponents/SimpleLoader';
import { Text20 } from '../text/AllTextKindFile';
import SimpleButton from '../../simpleComponents/SimpleButton';

const HoverContainer = ({ queryResult = [], query, targetRef, style }) => {
    const [position, setPosition] = useState({ top: 0, left: 0, width: 320 });
    const hoverRef = useRef(null);

    useEffect(() => {
        const adjustPosition = () => {
            if (targetRef.current && hoverRef.current) {
                const targetRect = targetRef.current.getBoundingClientRect();
                const hoverRect = hoverRef.current.getBoundingClientRect();
                const windowHeight = window.innerHeight;

                const spaceBelow = windowHeight - targetRect.bottom;
                const spaceAbove = targetRect.top;

                // Ensure the width of the hover container matches the target
                const hoverWidth = targetRect.width;

                if (spaceBelow >= spaceAbove) {
                    // Enough space below the target element
                    setPosition({
                        top: targetRect.bottom + window.scrollY + 4, // Position the top of hover container at the bottom of the target
                        left: targetRect.left + window.scrollX, // Align horizontally with the target
                        width: hoverWidth
                    });
                } else {
                    // Enough space above the target element
                    setPosition({
                        top: targetRect.top - hoverRect.height - 4 + window.scrollY, // Position the bottom of hover container at the top of the target
                        left: targetRect.left + window.scrollX, // Align horizontally with the target
                        width: hoverWidth
                    });
                }
            }
        };

        adjustPosition(); // Initial adjustment
        window.addEventListener('resize', adjustPosition); // Adjust on window resize
        window.addEventListener('scroll', adjustPosition); // Adjust on scroll

        return () => {
            window.removeEventListener('resize', adjustPosition); // Clean up on unmount
            window.removeEventListener('scroll', adjustPosition); // Clean up on unmount
        };
    }, [targetRef, query]);

    // Simulated search results based on the query
    const results = ["Option1", "Option1", "Option1", "Option1", "Option2"].filter(result =>
        result.toLowerCase().includes(query.toLowerCase())
    );

    return (
        <SimpleContainer
            ref={hoverRef}
            style={{
                ...style,
                top: position.top,
                left: position.left,
                width: position.width,
                border: '1px solid #ddd',
                backgroundColor: '#fff',
                borderRadius: '25px', // Match the rounded corners of the input
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)', // Match the shadow of the input
                maxHeight: '200px',
                overflowY: 'auto',
                position: 'fixed', // Keep it fixed relative to the viewport
                zIndex: 1002,
            }}
        >
            {results.length > 0 ? (
                results.map((result, index) => (
                    <SimpleButton
                        key={index}
                        style={{
                            padding: '12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #ddd',
                            width: '100%', // Ensure buttons take full width
                        }}
                    >
                        <Text20>
                            {result}
                        </Text20>
                    </SimpleButton>
                ))
            ) : (
                <Text20 style={{ padding: '12px', textAlign: 'center' }}>לא נמצאו תוצאות</Text20>
            )}
        </SimpleContainer>
    );
};

export default HoverContainer;
