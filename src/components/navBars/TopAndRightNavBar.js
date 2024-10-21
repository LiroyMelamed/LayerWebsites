import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePopup } from "../../providers/PopUpProvider";
import { getNavBarData } from '../navBars/data/NavBarData';
import SimpleContainer from "../simpleComponents/SimpleContainer";
import SideBarMenuItem from "./navBarItems/SideBarMenuItem";
import { MainScreenName } from "../../screens/mainScreen/MainScreen";
import { colors } from "../../constant/colors";
import TopToolbarBigScreen from "./topToolBarBigScreen/TopToolBarBigScreen";
import { images } from "../../assets/images/images";
import SimpleImage from "../simpleComponents/SimpleImage";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import TopToolBarSmallScreen from "./topToolBarSmallScreen/TopToolBarSmallScreen";

const Logo = images.Logos.LogoSlangWhite;

export default function SideBar({ chosenIndex = 0, children }) {
  const navigate = useNavigate();
  const {isSmallScreen} = useScreenSize();
  const { openPopup } = usePopup();
  const [currentIndex, setCurrentIndex] = useState(chosenIndex);
  const { NavBarLinks } = getNavBarData(navigate, openPopup);

  function handlePress(index) {
    setCurrentIndex(index)
    handleSideBarPress(index)
  }

  function handleSideBarPress(index) {
    navigate(MainScreenName, { state: { pageIndex: index } })
  }

  return (
    <SimpleContainer>
      {!isSmallScreen &&   
      <SimpleContainer style={styles.container}>

        <SimpleContainer style={{ display: 'flex', width: '100%', height: 80, alignItems: 'center', justifyContent: 'center' }}>
          <SimpleImage
            src={Logo}
            style={{ maxHeight: 60, selfAlign: 'center' }}
          />
        </SimpleContainer>


        <SimpleContainer style={{ marginTop: 40 }}>
          {NavBarLinks.map((item, index) => (
            <SideBarMenuItem
              key={item.text}
              buttonText={item.buttonText}
              iconSource={item.icon}
              size={24}
              isPressed={currentIndex === index}
              onPressFunction={handlePress}
              buttonIndex={index}
            />
          ))}
        </SimpleContainer>
      </SimpleContainer>
      }
      <SimpleContainer style={{ maxHeight: '100dvh' }}>
        {isSmallScreen ? 
        <TopToolBarSmallScreen />
        :  
        <TopToolbarBigScreen />
      }
        {children}
      </SimpleContainer>
    </SimpleContainer>
  );
}

const styles = {
  container: {
    position: 'fixed',
    width: 250,
    height: '100dvh', // Use calc as a string
    right: 0,
    backgroundColor: colors.text,
    zIndex: 1004
  }
}