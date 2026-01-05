import { useEffect, useRef, useState } from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text16 } from "../../specializedComponents/text/AllTextKindFile";
import { icons } from "../../../assets/icons/icons";
import HoverContainer from "../../specializedComponents/containers/HoverContainer";
import SecondaryButton from "./SecondaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";

import "./ChooseButton.scss";

export default function ChooseButton({ buttonText = "סוג תיק", buttonChoices, OnPressChoiceFunction, style: _style, props }) {
    const [chosenChoice, setChosenChoice] = useState("הכל")
    const [showResults, setShowResults] = useState(false);
    const buttonRef = useRef()

    function OnPressChoice(text) {
        setShowResults(false)
        setChosenChoice(text)
        OnPressChoiceFunction?.(text)
    }

    useEffect(() => {
    }, [showResults])

    return (
        <SimpleContainer className="lw-chooseButton">
            <Text16>{buttonText + ":"}</Text16>
            <SecondaryButton
                ref={buttonRef}
                leftIcon={icons.Button.DownArrow}
                onPress={() => {
                    setShowResults(true)
                }}
                size={buttonSizes.SMALL}
                {...props}
            >
                {chosenChoice}
            </SecondaryButton>
            {showResults && (
                <HoverContainer
                    targetRef={buttonRef}
                    queryResult={['הכל', ...buttonChoices]}
                    getButtonTextFunction={item => item}
                    onPressButtonFunction={OnPressChoice}
                    onClose={() => { setShowResults(false) }}
                />
            )}

        </SimpleContainer>
    )
}