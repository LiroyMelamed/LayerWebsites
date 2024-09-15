import React, { useEffect, useState, useRef } from 'react';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleLoader from '../../simpleComponents/SimpleLoader';
import { Text20 } from '../text/AllTextKindFile';
import SimpleButton from '../../simpleComponents/SimpleButton';

const HoverContainer = ({ queryResult = [], isPerforming, query, getButtonTextFunction, targetRef, style }) => {
    const [position, setPosition] = useState({ top: 0, left: 0, width: 320 });
    const hoverRef = useRef(null);

    useEffect(() => {
        const adjustPosition = () => {
            if (targetRef.current && hoverRef.current) {
                const targetRect = targetRef.current.getBoundingClientRect();
                const hoverWidth = targetRect.width;

                setPosition({
                    top: targetRect.bottom + window.scrollY + 4, // Align at the bottom
                    left: targetRect.left + window.scrollX, // Align horizontally
                    width: hoverWidth
                });
            }
        };

        adjustPosition(); // Initial adjustment
        window.addEventListener('resize', adjustPosition);
        window.addEventListener('scroll', adjustPosition);

        return () => {
            window.removeEventListener('resize', adjustPosition);
            window.removeEventListener('scroll', adjustPosition);
        };
    }, [targetRef, query]);

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
                maxHeight: '200px',
                overflowY: 'auto',
                position: 'absolute',
                zIndex: 1002,
            }}
        >
            {isPerforming ? (
                <SimpleLoader />
            ) : (
                queryResult?.length > 0 ? (
                    queryResult.map((result, index) => (
                        <SimpleButton
                            key={index}
                            style={{
                                padding: '12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #ddd',
                                width: '100%',
                            }}
                        >
                            <Text20>{getButtonTextFunction?.(result)}</Text20>
                        </SimpleButton>
                    ))
                ) : (
                    <Text20 style={{ padding: '12px', textAlign: 'center' }}>לא נמצאו תוצאות</Text20>
                )
            )}
        </SimpleContainer>
    );
};

export default HoverContainer;
