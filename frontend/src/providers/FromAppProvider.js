import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const FromAppContext = createContext(null);

export const useFromApp = () => {
    const context = useContext(FromAppContext);
    if (context === null) {
        throw new Error('useFromApp must be used within a FromAppProvider');
    }
    return context;
};

export const FromAppProvider = ({ children }) => {
    const [isFromApp, setIsFromApp] = useState(false);
    const location = useLocation();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const fromAppParam = params.get('fromApp');
        if (fromAppParam === 'true') {
            setIsFromApp(true);
        } else {
            setIsFromApp(false);
        }
    }, [location.search]);

    const value = {
        isFromApp,
    };

    return (
        <FromAppContext.Provider value={value}>
            {children}
        </FromAppContext.Provider>
    );
};