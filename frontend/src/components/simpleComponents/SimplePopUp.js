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
        backgroundColor: 'rgba(45, 55, 72, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20000,
    },
    popupContainer: {
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        padding: '32px',
        width: '90%',
        maxWidth: '600px',
        maxHeight: '85vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: '1px solid rgba(226, 232, 240, 0.8)',
    },
};


export default SimplePopUp;
