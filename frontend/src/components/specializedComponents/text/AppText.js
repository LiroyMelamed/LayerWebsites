import React from "react";
import { colors } from "../../../constant/colors";
import DefaultText from "./DefaultText";

export default function AppText({
    color = colors.text,
    size = 14,
    fontFamily = 'inherit',
    fontWeight = 400,
    style,
    children,
    ...restProps
}) {

    const textStyle = {
        color,
        fontSize: size,
        fontFamily,
        fontWeight,
        alignItems: 'flex-end',
        display: 'flex',
        ...style,
    };

    return (
        <DefaultText style={textStyle} size={size} {...restProps}>
            {children}
        </DefaultText>
    );
}
