// SimplePopUp.js
import React, { useRef } from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleScrollView from './SimpleScrollView';

const SimplePopUp = ({ isOpen, children, style, onClose, ...props }) => {
    const popupRef = useRef(null); // Ref to keep track of the popup container

    if (!isOpen) return null; // Don't render if not open

    // Handle click outside the popup container
    const handleOverlayClick = (e) => {
        if (popupRef.current && !popupRef.current.contains(e.target)) {
            onClose(); // Close the popup
        }
    };

    return (
        <SimpleContainer style={styles.overlay} onClick={handleOverlayClick}>
            <SimpleContainer ref={popupRef} style={{ ...styles.popupContainer, ...style }} {...props}>
                <SimpleScrollView style={styles.scrollView}>
                    {children}
                </SimpleScrollView>
            </SimpleContainer>
        </SimpleContainer>
    );
};

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)', // Light transparent gray
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000, // High z-index to be on top of everything
    },
    popupContainer: {
        backgroundColor: '#f8f8f8', // Light background to match your other components
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)', // Soft shadow
        padding: '20px',
        minWidth: '200px',
        maxWidth: '90%',
        minHeight: '200px',
        maxHeight: '80vh', // Set max height to fit within viewport
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollView: {
        width: '100%',
        height: '100%',
        overflowY: 'auto', // Add vertical scroll
    },
};

export default SimplePopUp;
