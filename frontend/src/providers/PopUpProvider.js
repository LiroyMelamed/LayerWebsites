// PopUpProvider.js
import React, { createContext, useState, useContext } from 'react';
import SimplePopUp from '../components/simpleComponents/SimplePopUp';

const PopupContext = createContext();

export const PopupProvider = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [popupContent, setPopupContent] = useState(null);
    const [preventClose, setPreventClose] = useState(false);

    const openPopup = (content, options) => {
        setPopupContent(content);
        setPreventClose(!!options?.preventClose);
        setIsOpen(true);
    };

    const closePopup = () => {
        setIsOpen(false);
        setPreventClose(false);
        // Delay clearing content so the exit animation can play
        setTimeout(() => setPopupContent(null), 300);
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
