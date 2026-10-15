import React, { createContext, useContext, useState, useEffect } from 'react';

// Create a Context for screen size
const ScreenSizeContext = createContext();

// Create a custom hook to use the ScreenSizeContext
export const useScreenSize = () => {
  return useContext(ScreenSizeContext);
};

// Define a provider component
export const ScreenSizeProvider = ({ children, forceIsSmallScreen = undefined }) => {
  const isForced = typeof forceIsSmallScreen === 'boolean';
  const [isSmallScreen, setIsSmallScreen] = useState(
    isForced ? forceIsSmallScreen : window.innerWidth < 1280
  );

  const handleResize = () => {
    if (isForced) return;
    setIsSmallScreen(window.innerWidth < 1280);
  };

  useEffect(() => {
    if (isForced) {
      setIsSmallScreen(forceIsSmallScreen);
      return undefined;
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForced, forceIsSmallScreen]);

  return (
    <ScreenSizeContext.Provider value={{ isSmallScreen }}>
      {children}
    </ScreenSizeContext.Provider>
  );
};
