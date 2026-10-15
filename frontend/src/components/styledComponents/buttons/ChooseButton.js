import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { icons } from "../../../assets/icons/icons";
import HoverContainer from "../../specializedComponents/containers/HoverContainer";
import SecondaryButton from "./SecondaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";

import "./ChooseButton.scss";

export default function ChooseButton({
    buttonText,
    buttonChoices,
    items,
    OnPressChoiceFunction,
    showAll = true,
    defaultValue = null,
    style: _style,
    props,
}) {
    const { t } = useTranslation();

    const computedItems = useMemo(() => {
        const normalizedChoices = Array.isArray(buttonChoices) ? buttonChoices : [];
        const normalizedItems = Array.isArray(items)
            ? items
            : normalizedChoices.map((c) => ({ value: c, label: String(c) }));

        if (showAll) {
            return [{ value: null, label: buttonText ?? t('common.choose') }, ...normalizedItems];
        }
        return normalizedItems;
    }, [buttonChoices, items, t, showAll, buttonText]);

    const [chosenValue, setChosenValue] = useState(defaultValue);
    const [showResults, setShowResults] = useState(false);
    const buttonRef = useRef()

    const chosenItem = computedItems.find((it) => it.value === chosenValue) || computedItems[0];

    function OnPressChoice(_label, item) {
        setShowResults(false)
        setChosenValue(item?.value ?? null)
        OnPressChoiceFunction?.(item?.value ?? null, item)
    }

    return (
        <SimpleContainer className="lw-chooseButton">
            <SecondaryButton
                ref={buttonRef}
                leftIcon={icons.Button.DownArrow}
                onPress={() => {
                    setShowResults(true)
                }}
                size={buttonSizes.SMALL}
                {...props}
            >
                {chosenItem?.label}
            </SecondaryButton>
            {showResults && (
                <HoverContainer
                    targetRef={buttonRef}
                    queryResult={computedItems}
                    getButtonTextFunction={(item) => item?.label}
                    onPressButtonFunction={OnPressChoice}
                    onClose={() => { setShowResults(false) }}
                />
            )}

        </SimpleContainer>
    )
}