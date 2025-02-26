
import { useLoginVerifyOtpCodeFieldsProvider } from "../../../providers/LoginVerifyOtpCodeFieldsProvider";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import LoginSimpleScreen from "../../loginScreen/components/LoginSimpleScreen";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import NextLoginButton from "../../loginScreen/components/NextLoginButton";
import TopCenteredLogoOtp from "../components/TopCenteredLogoOtp";
import useHttpRequest from "../../../hooks/useHttpRequest";
import { images } from "../../../assets/images/images";
import { useNavigate } from "react-router-dom";
import loginApi from "../../../api/loginApi";
import { AdminStackName } from "../../../navigation/AdminStack";
import { MainScreenName } from "../../mainScreen/MainScreen";
import { ClientStackName } from "../../../navigation/ClientStack";
import { ClientMainScreenName } from "../../client/clientMainScreen/ClientMainScreen";

export const AppRoles = {
    Admin: 'Admin',
    Customer: 'Customer'
}

export const LoginOtpScreenName = "/LoginOtpScreen";

export default function LoginOtpScreen() {
    const { otpNumber, setOtpNumber, otpError, phoneNumber } = useLoginVerifyOtpCodeFieldsProvider();
    const navigate = useNavigate();

    const { isPerforming, performRequest } = useHttpRequest(loginApi.verifyOtp, navigateTo);

    const handleInputChange = (event) => {
        setOtpNumber(event.target.value);
    };

    function navigateTo(data) {
        setOtpNumber('')
        localStorage.setItem("token", data.token);
        if (data.role == AppRoles.Admin) navigate(AdminStackName + MainScreenName)
        else navigate(ClientStackName + ClientMainScreenName)
    }

    return (
        <LoginSimpleScreen
            imageBackgroundSource={images.Backgrounds.AppBackground}
            style={{ width: "100%" }}
            unScrollableTopComponent={<TopCenteredLogoOtp />}
            unScrollableBottomComponent={
                <NextLoginButton
                    isProcessing={isPerforming}
                    buttonText="שליחה"
                    onPress={() => performRequest(phoneNumber, otpNumber)}
                    disabled={otpError != null}
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
                    title={"נא הקלד את הקוד"}
                    style={{ height: 56, width: "60%" }}
                    value={otpNumber}
                    onChange={handleInputChange}
                    maxLength={6}
                    textStyle={{ textAlign: 'center', letterSpacing: '8px' }}
                    error={otpError}
                />
            </SimpleContainer>
        </LoginSimpleScreen>
    );
}
