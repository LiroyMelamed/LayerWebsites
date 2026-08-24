import { useLoginVerifyOtpCodeFieldsProvider } from "../../providers/LoginVerifyOtpCodeFieldsProvider";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import { LoginOtpScreenName } from "../otpScreen/OtpScreen.js/LoginOtpScreen";
import SimpleInput from "../../components/simpleComponents/SimpleInput";
import LoginSimpleScreen from "./components/LoginSimpleScreen";
import { LoginStackName } from "../../navigation/LoginStack";
import NextLoginButton from "./components/NextLoginButton";
import TopCenteredLogo from "./components/TopCenteredLogo";
import useHttpRequest from "../../hooks/useHttpRequest";
import PoweredByMela from "../../components/PoweredByMela";
import { images } from "../../assets/images/images";
import { useNavigate } from "react-router-dom";
import loginApi from "../../api/loginApi";
import { useTranslation } from "react-i18next";
import SimpleButton from "../../components/simpleComponents/SimpleButton";
import { Text14 } from "../../components/specializedComponents/text/AllTextKindFile";

import "./LoginScreen.scss";

export const LoginScreenName = "/LoginScreen";

export default function LoginScreen() {
    const {
        loginChannel,
        setLoginChannel,
        phoneNumber,
        setPhoneNumber,
        phoneNumberError,
        email,
        setEmail,
        emailError,
    } = useLoginVerifyOtpCodeFieldsProvider();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const { isPerforming, performRequest } = useHttpRequest(
        loginApi.sendOtp,
        () => navigate(LoginStackName + LoginOtpScreenName)
    );

    const handlePhoneChange = (event) => {
        const raw = event?.target?.value ?? "";
        const digitsOnly = String(raw).replace(/\D/g, "");

        let normalized = digitsOnly;
        if (normalized.startsWith("972") && normalized.length >= 11) {
            normalized = "0" + normalized.slice(3);
        }

        setPhoneNumber(normalized.slice(0, 10));
    };

    const handleSubmit = () => {
        if (loginChannel === "email") {
            performRequest({ email: String(email || "").trim().toLowerCase() });
            return;
        }
        performRequest({ phoneNumber });
    };

    const handleKeyDown = (event) => {
        const blocked = loginChannel === "email" ? emailError != null : phoneNumberError != null;
        if (event.key === "Enter" && !isPerforming && !blocked) {
            handleSubmit();
        }
    };

    const inputError = loginChannel === "email" ? emailError : phoneNumberError;

    return (
        <LoginSimpleScreen
            imageBackgroundSource={images.Backgrounds.AppBackground}
            unScrollableTopComponent={<TopCenteredLogo />}
            unScrollableBottomComponent={
                <>
                    <NextLoginButton
                        isPerforming={isPerforming}
                        buttonText={t('auth.login')}
                        onPress={handleSubmit}
                        disabled={inputError != null}
                    />
                    <PoweredByMela />
                </>
            }
        >
            <SimpleContainer className="lw-loginScreen__center">
                <SimpleContainer className="lw-loginScreen__channelSwitch">
                    <SimpleButton
                        className={`lw-loginScreen__channelBtn ${loginChannel === "phone" ? "is-active" : ""}`}
                        onPress={() => setLoginChannel("phone")}
                    >
                        <Text14>{t('auth.loginByPhone')}</Text14>
                    </SimpleButton>
                    <SimpleButton
                        className={`lw-loginScreen__channelBtn ${loginChannel === "email" ? "is-active" : ""}`}
                        onPress={() => setLoginChannel("email")}
                    >
                        <Text14>{t('auth.loginByEmail')}</Text14>
                    </SimpleButton>
                </SimpleContainer>

                {loginChannel === "email" ? (
                    <SimpleInput
                        title={t('auth.enterEmail')}
                        type="email"
                        className="lw-loginScreen__input"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={handleKeyDown}
                        error={emailError}
                        textStyle={{ textAlign: 'center' }}
                    />
                ) : (
                    <SimpleInput
                        title={t('auth.enterPhone')}
                        type="tel"
                        className="lw-loginScreen__input"
                        value={phoneNumber}
                        onChange={handlePhoneChange}
                        onKeyDown={handleKeyDown}
                        error={phoneNumberError}
                        textStyle={{ textAlign: 'center' }}
                        maxLength={10}
                    />
                )}
            </SimpleContainer>
        </LoginSimpleScreen>
    );
}
