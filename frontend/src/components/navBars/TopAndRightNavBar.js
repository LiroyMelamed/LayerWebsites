import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { usePopup } from "../../providers/PopUpProvider";
import { getNavBarData } from '../navBars/data/NavBarData';
import SimpleContainer from "../simpleComponents/SimpleContainer";
import SideBarMenuItem from "./navBarItems/SideBarMenuItem";
import { images } from "../../assets/images/images";
import { useScreenSize } from "../../providers/ScreenSizeProvider";
import ImageButton from "../specializedComponents/buttons/ImageButton";
import Separator from "../styledComponents/separators/Separator";
import SimpleScrollView from "../simpleComponents/SimpleScrollView";
import { useFromApp } from "../../providers/FromAppProvider";
import GenericButton from "../styledComponents/buttons/GenericButton";
import { colors } from "../../constant/colors";
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import "./TopAndRightNavBar.scss";

const Logo = images.Logos.LogoSlangWhite;

export default function TopAndRightNavBar({ children, LogoNavigate, GetNavBarData = getNavBarData }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSmallScreen } = useScreenSize();
  const { openPopup, closePopup } = usePopup();
  const { isFromApp } = useFromApp();
  const { t } = useTranslation();
  const { NavBarLinks } = GetNavBarData(navigate, openPopup, closePopup, isFromApp, t);

  /** Check if a nav item matches the current URL pathname */
  function isActiveItem(item) {
    if (!item.routeMatch) return false;
    const matches = Array.isArray(item.routeMatch) ? item.routeMatch : [item.routeMatch];
    return matches.some(route => location.pathname.includes(route));
  }

  return (
    <SimpleContainer className="lw-topAndRightNavBar">
      {!isSmallScreen && (
        <SimpleContainer className="lw-topAndRightNavBar__sidebar">
          <SimpleContainer className="lw-topAndRightNavBar__logoRow">
            <ImageButton
              src={Logo}
              className="lw-topAndRightNavBar__logoBtn"
              onPress={() => {
                navigate(LogoNavigate);
              }}
            />
          </SimpleContainer>
          <SimpleContainer className="lw-topAndRightNavBar__separatorWrap">
            <Separator />
          </SimpleContainer>

          <SimpleScrollView>
            <SimpleContainer className="lw-topAndRightNavBar__navList">
              {NavBarLinks.map((item, index) => (
                <SideBarMenuItem
                  key={item.navKey || item.buttonText || String(index)}
                  buttonText={item.buttonText}
                  iconSource={item.icon}
                  size={24}
                  isPressed={isActiveItem(item)}
                  onPressFunction={() => { item.onClick() }}
                  buttonIndex={index}
                />
              ))}
            </SimpleContainer>

          </SimpleScrollView>
          <SimpleContainer className="lw-topAndRightNavBar__bottom">
            <SimpleContainer className="lw-topAndRightNavBar__languageWrap">
              <LanguageSwitcher />
            </SimpleContainer>
            <SimpleContainer className="lw-topAndRightNavBar__logoutWrap">
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
                {t('common.logout')}
              </GenericButton>
            </SimpleContainer>
          </SimpleContainer>
        </SimpleContainer>
      )}

      <SimpleContainer className="lw-topAndRightNavBar__content">
        {children}
      </SimpleContainer>
    </SimpleContainer>
  );
}
