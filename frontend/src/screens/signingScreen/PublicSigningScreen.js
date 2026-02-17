import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import { Text14, TextBold24 } from "../../components/specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../components/styledComponents/buttons/PrimaryButton";
import SignatureCanvas from "../../components/specializedComponents/signFiles/SignatureCanvas";
import { images } from "../../assets/images/images";
import { LoginStackName } from "../../navigation/LoginStack";
import { LoginScreenName } from "../loginScreen/LoginScreen";
import { useTranslation } from "react-i18next";

import "./PublicSigningScreen.scss";

export const PublicSignScreenName = "/PublicSignScreen";

export default function PublicSigningScreen() {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const token = useMemo(() => {
        const sp = new URLSearchParams(location.search);
        return sp.get("token") || sp.get("t") || "";
    }, [location.search]);

    const [closed, setClosed] = useState(false);

    const goToLogin = () => {
        navigate(LoginStackName + LoginScreenName, { replace: true });
    };

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            <SimpleContainer className="lw-publicSigningScreen__container">
                {!token ? (
                    <SimpleContainer className="lw-publicSigningScreen__stack">
                        <TextBold24>{t('signing.invalidLinkTitle')}</TextBold24>
                        <Text14>{t('signing.missingToken')}</Text14>
                        <PrimaryButton onPress={goToLogin}>{t('common.back')}</PrimaryButton>
                    </SimpleContainer>
                ) : closed ? (
                    <SimpleContainer className="lw-publicSigningScreen__stack">
                        <TextBold24>{t('signing.public.closedTitle')}</TextBold24>
                        <Text14>{t('signing.public.closedHint')}</Text14>
                    </SimpleContainer>
                ) : (
                    <SignatureCanvas
                        publicToken={token}
                        variant="screen"
                        onClose={() => {
                            setClosed(true);
                            goToLogin();
                        }}
                    />
                )}
            </SimpleContainer>
        </SimpleScreen>
    );
}
