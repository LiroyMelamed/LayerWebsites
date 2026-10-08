import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    controlRef,
    dropdownProps,
    controlledValue,
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
    const buttonRef = useRef();
    const keyboardNavigation = dropdownProps?.keyboardNavigation === true;
    const closeResults = useCallback(() => {
        setShowResults(false);
        if (keyboardNavigation) buttonRef.current?.focus();
    }, [keyboardNavigation]);
    const setControlRef = node => {
        buttonRef.current = node;
        if (typeof controlRef === "function") controlRef(node);
        else if (controlRef) controlRef.current = node;
    };

    useEffect(() => {
        setChosenValue(defaultValue ?? null);
    }, [defaultValue]);

    const displayedValue = controlledValue === undefined ? chosenValue : controlledValue;
    const chosenItem = computedItems.find((it) => it.value === displayedValue) || computedItems[0];

    function OnPressChoice(_label, item) {
        if (dropdownProps?.getOptionProps?.(item)?.disabled || (keyboardNavigation && buttonRef.current?.matches(':disabled'))) return;
        closeResults();
        setChosenValue(item?.value ?? null)
        OnPressChoiceFunction?.(item?.value ?? null, item)
    }

    return (
        <SimpleContainer className="lw-chooseButton">
            <SecondaryButton
                ref={setControlRef}
                leftIcon={icons.Button.DownArrow}
                onPress={() => {
                    setShowResults(true)
                }}
                size={buttonSizes.SMALL}
                {...props}
                aria-expanded={dropdownProps?.keyboardNavigation ? showResults : props?.['aria-expanded']}
                onKeyDown={event => {
                    props?.onKeyDown?.(event);
                    if (dropdownProps?.keyboardNavigation && !props?.disabled && !buttonRef.current?.matches(':disabled') && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
                        event.preventDefault(); setShowResults(true);
                    }
                }}
            >
                {chosenItem?.label}
            </SecondaryButton>
            {showResults && (
                <HoverContainer
                    {...dropdownProps}
                    portalContainer={dropdownProps?.withinDialog ? buttonRef.current?.closest('dialog') || undefined : dropdownProps?.portalContainer}
                    targetRef={buttonRef}
                    queryResult={computedItems}
                    getButtonTextFunction={(item) => item?.label}
                    onPressButtonFunction={OnPressChoice}
                    onClose={closeResults}
                />
            )}

        </SimpleContainer>
    )
}