import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";

export default function NextLoginButton({ isProcessing, buttonText = 'להתחברות', leftIcon, rightIcon, onPress, style, ...props }) {
    const buttonStyle = {
        alignSelf: 'center',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '20px 0px',
        width: 240,
        ...style
    }
    return (
        <PrimaryButton
            isProcessing={isProcessing}
            children={buttonText}
            leftIcon={leftIcon}
            rightIcon={rightIcon}
            style={buttonStyle}
            onPress={onPress}
            {...props}
        />
    );
}