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
import { useTranslation } from "react-i18next";
import { AppRoles } from "../../../constant/appRoles";

import "./LoginOtpScreen.scss";

export { AppRoles };

export const LoginOtpScreenName = "/LoginOtpScreen";

export default function LoginOtpScreen() {
    const {
        otpNumber,
        setOtpNumber,
        otpError,
        phoneNumber,
        email,
        loginChannel,
    } = useLoginVerifyOtpCodeFieldsProvider();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const otpInputRef = useRef(null);
    const didAutoSubmitRef = useRef(false);

    const { isPerforming, performRequest } = useHttpRequest(loginApi.verifyOtp, navigateTo);

    // Email login disabled for now (public signing only). Always verify by phone.
    const verifyPayload = () => ({ phoneNumber });
    // const verifyPayload = () => (
    //     loginChannel === "email"
    //         ? { email: String(email || "").trim().toLowerCase() }
    //         : { phoneNumber }
    // );

    const handleInputChange = (event) => {
        const raw = event?.target?.value ?? "";
        const digitsOnly = String(raw).replace(/\D/g, "").slice(0, 6);
        setOtpNumber(digitsOnly);
    };

    const submitOtp = (code) => {
        performRequest(verifyPayload(), code);
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !isPerforming && otpError == null) {
            submitOtp(otpNumber);
        }
    };

    useEffect(() => {
        if (isPerforming) return;
        const code = String(otpNumber || "").replace(/\D/g, "").slice(0, 6);
        if (code.length !== 6) {
            didAutoSubmitRef.current = false;
            return;
        }
        if (otpError != null) return;
        if (didAutoSubmitRef.current) return;
        if (!phoneNumber) return;
        // if (loginChannel === "email" ? !email : !phoneNumber) return;
        didAutoSubmitRef.current = true;
        submitOtp(code);
    }, [otpNumber, phoneNumber, email, loginChannel, isPerforming, otpError, performRequest]);

    useEffect(() => {
        if (didAutoSubmitRef.current) return;
        if (typeof window === "undefined") return;
        if (loginChannel === "email") return;
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
                    submitOtp(code);
                }
            } catch {
                // Ignore abort / unsupported / user denied
            }
        })();

        return () => {
            abortController.abort();
        };
    }, [phoneNumber, loginChannel, performRequest, setOtpNumber]);

    useEffect(() => {
        const id = setTimeout(() => {
            otpInputRef.current?.focus?.();
        }, 0);
        return () => clearTimeout(id);
    }, []);

    function navigateTo(data) {
        setOtpNumber('');
        localStorage.setItem("token", data.token);
        localStorage.setItem("role", data.role);
        localStorage.setItem("isPlatformAdmin", data.isPlatformAdmin ? "true" : "false");
        if (data.refreshToken) {
            localStorage.setItem("refreshToken", data.refreshToken);
        }

        if (data.role == AppRoles.Admin) navigate(AdminStackName + MainScreenName, { replace: true });
        else navigate(ClientStackName + ClientMainScreenName, { replace: true });
    }

    return (
        <LoginSimpleScreen
            imageBackgroundSource={images.Backgrounds.AppBackground}
            unScrollableTopComponent={<TopCenteredLogoOtp />}
            unScrollableBottomComponent={
                <NextLoginButton
                    isPerforming={isPerforming}
                    buttonText={t('common.send')}
                    onPress={() => submitOtp(otpNumber)}
                    disabled={otpError != null}
                />
            }
        >
            <SimpleContainer className="lw-loginOtpScreen__center">
                <SimpleInput
                    title={t('auth.enterOtp')}
                    className="lw-loginOtpScreen__input"
                    value={otpNumber}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    timeToWaitInMilli={0}
                    maxLength={6}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    inputRef={otpInputRef}
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    name="otp"
                    pattern="\\d*"
                    textStyle={{ textAlign: 'center', letterSpacing: '0.5rem' }}
                    error={otpError}
                />
            </SimpleContainer>
        </LoginSimpleScreen>
    );
}
