import React, { useState } from "react";
import { colors } from "../../../constant/colors";
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

import './TopToolBarSmallScreen.scss';

const Logo = images.Logos.FullLogoOriginal;

export default function TopToolBarSmallScreen({ chosenIndex = -1, LogoNavigate, GetNavBarData = getNavBarData, isClient = false }) {
    const { isFromApp } = useFromApp();

    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const [currentIndex, setCurrentIndex] = useState(chosenIndex);

    const navigate = useNavigate();

    const { openPopup, closePopup } = usePopup();

    const { NavBarLinks } = GetNavBarData(navigate, openPopup, closePopup, isFromApp);

    const toggleDrawer = () => {
        setIsDrawerOpen(!isDrawerOpen);
    };

    const logoutButtonStyle = {
        backgroundColor: colors.darkRed,
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
                    <SimpleScrollView>
                        <SimpleContainer className="lw-topToolBarSmallScreen__sidebarContent">
                            {NavBarLinks.map((item, index) => {


                                return (
                                    <SideBarMenuItem
                                        key={item.buttonText}
                                        buttonText={item.buttonText}
                                        iconSource={item.icon}
                                        size={24}
                                        isPressed={currentIndex === index}
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
                    {!isFromApp && (
                        <SimpleContainer className="lw-topToolBarSmallScreen__logout">
                            <PrimaryButton
                                style={logoutButtonStyle}
                                onPress={() => {
                                    localStorage.removeItem("token");
                                    navigate('/');
                                }}
                            >
                                התנתק
                            </PrimaryButton>
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            }
        </>
    );
}
