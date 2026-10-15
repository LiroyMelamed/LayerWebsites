import React from "react";
import PrimaryButton from "../../styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../styledComponents/buttons/SecondaryButton";

export default function SigningTabButton({ isActive, onPress, children, style }) {
    const ButtonComponent = isActive ? PrimaryButton : SecondaryButton;

    return (
        <ButtonComponent onPress={onPress} style={style}>
            {children}
        </ButtonComponent>
    );
}
