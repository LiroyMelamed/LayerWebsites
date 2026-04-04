// SimplePopUp.js
import { useRef, isValidElement } from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleButton from './SimpleButton';

import './SimplePopUp.scss';

const SimplePopUp = ({ isOpen, children, onClose, className, ...props }) => {
    const popupRef = useRef(null); // Ref to keep track of the popup container

    if (!isOpen) return null; // Don't render if not open

    // Handle click outside the popup container
    const handleOverlayClick = (e) => {
        if (popupRef.current && !popupRef.current.contains(e.target)) {
            // onClose(); // Close the popup
        }
    };

    const contentClassName = isValidElement(children) ? children.props?.className : '';
    const isFloatingMenu = typeof contentClassName === 'string' && contentClassName.includes('lw-fieldContextMenu--floating');

    return (
        <SimpleContainer
            className={['lw-simplePopUp__overlay', isFloatingMenu ? 'lw-simplePopUp__overlay--transparent' : null]
                .filter(Boolean)
                .join(' ')}
            onClick={handleOverlayClick}
        >
            <SimpleContainer
                ref={popupRef}
                className={[
                    'lw-simplePopUp__container',
                    className,
                    isFloatingMenu ? 'lw-simplePopUp__container--floating' : null,
                ]
                    .filter(Boolean)
                    .join(' ')}
                {...props}
            >
                {!isFloatingMenu && onClose && (
                    <SimpleButton
                        onPress={onClose}
                        className="lw-simplePopUp__close"
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </SimpleButton>
                )}
                {isFloatingMenu ? children : (
                    <SimpleContainer className="lw-simplePopUp__content">
                        {children}
                    </SimpleContainer>
                )}
            </SimpleContainer>
        </SimpleContainer>
    );
};

export default SimplePopUp;
