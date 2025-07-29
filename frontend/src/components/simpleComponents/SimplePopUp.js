// SimplePopUp.js
import { useRef } from 'react';
import SimpleContainer from './SimpleContainer';
import ImageButton from '../specializedComponents/buttons/ImageButton';
import { icons } from '../../assets/icons/icons';

const SimplePopUp = ({ isOpen, children, style, onClose, ...props }) => {
    const popupRef = useRef(null); // Ref to keep track of the popup container

    if (!isOpen) return null; // Don't render if not open

    // Handle click outside the popup container
    const handleOverlayClick = (e) => {
        if (popupRef.current && !popupRef.current.contains(e.target)) {
            // onClose(); // Close the popup
        }
    };

    return (
        <SimpleContainer style={styles.overlay} onClick={handleOverlayClick}>
            <SimpleContainer ref={popupRef} style={{ ...styles.popupContainer, ...style }} {...props}>
                <ImageButton
                    height={12}
                    width={12}
                    onPress={onClose}
                    style={{ alignSelf: 'flex-start', marginBottom: 8 }}
                    src={icons.Button.X}
                />
                {children}
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
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20000,
    },
    popupContainer: {
        backgroundColor: '#f8f8f8',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        padding: '20px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto', // Scroll when needed
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
};


export default SimplePopUp;
