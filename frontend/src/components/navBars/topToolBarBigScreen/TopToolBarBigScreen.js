import React, { useEffect, useState } from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text40 } from "../../specializedComponents/text/AllTextKindFile";
import "./TopToolBarBigScreen.scss";


export default function TopToolbarBigScreen({ ChosenButtonText }) {
    const [titleTopBar, setTitleTopBar] = useState(ChosenButtonText);

    useEffect(() => {
        if (ChosenButtonText != null) {
            setTitleTopBar(ChosenButtonText);
        }
    }, [ChosenButtonText]);

    return (
        <SimpleContainer
            className="lw-topToolBarBigScreen"
        >
            <Text40 className="lw-topToolBarBigScreen__title">{titleTopBar}</Text40>

        </SimpleContainer >
    );
}
