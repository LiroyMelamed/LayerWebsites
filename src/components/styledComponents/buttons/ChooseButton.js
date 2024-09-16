import { useRef, useState } from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text12, Text16, Text20 } from "../../specializedComponents/text/AllTextKindFile";
import SecondaryButton from "./SecondaryButton";
import { icons } from "../../../assets/icons/icons";
import HoverContainer from "../../specializedComponents/containers/HoverContainer";

export default function ChooseButton({ buttonText = "סוג תיק", buttonChoices = ["הכל", 'cshhe', "הכל", 'cshhe', "הכל", 'cshhe', "הכל", 'cshhe', "הכל", 'cshhe', "הכל", 'cshhe', "הכל", 'cshhe', "הכל", 'cshhe', "הכל", 'cshhe', "הכל", 'cshhe', "הכל", 'cshhe', "הכל", 'cshhe',], style }) {
    const [chosenChoice, setChosenChoice] = useState("הכל")
    const [showResults, setShowResults] = useState(false);
    const buttonRef = useRef()

    const containerStyle = {
        display: 'flex',
        flexDirection: 'row-reverse',
        alignItems: 'center',
        ...style
    }

    function OnPressChoice(text) {
        console.log("getButtonTextFunction?.(result)", text);
        setShowResults(false)
        setChosenChoice(text)
    }

    return (
        <SimpleContainer style={containerStyle}>
            <Text16>{buttonText + ":"}</Text16>
            <SecondaryButton ref={buttonRef} leftIcon={icons.Button.DownArrow} onClick={() => { setShowResults(true) }} style={{ marginRight: 8, textAlign: 'center' }} >{chosenChoice}</SecondaryButton>
            {showResults && (
                <HoverContainer
                    targetRef={buttonRef}
                    style={{
                        position: 'absolute',
                        zIndex: 1000,
                    }}
                    queryResult={buttonChoices}
                    getButtonTextFunction={item => item}
                    onPressButtonFunction={OnPressChoice}
                    onClose={() => { setShowResults(false) }}
                />
            )}

        </SimpleContainer>
    )
}