import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePopup } from "../../providers/PopUpProvider";
import { getNavBarData } from '../navBars/data/NavBarData';
import SimpleContainer from "../simpleComponents/SimpleContainer";
import SideBarMenuItem from "./navBarItems/SideBarMenuItem";
import { colors } from "../../constant/colors";
import TopToolbarBigScreen from "./topToolBarBigScreen/TopToolBarBigScreen";
import TopToolBarSmallScreen from "./topToolBarSmallScreen/TopToolBarSmallScreen";
import { images } from "../../assets/images/images";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import ImageButton from "../specializedComponents/buttons/ImageButton";
import Separator from "../styledComponents/separators/Separator";

const Logo = images.Logos.LogoSlangWhite;

export default function SideBar({ chosenIndex = -1, children }) {
  const navigate = useNavigate();
  const { isSmallScreen } = useScreenSize();
  const { openPopup } = usePopup();
  const [currentIndex, setCurrentIndex] = useState(chosenIndex);
  const { NavBarLinks } = getNavBarData(navigate, openPopup);

  return (
    <SimpleContainer style={styles.mainContainer}>
      {!isSmallScreen && (
        <SimpleContainer style={styles.sidebarContainer}>
          <SimpleContainer style={styles.logoContainer}>
            <ImageButton src={Logo} height={60} style={{ maxHeight: 60, alignSelf: 'center' }} onPress={() => { setCurrentIndex(-1); navigate('/') }} />
          </SimpleContainer>
          <Separator style={{ margin: '20px 0' }} />
          <SimpleContainer style={{}}>
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
        </SimpleContainer>
      )}

      <SimpleContainer style={{ flex: 1 }}>
        {children}
      </SimpleContainer>

      {/* <SimpleContainer style={styles.contentContainer(isSmallScreen)}>
        <SimpleContainer>
          {isSmallScreen ? <TopToolBarSmallScreen /> : <TopToolbarBigScreen ChosenButtonText={currentIndex != -1 ? NavBarLinks[currentIndex]?.buttonScreen : "מסך הבית"} />}
        </SimpleContainer>
        <SimpleContainer style={styles.childrenContainer}>
          {children}
        </SimpleContainer>
      </SimpleContainer> */}
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
    zIndex: 11111
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
  },
  contentContainer: (isSmallScreen) => ({
    display: 'flex',
    flexDirection: 'column',
    width: isSmallScreen ? '100vw' : 'calc(100vw - 250px)', // Full width minus sidebar width
    height: '100dvh',
    overflow: 'hidden',
  }),

  childrenContainer: {
    flex: 1, // Take up remaining space
  },
};
