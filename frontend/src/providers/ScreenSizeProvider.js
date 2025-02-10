import React, { createContext, useContext, useState, useEffect } from 'react';

// Create a Context for screen size
const ScreenSizeContext = createContext();

// Create a custom hook to use the ScreenSizeContext
export const useScreenSize = () => {
  return useContext(ScreenSizeContext);
};

// Define a provider component
export const ScreenSizeProvider = ({ children }) => {
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 1280);

  const handleResize = () => {
    setIsSmallScreen(window.innerWidth < 1280);
  };

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <ScreenSizeContext.Provider value={{ isSmallScreen }}>
      {children}
    </ScreenSizeContext.Provider>
  );
};
