import React, { useEffect, useState, useRef } from 'react';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleLoader from '../../simpleComponents/SimpleLoader';
import { Text20 } from '../text/AllTextKindFile';
import SimpleButton from '../../simpleComponents/SimpleButton';
import SimpleScrollView from '../../simpleComponents/SimpleScrollView';

const HoverContainer = ({ queryResult = [], isPerforming, getButtonTextFunction, onPressButtonFunction, targetRef, onClose, style }) => {
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const hoverRef = useRef(null);

    useEffect(() => {
        const adjustPosition = () => {
            if (targetRef.current && hoverRef.current) {
                const targetRect = targetRef.current.getBoundingClientRect();
                const hoverRect = hoverRef.current.getBoundingClientRect();

                setPosition({
                    top: targetRect.bottom + window.scrollY + 4, // Align at the bottom
                    left: targetRect.left + targetRect.width / 2 - hoverRect.width / 2 + window.scrollX, // Align horizontally
                });
            }
        };

        const handleClickOutside = (event) => {
            if (hoverRef.current && !hoverRef.current.contains(event.target)) {
                onClose(); // Call onClose when clicking outside
            }
        };

        adjustPosition(); // Initial adjustment
        window.addEventListener('resize', adjustPosition);
        window.addEventListener('scroll', adjustPosition);
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            window.removeEventListener('resize', adjustPosition);
            window.removeEventListener('scroll', adjustPosition);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [targetRef, onClose]);

    return (
        <SimpleContainer
            ref={hoverRef}
            style={{
                ...style,
                ...position,
                border: '1px solid #ddd',
                backgroundColor: '#fff',
                borderRadius: '25px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                position: 'absolute',
                minWidth: 120,
                maxHeight: "400px", // Ensure maxHeight is set on the container
                overflow: 'hidden', // Hide overflow for cleaner edges
                zIndex: 1002,
            }}
        >
            <SimpleScrollView style={{ maxHeight: "400px" }}> {/* Set maxHeight and enable scrolling */}
                {isPerforming ? (
                    <SimpleLoader />
                ) : (
                    queryResult?.length > 0 ? (
                        <SimpleContainer style={{ display: 'flex', flexDirection: 'column' }}>
                            {queryResult.map((result, index) => (
                                <SimpleButton
                                    key={index}
                                    style={{
                                        padding: '12px',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #ddd',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    onPress={() => onPressButtonFunction(getButtonTextFunction?.(result))}
                                >
                                    <Text20>{getButtonTextFunction?.(result)}</Text20>
                                </SimpleButton>
                            ))}
                        </SimpleContainer>
                    ) : (
                        <Text20 style={{ padding: '12px', textAlign: 'center' }}>לא נמצאו תוצאות</Text20>
                    )
                )}
            </SimpleScrollView>
        </SimpleContainer>
    );
};

export default HoverContainer;
