// SimplePopUp.js
import { useRef } from 'react';
import SimpleContainer from './SimpleContainer';
import ImageButton from '../specializedComponents/buttons/ImageButton';
import { icons } from '../../assets/icons/icons';

import './SimplePopUp.scss';

const SimplePopUp = ({ isOpen, children, style, onClose, className, ...props }) => {
    const popupRef = useRef(null); // Ref to keep track of the popup container

    if (!isOpen) return null; // Don't render if not open

    // Handle click outside the popup container
    const handleOverlayClick = (e) => {
        if (popupRef.current && !popupRef.current.contains(e.target)) {
            // onClose(); // Close the popup
        }
    };

    return (
        <SimpleContainer className="lw-simplePopUp__overlay" onClick={handleOverlayClick}>
            <SimpleContainer
                ref={popupRef}
                className={['lw-simplePopUp__container', className].filter(Boolean).join(' ')}
                style={style}
                {...props}
            >
                <ImageButton
                    height={12}
                    width={12}
                    onPress={onClose}
                    className="lw-simplePopUp__close"
                    src={icons.Button.X}
                />
                <SimpleContainer className="lw-simplePopUp__content">
                    {children}
                </SimpleContainer>
            </SimpleContainer>
        </SimpleContainer>
    );
};

export default SimplePopUp;
