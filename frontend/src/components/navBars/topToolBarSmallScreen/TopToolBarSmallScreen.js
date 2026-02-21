import React, { useState } from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { images } from "../../../assets/images/images";
import SimpleButton from "../../simpleComponents/SimpleButton";
import SideBarMenuItem from "../navBarItems/SideBarMenuItem";
import { useNavigate } from "react-router-dom";
import { usePopup } from "../../../providers/PopUpProvider";
import { getNavBarData } from "../data/NavBarData";
import ImageButton from "../../specializedComponents/buttons/ImageButton";
import SimpleScrollView from "../../simpleComponents/SimpleScrollView";
import { useFromApp } from "../../../providers/FromAppProvider";
import PrimaryButton from "../../styledComponents/buttons/PrimaryButton";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from '../../i18n/LanguageSwitcher';
import ComplianceBadges from '../../compliance/ComplianceBadges';

import './TopToolBarSmallScreen.scss';

const Logo = images.Logos.FullLogoOriginal;

export default function TopToolBarSmallScreen({ chosenIndex = -1, chosenNavKey, LogoNavigate, GetNavBarData = getNavBarData, isClient = false }) {
    const { isFromApp } = useFromApp();
    const { t } = useTranslation();

    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const navigate = useNavigate();

    const { openPopup, closePopup } = usePopup();

    const { NavBarLinks } = GetNavBarData(navigate, openPopup, closePopup, isFromApp, t);

    // Determine which nav item is active — prefer navKey, fall back to chosenIndex
    const isActiveItem = (item, index) => {
        if (chosenNavKey && item.navKey) return item.navKey === chosenNavKey;
        return chosenIndex >= 0 && index === chosenIndex;
    };

    const toggleDrawer = () => {
        setIsDrawerOpen(!isDrawerOpen);
    };

    return (
        <>
            <SimpleContainer className="lw-topToolBarSmallScreen">
                <ImageButton
                    src={Logo}
                    className="lw-topToolBarSmallScreen__logoButton"
                    onPress={() => { navigate(LogoNavigate) }}
                />
                <SimpleButton onPress={toggleDrawer} className="lw-topToolBarSmallScreen__menuButton">
                    <SimpleContainer
                        className={[
                            'lw-topToolBarSmallScreen__icon',
                            isDrawerOpen ? 'lw-topToolBarSmallScreen__icon--open' : null,
                        ].filter(Boolean).join(' ')}
                    >
                        {!isDrawerOpen ? "☰" : "X"}
                    </SimpleContainer>
                </SimpleButton>
            </SimpleContainer >

            {isDrawerOpen &&
                <SimpleContainer className="lw-topToolBarSmallScreen__sidebar">
                    <SimpleScrollView className="lw-topToolBarSmallScreen__scroll">
                        <SimpleContainer className="lw-topToolBarSmallScreen__sidebarContent">
                            {NavBarLinks.map((item, index) => {


                                return (
                                    <SideBarMenuItem
                                        key={item.navKey || item.buttonText}
                                        buttonText={item.buttonText}
                                        iconSource={item.icon}
                                        size={24}
                                        isPressed={isActiveItem(item, index)}
                                        onPressFunction={() => {
                                            item.onClick();
                                            toggleDrawer();
                                        }}
                                        buttonIndex={index}
                                    />
                                );
                            })}
                        </SimpleContainer>
                    </SimpleScrollView>

                    <SimpleContainer className="lw-topToolBarSmallScreen__languageWrap">
                        <LanguageSwitcher />
                    </SimpleContainer>
                    <SimpleContainer className="lw-topToolBarSmallScreen__isoBadgeWrap">
                        <ComplianceBadges size="small" layout="row" showLabels={false} />
                    </SimpleContainer>
                    {!isFromApp && (
                        <SimpleContainer className="lw-topToolBarSmallScreen__logout">
                            <PrimaryButton
                                className="lw-topToolBarSmallScreen__logoutButton"
                                onPress={() => {
                                    localStorage.removeItem("token");
                                    navigate('/');
                                }}
                            >
                                {t('common.logout')}
                            </PrimaryButton>
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            }
        </>
    );
}
