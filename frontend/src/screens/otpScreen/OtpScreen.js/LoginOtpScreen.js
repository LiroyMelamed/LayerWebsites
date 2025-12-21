import { useEffect, useRef } from "react";
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
    Customer: 'User'
}

export const LoginOtpScreenName = "/LoginOtpScreen";

export default function LoginOtpScreen() {
    const { otpNumber, setOtpNumber, otpError, phoneNumber } = useLoginVerifyOtpCodeFieldsProvider();
    const navigate = useNavigate();

    const didAutoSubmitRef = useRef(false);

    const { isPerforming, performRequest } = useHttpRequest(loginApi.verifyOtp, navigateTo);

    const handleInputChange = (event) => {
        const raw = event?.target?.value ?? "";
        const digitsOnly = String(raw).replace(/\D/g, "").slice(0, 6);
        setOtpNumber(digitsOnly);
    };

    useEffect(() => {
        // Web OTP API (mainly Android/Chrome). Requires HTTPS and SMS containing: "@domain #123456".
        if (didAutoSubmitRef.current) return;
        if (typeof window === "undefined") return;
        if (!("OTPCredential" in window)) return;
        if (!navigator?.credentials?.get) return;

        const abortController = new AbortController();

        (async () => {
            try {
                const cred = await navigator.credentials.get({
                    otp: { transport: ["sms"] },
                    signal: abortController.signal,
                });

                const code = String(cred?.code ?? "").replace(/\D/g, "").slice(0, 6);
                if (!code) return;

                setOtpNumber(code);

                if (code.length === 6 && phoneNumber && !didAutoSubmitRef.current) {
                    didAutoSubmitRef.current = true;
                    performRequest(phoneNumber, code);
                }
            } catch (err) {
                // Ignore abort / unsupported / user denied
            }
        })();

        return () => {
            abortController.abort();
        };
    }, [phoneNumber, performRequest, setOtpNumber]);

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
                    isPerforming={isPerforming}
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
                    timeToWaitInMilli={0}
                    maxLength={6}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    name="otp"
                    pattern="\\d*"
                    textStyle={{ textAlign: 'center', letterSpacing: '8px' }}
                    error={otpError}
                />
            </SimpleContainer>
        </LoginSimpleScreen>
    );
}
