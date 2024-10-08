import React from "react";
import { images } from "../../../assets/images/images";
import { colors } from "../../../constant/colors";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import SimpleImage from "../../simpleComponents/SimpleImage";
import { Text40 } from "../../specializedComponents/text/AllTextKindFile";


export default function TopToolbarBigScreen({ ChosenButtonText = "תיקים נעוצים" }) {
    return (
        <SimpleContainer
            style={styles.container}
        >
            <Text40 style={{}}>{ChosenButtonText}</Text40>



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