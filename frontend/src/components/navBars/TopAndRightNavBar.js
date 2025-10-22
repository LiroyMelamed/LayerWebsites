import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePopup } from "../../providers/PopUpProvider";
import { getNavBarData } from '../navBars/data/NavBarData';
import SimpleContainer from "../simpleComponents/SimpleContainer";
import SideBarMenuItem from "./navBarItems/SideBarMenuItem";
import { colors } from "../../constant/colors";
import { images } from "../../assets/images/images";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import ImageButton from "../specializedComponents/buttons/ImageButton";
import Separator from "../styledComponents/separators/Separator";
import PrimaryButton from "../styledComponents/buttons/PrimaryButton";
import SimpleScrollView from "../simpleComponents/SimpleScrollView";

const Logo = images.Logos.LogoSlangWhite;

export default function TopAndRightNavBar({ chosenIndex = -1, children, LogoNavigate, GetNavBarData = getNavBarData }) {
  const navigate = useNavigate();
  const { isSmallScreen } = useScreenSize();
  const { openPopup, closePopup } = usePopup();
  const [currentIndex, setCurrentIndex] = useState(chosenIndex);
  const { NavBarLinks } = GetNavBarData(navigate, openPopup, closePopup);

  return (
    <SimpleContainer style={styles.mainContainer}>
      {!isSmallScreen && (
        <SimpleContainer style={styles.sidebarContainer}>
          <SimpleContainer style={styles.logoContainer}>
            <ImageButton src={Logo} height={60} style={{ maxHeight: 60, alignSelf: 'center' }} onPress={() => { setCurrentIndex(-1); navigate(LogoNavigate) }} />
          </SimpleContainer>
          <Separator style={{ margin: '20px 0' }} />
          <SimpleScrollView>
            <SimpleContainer style={{ flexDirection: 'column', flex: 1 }}>
              {NavBarLinks.map((item, index) => (
                <SideBarMenuItem
                  key={item.text}
                  buttonText={item.buttonText}
                  iconSource={item.icon}
                  size={24}
                  isPressed={currentIndex === index}
                  onPressFunction={() => { setCurrentIndex(index); item.onClick() }}
                  buttonIndex={index}
                />
              ))}
            </SimpleContainer>

          </SimpleScrollView>
          <PrimaryButton style={{ alignSelf: 'center', marginBottom: '24px', marginTop: '12px', backgroundColor: colors.darkRed }} onPress={() => { localStorage.removeItem("token"); navigate('/') }}>התנתק</PrimaryButton>
        </SimpleContainer>
      )}

      <SimpleContainer style={{ flex: 1 }}>
        {children}
      </SimpleContainer>
    </SimpleContainer>
  );
}

const styles = {
  mainContainer: {
    display: 'flex',
  },
  sidebarContainer: {
    position: 'fixed',
    width: 250,
    height: '100vh',
    right: 0,
    backgroundColor: colors.text,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 20,
    zIndex: 11111,
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
  },
  contentContainer: (isSmallScreen) => ({
    display: 'flex',
    flexDirection: 'column',
    width: isSmallScreen ? '100%' : 'calc(100% - 250px)', // Full width minus sidebar width
    minHeight: '100svh',
    overflow: 'hidden',
  }),

  childrenContainer: {
    flex: 1,
  },
};
