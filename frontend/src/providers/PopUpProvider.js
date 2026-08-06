// PopUpProvider.js
import React, { createContext, useState, useContext, useRef } from 'react';
import SimplePopUp from '../components/simpleComponents/SimplePopUp';

const PopupContext = createContext();

export const PopupProvider = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [popupContent, setPopupContent] = useState(null);
    const [preventClose, setPreventClose] = useState(false);
    const clearContentTimerRef = useRef(null);

    const openPopup = (content, options) => {
        // Cancel a pending clear from closePopup() so chained open after close
        // (e.g. context menu → field settings) does not wipe the new content.
        if (clearContentTimerRef.current) {
            clearTimeout(clearContentTimerRef.current);
            clearContentTimerRef.current = null;
        }
        setPopupContent(content);
        setPreventClose(!!options?.preventClose);
        setIsOpen(true);
    };

    const closePopup = () => {
        setIsOpen(false);
        setPreventClose(false);
        // Delay clearing content so the exit animation can play
        if (clearContentTimerRef.current) {
            clearTimeout(clearContentTimerRef.current);
        }
        clearContentTimerRef.current = setTimeout(() => {
            setPopupContent(null);
            clearContentTimerRef.current = null;
        }, 300);
    };

    return (
        <PopupContext.Provider value={{ isOpen, openPopup, closePopup }}>
            {children}
            <SimplePopUp isOpen={isOpen} onClose={preventClose ? undefined : closePopup}>
                {popupContent}
            </SimplePopUp>
        </PopupContext.Provider>
    );
};

export const usePopup = () => useContext(PopupContext);
