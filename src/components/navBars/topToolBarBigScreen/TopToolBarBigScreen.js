import React, { useEffect, useState } from "react";
import { colors } from "../../../constant/colors";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text40 } from "../../specializedComponents/text/AllTextKindFile";


export default function TopToolbarBigScreen({ ChosenButtonText }) {
    const [titleTopBar, setTitleTopBar] = useState(ChosenButtonText);

    useEffect(() => {
        if (ChosenButtonText != null) {
            setTitleTopBar(ChosenButtonText);
        }
    }, [ChosenButtonText]);

    return (
        <SimpleContainer
            style={styles.container}
        >
            <Text40 style={{ marginRight: 28 }}>{titleTopBar}</Text40>

        </SimpleContainer >
    );
}

const styles = {
    container: {
        display: 'flex',
        height: 80,
        alignItems: 'center',
        flexDirection: 'row-reverse',
        backgroundColor: colors.white,
        width: 'calc(100vw - 250px)',
    },
}