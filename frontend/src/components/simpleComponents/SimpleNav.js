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

import './SimpleNav.scss';

const SimpleNav = ({ activeButton }) => {
  const { isSmallScreen } = useScreenSize();
  const { openPopup } = usePopup();
  const navigate = useNavigate()
  const { NavBarLinks } = getNavBarData(navigate, openPopup);

  return (
    <SimpleContainer className="lw-simpleNav">
      <SimpleScrollView>
        <SimpleContainer className={"lw-simpleNav__inner" + (isSmallScreen ? " is-mobile" : "") }>
          {!isSmallScreen &&
            <SimpleImage
              src={images.Logos.FullLogoOriginal}
              className="lw-simpleNav__logo"
            />
          }
          {NavBarLinks.map((ListOfLinks, ListIndex) => (
            <SimpleContainer className="lw-simpleNav__list" key={`NavList${ListIndex}`}>
              {ListIndex !== 0 && <Separator />}
              {ListOfLinks.map((link, LinkIndex) => (
                <TertiaryButton
                  key={`NavItemNumber[${ListIndex}][${LinkIndex}]`}
                  onClick={link.onClick}
                  leftIcon={link.icon}
                  iconSize={18}
                  tintColor={colors.black}
                  className="lw-simpleNav__navItem"
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

export default SimpleNav;
