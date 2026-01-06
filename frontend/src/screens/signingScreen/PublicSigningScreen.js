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

import "./PublicSigningScreen.scss";

export const PublicSigningScreenName = "/public-sign";

export default function PublicSigningScreen() {
    const location = useLocation();
    const navigate = useNavigate();

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
                        <TextBold24>קישור לא תקין</TextBold24>
                        <Text14>חסר פרמטר token בקישור.</Text14>
                        <PrimaryButton onPress={goToLogin}>חזרה</PrimaryButton>
                    </SimpleContainer>
                ) : closed ? (
                    <SimpleContainer className="lw-publicSigningScreen__stack">
                        <TextBold24>נסגר</TextBold24>
                        <Text14>ניתן לסגור את החלון.</Text14>
                    </SimpleContainer>
                ) : (
                    <SignatureCanvas
                        publicToken={token}
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
