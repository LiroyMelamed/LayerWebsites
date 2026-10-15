import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import { useTranslation } from "react-i18next";

import "./NextLoginButton.scss";

export default function NextLoginButton({
    isPerforming,
    isProcessing,
    buttonText,
    leftIcon,
    rightIcon,
    onPress,
    style,
    ...props
}) {
    const { t } = useTranslation();
    const resolvedIsPerforming = isPerforming ?? isProcessing;
    const resolvedButtonText = buttonText ?? t('auth.next');

    return (
        <PrimaryButton
            isPerforming={resolvedIsPerforming}
            children={resolvedButtonText}
            leftIcon={leftIcon}
            rightIcon={rightIcon}
            className="lw-nextLoginButton"
            style={style}
            onPress={onPress}
            {...props}
        />
    );
}