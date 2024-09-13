import React from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleButton from './SimpleButton';
import { NavBarData } from '../navBars/data/NavBarData';
import ButtonWithIcons from '../specializedComponents/buttons/ButtonWithIcons';
import { icons } from '../../assets/icons/icons';
import Separator from '../styledComponents/separators/Separator';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import SimpleImage from './SimpleImage';
import { images } from '../../assets/images/images';
import SimpleScrollView from './SimpleScrollView';
import TertiaryButton from '../styledComponents/buttons/TertiaryButton';
import colors from '../../constant/colors';
// import { useNavigate } from 'react-router-dom';

const { NavBarLinks } = NavBarData

const SimpleNav = ({ activeButton, style }) => {
  // const navigate = useNavigate()
  const { isSmallScreen } = useScreenSize();

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    ...style
  };

  return (
    <SimpleScrollView>
      <SimpleContainer style={containerStyle}>

        {!isSmallScreen &&
          <SimpleImage
            src={images.Logos.FullLogoOriginal}
            style={styles.logo}
          />}
        {NavBarLinks.map((ListOfLinks, index) => (
          <>

            {index != 0 && <Separator />}
            {ListOfLinks.map(link => (
              <TertiaryButton
                onClick={() => { }}
                leftIcon={link.icon}
                iconSize={18}
                tintColor={colors.black}
                style={{ justifyContent: 'flex-end' }}
              >
                {link.buttonText}
              </TertiaryButton>
            ))}
          </>
        ))}
      </SimpleContainer>

    </SimpleScrollView>
  );
};

const styles = {
  logo: {
    width: 200,
    alignSelf: 'center',
    margin: '50px 0px'
  }
}

export default SimpleNav;
