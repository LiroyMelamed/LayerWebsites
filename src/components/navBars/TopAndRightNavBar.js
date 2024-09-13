import React, { useState } from 'react';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import SimpleContainer from '../simpleComponents/SimpleContainer';
import SimpleButton from '../simpleComponents/SimpleButton';
import colors from '../../constant/colors';
import SimpleNav from '../simpleComponents/SimpleNav';
import SimpleImage from '../simpleComponents/SimpleImage';
import { images } from '../../assets/images/images';

const TopAndRightNavBar = () => {
  const { isSmallScreen } = useScreenSize();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => setIsMenuOpen(prev => !prev);

  return (
    <>
      {isSmallScreen ? (
        <SimpleContainer style={styles.headerSmallScreen}>
          <SimpleButton
            onClick={toggleMenu}
            style={{
              ...styles.menuButton,
              ...styles.menuButtonTransform(isMenuOpen),
            }}
          >
            {isMenuOpen ? 'X' : '☰'}
          </SimpleButton>
          <SimpleImage
            src={images.Logos.FullLogoOriginal}
            style={styles.logo}
          />
          <SimpleContainer style={{
            ...styles.menu,
            transform: isMenuOpen ? 'translateX(0)' : 'translateX(100%)',
            opacity: isMenuOpen ? 1 : 0,
          }}>
            <SimpleNav style={styles.menuNav} />
          </SimpleContainer>
        </SimpleContainer>
      ) : (
        <SimpleContainer style={styles.sidebarContainer}>
          <SimpleNav style={styles.sidebar} />
        </SimpleContainer>
      )}
    </>
  );
};

const styles = {
  headerSmallScreen: {
    backgroundColor: colors.white,
    padding: '10px 20px',
    position: 'fixed', // Fixed position to stay at the top
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)', // Shadow for header
    height: 60,
  },
  menuButton: {
    fontSize: '24px',
    background: 'none',
    color: colors.black,
    cursor: 'pointer',
    outline: 'none',
    position: 'absolute',
    zIndex: 1001,
    right: '20px',
    transition: 'transform 0.3s, color 0.3s',
    boxShadow: 'none',
  },
  menuButtonTransform: (isMenuOpen) => ({
    transform: isMenuOpen ? 'rotate(90deg)' : 'rotate(0deg)',
    color: isMenuOpen ? colors.black : colors.black,
  }),
  menu: {
    position: 'fixed',
    top: 0,
    right: 0,
    height: '100dvh',
    width: '250px',
    backgroundColor: colors.white,
    transition: 'transform 0.3s ease, opacity 0.3s ease',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
    overflowY: 'auto',
  },
  menuNav: {
    listStyleType: 'none',
    marginTop: 80,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  logo: {
    height: 50,
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  sidebarContainer: {
    display: 'flex',
  },
  sidebar: {
    width: '250px',
    height: '100dvh',
    backgroundColor: colors.white,
    position: 'fixed',
    top: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
  },
};

export default TopAndRightNavBar;
