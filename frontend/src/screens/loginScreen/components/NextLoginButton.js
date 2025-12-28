import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";

import "./NextLoginButton.scss";

export default function NextLoginButton({ isProcessing, buttonText = 'להתחברות', leftIcon, rightIcon, onPress, style, ...props }) {
    return (
        <PrimaryButton
            isPerforming={isProcessing}
            children={buttonText}
            leftIcon={leftIcon}
            rightIcon={rightIcon}
            className="lw-nextLoginButton"
            style={style}
            onPress={onPress}
            {...props}
        />
    );
}