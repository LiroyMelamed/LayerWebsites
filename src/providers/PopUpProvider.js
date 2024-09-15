// PopUpProvider.js
import React, { createContext, useState, useContext } from 'react';
import SimplePopUp from '../components/simpleComponents/SimplePopUp';

const PopupContext = createContext();

export const PopupProvider = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [popupContent, setPopupContent] = useState(null);

    const openPopup = (content) => {
        setPopupContent(content);
        setIsOpen(true);
    };

    const closePopup = () => {
        setIsOpen(false);
        setPopupContent(null);
    };

    return (
        <PopupContext.Provider value={{ isOpen, openPopup, closePopup }}>
            {children}
            <SimplePopUp isOpen={isOpen} onClose={closePopup}>
                {popupContent}
            </SimplePopUp>
        </PopupContext.Provider>
    );
};

export const usePopup = () => useContext(PopupContext);
