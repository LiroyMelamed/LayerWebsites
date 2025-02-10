import { images } from "../../../assets/images/images";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";

export default function LoginSimpleScreen({ unScrollableTopComponent, unScrollableBottomComponent, children, style }) {
    return (
        <SimpleScreen
            imageBackgroundSource={images.Backgrounds.AppBackground}
            style={{ width: "100%", padding: '44px 20px', justifyContent: 'center', ...style }}
        >
            <SimpleScrollView style={{ flex: 1 }}>
                <SimpleContainer style={{ display: 'flex', height: '100%', flexDirection: 'column', justifyContent: 'space-between' }}>
                    {unScrollableTopComponent}
                    <SimpleContainer style={{ flex: 1 }}>
                        {children}
                    </SimpleContainer>
                    {unScrollableBottomComponent}
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleScreen>
    );
}
