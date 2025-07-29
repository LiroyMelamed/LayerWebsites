import { createContext, useContext, useState } from 'react';

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

    const value = {
        isFromApp,
        setIsFromApp
    };

    return (
        <FromAppContext.Provider value={value}>
            {children}
        </FromAppContext.Provider>
    );
};