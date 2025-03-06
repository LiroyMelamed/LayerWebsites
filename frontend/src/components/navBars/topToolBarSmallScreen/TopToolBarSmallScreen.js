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
import PrimaryButton from "../../styledComponents/buttons/PrimaryButton";
import SimpleScrollView from "../../simpleComponents/SimpleScrollView";

const Logo = images.Logos.FullLogoOriginal;

export default function TopToolBarSmallScreen({ chosenIndex = -1, LogoNavigate, GetNavBarData = getNavBarData }) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const [currentIndex, setCurrentIndex] = useState(chosenIndex);

    const navigate = useNavigate();

    const { openPopup } = usePopup();

    const { NavBarLinks } = GetNavBarData(navigate, openPopup);

    const toggleDrawer = () => {
        setIsDrawerOpen(!isDrawerOpen);
    };


    return (
        <>
            <SimpleContainer
                style={styles.container}
            >
                <ImageButton
                    src={Logo}
                    height={60} style={{ maxHeight: 48, alignSelf: 'center' }}
                    onPress={() => { navigate(LogoNavigate) }}
                />
                <SimpleButton onPress={toggleDrawer} style={styles.menuButton}>
                    <span style={{ ...styles.icon, ...(isDrawerOpen ? styles.iconOpen : {}) }}>
                        {!isDrawerOpen ? "☰" : "X"}
                    </span>
                </SimpleButton>
            </SimpleContainer >

            {isDrawerOpen &&
                <SimpleContainer style={styles.sidebarContainer}>
                    <SimpleScrollView>
                        <SimpleContainer style={{ flex: 1, flexDirection: 'column' }}>
                            {NavBarLinks.map((item, index) => (
                                <SideBarMenuItem
                                    key={item.text}
                                    buttonText={item.buttonText}
                                    iconSource={item.icon}
                                    size={24}
                                    isPressed={currentIndex === index}
                                    onPressFunction={() => { setCurrentIndex(index); item.onClick(); toggleDrawer() }}
                                    buttonIndex={index}
                                />
                            ))}
                        </SimpleContainer>
                    </SimpleScrollView>
                    <PrimaryButton style={{ alignSelf: 'center', marginBottom: '20px', marginTop: '8px', backgroundColor: colors.darkRed }} onPress={() => { localStorage.removeItem("token"); navigate('/') }}>התנתק</PrimaryButton>
                </SimpleContainer>
            }
        </>
    );
}

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 80,
        backgroundColor: colors.white,
        boxShadow: '-2px 0 5px rgba(0,0,0,0.1)',
    },
    menuButton: {
        position: 'absolute',
        zIndex: 11112,
        background: 'none',
        border: 'none',
        fontSize: 24,
        cursor: 'pointer',
        top: 20,
        right: 20,
    },
    icon: {
        display: 'block',
        fontSize: 24,
        transition: 'transform 0.3s ease, color 0.3s ease',
        color: colors.text,
    },
    iconOpen: {
        transform: 'rotate(90deg)',
        color: colors.white,
    },
    sidebarContainer: {
        position: 'fixed',
        top: 0,
        right: 0,
        width: 250,
        height: '100vh',
        backgroundColor: colors.text,
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 80,
        zIndex: 11111,
        boxShadow: '-2px 0 5px rgba(0,0,0,0.1)',
        transition: 'transform 0.3s ease',
    },
};