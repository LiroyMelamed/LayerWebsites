import React, { useState } from 'react';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import SimpleButton from '../simpleComponents/SimpleButton';
import colors from '../../constant/colors';
import SimpleNav from '../simpleComponents/SimpleNav';
import SimpleImage from '../simpleComponents/SimpleImage';
import { images } from '../../assets/images/images';
import SimpleContainer from '../simpleComponents/SimpleContainer';

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
        <SimpleContainer style={styles.sidebar}>
          <SimpleContainer style={styles.menuBig}>
            <SimpleNav style={styles.menuNavBig} />
          </SimpleContainer>
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
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)', // Shadow for header
    height: 60,
    zIndex: 1000,
  },
  sidebar: {
    width: '250px',
    backgroundColor: colors.white,
    position: 'fixed',
    right: 0,
    height: '100vh',
    display: 'flex',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
    zIndex: 1000,
  },
  menuButton: {
    fontSize: '24px',
    background: 'none',
    color: colors.black,
    cursor: 'pointer',
    position: 'absolute',
    zIndex: 1001,
    right: '50px',
    transition: 'transform 0.3s, color 0.3s',
  },
  menuButtonTransform: (isMenuOpen) => ({
    transform: isMenuOpen ? 'rotate(90deg)' : 'rotate(0deg)',
    color: isMenuOpen ? colors.black : colors.black,
  }),
  menu: {
    position: 'fixed',
    top: 0,
    right: 0,
    height: '100vh',
    width: '250px',
    backgroundColor: colors.white,
    transition: 'transform 0.3s ease, opacity 0.3s ease',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
    display: 'flex',
  },
  menuBig: {
    position: 'fixed',
    top: 0,
    right: 0,
    height: '100vh',
    width: '250px',
    backgroundColor: colors.white,
    transition: 'transform 0.3s ease, opacity 0.3s ease',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
    display: 'flex',
  },
  menuNav: {
    listStyleType: 'none',
    display: 'flex',
    flexDirection: 'column',
  },
  menuNavBig: {
    listStyleType: 'none',
    display: 'flex',
    flexDirection: 'column',
  },
  logo: {
    height: 50,
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
  },

};

export default TopAndRightNavBar;
