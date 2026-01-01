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
import GenericButton from "../styledComponents/buttons/GenericButton";
import SimpleScrollView from "../simpleComponents/SimpleScrollView";
import "./TopAndRightNavBar.scss";

const Logo = images.Logos.LogoSlangWhite;

export default function TopAndRightNavBar({ chosenIndex = -1, children, LogoNavigate, GetNavBarData = getNavBarData }) {
  const navigate = useNavigate();
  const { isSmallScreen } = useScreenSize();
  const { openPopup, closePopup } = usePopup();
  const [currentIndex, setCurrentIndex] = useState(chosenIndex);
  const { NavBarLinks } = GetNavBarData(navigate, openPopup, closePopup);

  return (
    <SimpleContainer className="lw-topAndRightNavBar">
      {!isSmallScreen && (
        <SimpleContainer className="lw-topAndRightNavBar__sidebar">
          <SimpleContainer className="lw-topAndRightNavBar__logoRow">
            <ImageButton
              src={Logo}
              className="lw-topAndRightNavBar__logoBtn"
              onPress={() => {
                setCurrentIndex(-1);
                navigate(LogoNavigate);
              }}
            />
          </SimpleContainer>
          <div className="lw-topAndRightNavBar__separatorWrap">
            <Separator />
          </div>
          <SimpleScrollView>
            <SimpleContainer className="lw-topAndRightNavBar__navList">
              {NavBarLinks.map((item, index) => (
                <SideBarMenuItem
                  key={item.text}
                  buttonText={item.buttonText}
                  iconSource={item.icon}
                  size={24}
                  isPressed={currentIndex === index}
                  onPressFunction={() => { item.onClick() }}
                  buttonIndex={index}
                />
              ))}
            </SimpleContainer>

          </SimpleScrollView>
          <div className="lw-topAndRightNavBar__logoutWrap">
            <GenericButton
              backgroundColor={colors.darkRed}
              pressedBackgroundColor={colors.darkRed}
              disabledBackgroundColor={colors.disabled}
              contentColor={colors.white}
              pressedContentColor={colors.white}
              disabledContentColor={colors.disabledHighlighted}
              onPress={() => {
                localStorage.removeItem("token");
                navigate('/');
              }}
            >
              התנתק
            </GenericButton>
          </div>
        </SimpleContainer>
      )}

      <SimpleContainer className="lw-topAndRightNavBar__content">
        {children}
      </SimpleContainer>
    </SimpleContainer>
  );
}
