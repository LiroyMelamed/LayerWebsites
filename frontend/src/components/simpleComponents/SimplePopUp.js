// SimplePopUp.js
import { useRef, useEffect, useState, isValidElement, useCallback } from 'react';
import { createPortal } from 'react-dom';
import SimpleContainer from './SimpleContainer';
import SimpleButton from './SimpleButton';

import './SimplePopUp.scss';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled]):not([tabindex="-1"])',
    'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
    'select:not([disabled]):not([tabindex="-1"])',
    'textarea:not([disabled]):not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

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

    // Keep Tab/Shift+Tab inside the modal so focus can't escape to the page behind
    // (e.g. FullCalendar), which makes typing appear broken after Tab.
    const handleKeyDown = useCallback((e) => {
        if (e.key !== 'Tab' || !popupRef.current) return;
        const focusables = Array.from(popupRef.current.querySelectorAll(FOCUSABLE_SELECTOR))
            .filter((el) => {
                if (el.getAttribute('aria-hidden') === 'true') return false;
                const style = window.getComputedStyle(el);
                return style.visibility !== 'hidden' && style.display !== 'none';
            });
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
            if (active === first || !popupRef.current.contains(active)) {
                e.preventDefault();
                last.focus();
            }
        } else if (active === last || !popupRef.current.contains(active)) {
            e.preventDefault();
            first.focus();
        }
    }, []);

    useEffect(() => {
        if (!isOpen || !shouldRender) return undefined;
        document.addEventListener('keydown', handleKeyDown, true);
        return () => document.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen, shouldRender, handleKeyDown]);

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

    // Portal the overlay to document.body so it shares the same stacking context
    // as other portals (e.g. HoverContainer). This prevents backdrop-filter
    // compositing from hiding fixed-position elements that have a higher z-index.
    return createPortal(
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
                        tabIndex={-1}
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
        </SimpleContainer>,
        document.body
    );
};

export default SimplePopUp;
