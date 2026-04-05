// SimplePopUp.js
import { useRef, useEffect, useState, isValidElement } from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleButton from './SimpleButton';

import './SimplePopUp.scss';

const SimplePopUp = ({ isOpen, children, onClose, className, ...props }) => {
    const popupRef = useRef(null);
    const [shouldRender, setShouldRender] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            // Trigger enter animation on next frame so the DOM is ready
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setIsVisible(true));
            });
        } else {
            setIsVisible(false);
        }
    }, [isOpen]);

    // Unmount after exit transition ends
    const handleTransitionEnd = (e) => {
        if (!isOpen && e.target === e.currentTarget) {
            setShouldRender(false);
        }
    };

    if (!shouldRender) return null;

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
            className={['lw-simplePopUp__overlay', isFloatingMenu ? 'lw-simplePopUp__overlay--transparent' : null, isVisible ? 'is-visible' : null]
                .filter(Boolean)
                .join(' ')}
            onClick={handleOverlayClick}
            onTransitionEnd={handleTransitionEnd}
        >
            <SimpleContainer
                ref={popupRef}
                className={[
                    'lw-simplePopUp__container',
                    className,
                    isFloatingMenu ? 'lw-simplePopUp__container--floating' : null,
                    isVisible ? 'is-visible' : null,
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
