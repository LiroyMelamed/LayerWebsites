import { createContext, useContext, useState, useCallback } from 'react';

const FromAppContext = createContext(null);

export const useFromApp = () => {
    const context = useContext(FromAppContext);
    if (context === null) {
        throw new Error('useFromApp must be used within a FromAppProvider');
    }
    return context;
};

// Check once at startup so the flag survives SPA navigations that strip
// the query-string.  sessionStorage keeps it alive across soft-refreshes
// inside the WebView while clearing it when the user opens a real browser tab.
const STORAGE_KEY = 'lw_fromApp';
const initialFromApp =
    new URLSearchParams(window.location.search).get('fromApp') === 'true' ||
    sessionStorage.getItem(STORAGE_KEY) === '1';

if (initialFromApp) sessionStorage.setItem(STORAGE_KEY, '1');

export const FromAppProvider = ({ children }) => {
    const [isFromApp, _setIsFromApp] = useState(initialFromApp);

    // Once the flag is true it stays true for the lifetime of this tab.
    const setIsFromApp = useCallback((v) => {
        _setIsFromApp((prev) => {
            if (prev) return true;          // sticky — never reset to false
            if (v) sessionStorage.setItem(STORAGE_KEY, '1');
            return !!v;
        });
    }, []);

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