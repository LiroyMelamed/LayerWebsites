import React from "react";
import { colors } from "../../../constant/colors";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import SimpleImage from "../../simpleComponents/SimpleImage";
import { images } from "../../../assets/images/images";

const Logo = images.Logos.FullLogoOriginal;

export default function TopToolBarSmallScreen({ ChosenButtonText = "תיקים נעוצים" }) {
    return (
        <SimpleContainer
            style={styles.container}
        >
          <SimpleImage
            src={Logo}
            style={{ maxHeight: 60, selfAlign: 'center' }}
          />
        </SimpleContainer >
    );
}

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 80,
        backgroundColor: colors.white,
    },
}