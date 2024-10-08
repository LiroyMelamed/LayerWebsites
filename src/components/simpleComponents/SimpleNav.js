import React from 'react';
import { getNavBarData } from '../navBars/data/NavBarData';
import Separator from '../styledComponents/separators/Separator';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import SimpleImage from './SimpleImage';
import { images } from '../../assets/images/images';
import SimpleScrollView from './SimpleScrollView';
import TertiaryButton from '../styledComponents/buttons/TertiaryButton';
import { colors } from '../../constant/colors';
import SimpleContainer from './SimpleContainer';
import { useNavigate } from 'react-router-dom';
import { usePopup } from '../../providers/PopUpProvider';
import { buttonSizes } from '../../styles/buttons/buttonSizes';


const SimpleNav = ({ activeButton, style }) => {
  const { isSmallScreen } = useScreenSize();
  const { openPopup } = usePopup();
  const navigate = useNavigate()
  const { NavBarLinks } = getNavBarData(navigate, openPopup);

  const containerStyle = {
    display: 'flex',
    height: '100%',
    width: '100%',
    ...style
  };

  return (
    <SimpleContainer style={containerStyle}>
      <SimpleScrollView>
        <SimpleContainer style={styles.innerContainer(isSmallScreen)}>
          {!isSmallScreen &&
            <SimpleImage
              src={images.Logos.FullLogoOriginal}
              style={styles.logo}
            />
          }
          {NavBarLinks.map((ListOfLinks, ListIndex) => (
            <SimpleContainer key={`NavList${ListIndex}`} style={styles.list}>
              {ListIndex !== 0 && <Separator />}
              {ListOfLinks.map((link, LinkIndex) => (
                <TertiaryButton
                  key={`NavItemNumber[${ListIndex}][${LinkIndex}]`}
                  onClick={link.onClick}
                  leftIcon={link.icon}
                  iconSize={18}
                  tintColor={colors.black}
                  style={{ width: '100%', justifyContent: 'flex-end' }}
                  buttonSize={buttonSizes.LARGE}
                >
                  {link.buttonText}
                </TertiaryButton>
              ))}
            </SimpleContainer>
          ))}
        </SimpleContainer>
      </SimpleScrollView>
    </SimpleContainer>
  );
};

const styles = {
  logo: {
    width: 200,
    alignSelf: 'center', // Ensure the logo is centered within its container
    margin: '50px 0px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end'
  },
  innerContainer: (isSmallScreen) => ({
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    marginTop: isSmallScreen ? 60 : 0
  })
};

export default SimpleNav;
