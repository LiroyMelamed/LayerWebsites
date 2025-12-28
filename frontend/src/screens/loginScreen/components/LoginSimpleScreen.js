import { images } from "../../../assets/images/images";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";

import "./LoginSimpleScreen.scss";

export default function LoginSimpleScreen({ unScrollableTopComponent, unScrollableBottomComponent, children, style }) {
    return (
        <SimpleScreen
            imageBackgroundSource={images.Backgrounds.AppBackground}
            contentClassName="lw-loginSimpleScreen__content"
            style={style}
        >
            <SimpleScrollView className="lw-loginSimpleScreen__scroll">
                <SimpleContainer className="lw-loginSimpleScreen__layout">
                    {unScrollableTopComponent}
                    <SimpleContainer className="lw-loginSimpleScreen__main">
                        {children}
                    </SimpleContainer>
                    {unScrollableBottomComponent}
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
