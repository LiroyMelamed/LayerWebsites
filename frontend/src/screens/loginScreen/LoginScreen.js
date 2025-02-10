import { useLoginVerifyOtpCodeFieldsProvider } from "../../providers/LoginVerifyOtpCodeFieldsProvider";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import { LoginOtpScreenName } from "../otpScreen/OtpScreen.js/LoginOtpScreen";
import SimpleInput from "../../components/simpleComponents/SimpleInput";
import LoginSimpleScreen from "./components/LoginSimpleScreen";
import { LoginStackName } from "../../navigation/LoginStack";
import NextLoginButton from "./components/NextLoginButton";
import TopCenteredLogo from "./components/TopCenteredLogo";
import useHttpRequest from "../../hooks/useHttpRequest";
import { images } from "../../assets/images/images";
import { useNavigate } from "react-router-dom";
import loginApi from "../../api/loginApi";

export const LoginScreenName = "/LoginScreen";

export default function LoginScreen() {
    const { phoneNumber, setPhoneNumber } = useLoginVerifyOtpCodeFieldsProvider();
    const navigate = useNavigate();

    const { isPerforming, performRequest } = useHttpRequest(loginApi.sendOtp, () => navigate(LoginStackName + LoginOtpScreenName));

    const handleInputChange = (event) => {
        setPhoneNumber(event.target.value);
    };

    return (
        <LoginSimpleScreen
            imageBackgroundSource={images.Backgrounds.AppBackground}
            style={{ width: "100%" }}
            unScrollableTopComponent={<TopCenteredLogo />}
            unScrollableBottomComponent={
                <NextLoginButton
                    isProcessing={isPerforming}
                    buttonText="התחברות"
                    onPress={() => performRequest(phoneNumber)}
                />
            }
        >
            <SimpleContainer
                style={{
                    display: "flex",
                    width: "100%",
                    height: "100%",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <SimpleInput
                    title={"נא הזן מספר פלאפון"}
                    style={{ height: 56, width: "60%" }}
                    value={phoneNumber}
                    onChange={handleInputChange}
                />
            </SimpleContainer>
        </LoginSimpleScreen>
    );
}
